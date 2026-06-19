//! Lifecycle-local persistence and serialized refresh transactions for MCP OAuth credentials.

use std::sync::Arc;
use std::time::Duration;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

use anyhow::Context;
use anyhow::Result;
use codex_keyring_store::DefaultKeyringStore;
use codex_keyring_store::KeyringStore;
use oauth2::TokenResponse;
use rmcp::transport::auth::AuthorizationManager;
use rmcp::transport::auth::CredentialStore as _;
use rmcp::transport::auth::InMemoryCredentialStore;
use rmcp::transport::auth::OAuthTokenResponse;
use rmcp::transport::auth::StoredCredentials;
use tokio::sync::Mutex;
use tokio::time::timeout;

use super::ResolvedOAuthCredentialStore;
use super::StoredOAuthTokens;
use super::WrappedOAuthTokenResponse;
use super::compute_expires_at_millis;
use super::load_oauth_tokens_from_file;
use super::load_oauth_tokens_from_keyring;
use super::refresh_lock::RefreshCredentialLock;
use super::save_oauth_tokens_to_file;
use super::save_oauth_tokens_with_keyring;
use super::token_needs_refresh;

const REFRESH_REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Clone)]
pub(crate) struct OAuthPersistor {
    inner: Arc<OAuthPersistorInner>,
}
struct OAuthPersistorInner {
    server_name: String,
    url: String,
    authorization_manager: Arc<Mutex<AuthorizationManager>>,
    credential_store: ResolvedOAuthCredentialStore,
    last_credentials: Mutex<Option<StoredOAuthTokens>>,
}

impl OAuthPersistor {
    pub(crate) fn new(
        server_name: String,
        url: String,
        authorization_manager: Arc<Mutex<AuthorizationManager>>,
        credential_store: ResolvedOAuthCredentialStore,
        initial_credentials: Option<StoredOAuthTokens>,
    ) -> Self {
        Self {
            inner: Arc::new(OAuthPersistorInner {
                server_name,
                url,
                authorization_manager,
                credential_store,
                last_credentials: Mutex::new(initial_credentials),
            }),
        }
    }

    fn load_resolved_credentials<K: KeyringStore + Clone + 'static>(
        &self,
        keyring_store: &K,
    ) -> Result<Option<StoredOAuthTokens>> {
        match self.inner.credential_store {
            ResolvedOAuthCredentialStore::File => {
                load_oauth_tokens_from_file(&self.inner.server_name, &self.inner.url)
                    .context("failed to reread OAuth tokens from resolved file storage")
            }
            ResolvedOAuthCredentialStore::Keyring(keyring_backend_kind) => {
                load_oauth_tokens_from_keyring(
                    keyring_store,
                    keyring_backend_kind,
                    &self.inner.server_name,
                    &self.inner.url,
                )
                .context(
                    "failed to reread OAuth tokens from resolved keyring storage; refusing file fallback",
                )
            }
        }
    }

    pub(crate) async fn refresh_if_needed(&self) -> Result<()> {
        self.refresh_if_needed_with_keyring_store(&DefaultKeyringStore)
            .await
    }

    pub(crate) async fn refresh_after_unauthorized(&self) -> Result<()> {
        self.refresh_after_unauthorized_with_keyring_store(&DefaultKeyringStore)
            .await
    }

    pub(super) async fn refresh_if_needed_with_keyring_store<K: KeyringStore + Clone + 'static>(
        &self,
        keyring_store: &K,
    ) -> Result<()> {
        self.refresh_if_needed_with_keyring_store_and_timeout(
            keyring_store,
            REFRESH_REQUEST_TIMEOUT,
        )
        .await
    }

    pub(super) async fn refresh_if_needed_with_keyring_store_and_timeout<K: KeyringStore + Clone + 'static>(
        &self,
        keyring_store: &K,
        refresh_request_timeout: Duration,
    ) -> Result<()> {
        let expires_at = {
            let guard = self.inner.last_credentials.lock().await;
            guard.as_ref().and_then(|tokens| tokens.expires_at)
        };

        if !token_needs_refresh(expires_at) {
            return Ok(());
        }

        self.refresh_transaction(
            keyring_store,
            RefreshReason::Expiry,
            refresh_request_timeout,
        )
        .await
    }

    pub(super) async fn refresh_after_unauthorized_with_keyring_store<K: KeyringStore + Clone + 'static>(
        &self,
        keyring_store: &K,
    ) -> Result<()> {
        self.refresh_transaction(
            keyring_store,
            RefreshReason::Unauthorized,
            REFRESH_REQUEST_TIMEOUT,
        )
        .await
    }

    #[expect(
        clippy::await_holding_invalid_type,
        reason = "AuthorizationManager async access must be serialized through its mutex"
    )]
    async fn refresh_transaction<K: KeyringStore + Clone + 'static>(
        &self,
        keyring_store: &K,
        reason: RefreshReason,
        refresh_request_timeout: Duration,
    ) -> Result<()> {
        let local_access_token = {
            let last_credentials = self.inner.last_credentials.lock().await;
            last_credentials
                .as_ref()
                .map(|tokens| tokens.token_response.0.access_token().secret().to_string())
        };

        let _lock =
            RefreshCredentialLock::acquire_for_server(&self.inner.server_name, &self.inner.url)
                .await?;
        // The refresh transaction must stay on the store that supplied its snapshot. Falling back
        // here could replay an older rotating refresh token from the other store. We assume store
        // availability is stable for this client lifecycle and surface violations of that
        // assumption instead of switching stores.
        let latest = self.load_resolved_credentials(keyring_store)?;

        // The pre-lock snapshot only decides whether a refresh transaction might be needed. Once
        // the lock is held, this reread is authoritative: adopt it before deciding whether to
        // refresh so this process never sends a refresh token superseded by another process.
        let Some(latest) = latest else {
            self.clear_manager_credentials().await;
            let mut last_credentials = self.inner.last_credentials.lock().await;
            *last_credentials = None;
            anyhow::bail!(
                "OAuth tokens for server {} were removed before refresh; authorization required",
                self.inner.server_name
            );
        };

        let latest_access_token = latest.token_response.0.access_token().secret();
        // Expiry refresh can adopt any reread that is now healthy. A 401 is different: an
        // unexpired token is still rejected, so adopt only when another actor has already changed
        // the access token; otherwise force one serialized provider refresh.
        let should_adopt = !token_needs_refresh(latest.expires_at)
            && match reason {
                RefreshReason::Expiry => true,
                RefreshReason::Unauthorized => {
                    local_access_token.as_deref() != Some(latest_access_token)
                }
            };
        if should_adopt {
            self.adopt_credentials(latest).await?;
            return Ok(());
        }

        let manager = self.inner.authorization_manager.clone();
        let mut guard = manager.lock().await;
        if let Err(error) =
            install_tokens_in_manager_guard(&mut guard, &latest, CredentialExposure::Refresh).await
        {
            install_tokens_in_manager_guard(&mut guard, &latest, CredentialExposure::Request)
                .await
                .context("failed to restore request-only OAuth credentials")?;
            return Err(error).context("failed to stage OAuth credentials for refresh");
        }
        // The provider request has its own bound. Caller startup and operation deadlines must not
        // cancel this future after the provider may have rotated the refresh token.
        let refresh_result = match timeout(refresh_request_timeout, guard.refresh_token()).await {
            Ok(Ok(token_response)) => Ok(refreshed_tokens(token_response, &latest, &self.inner)),
            Ok(Err(error)) => Err(error).with_context(|| {
                format!(
                    "failed to refresh OAuth tokens for server {}",
                    self.inner.server_name
                )
            }),
            Err(_) => Err(anyhow::anyhow!(
                "timed out after {refresh_request_timeout:?} refreshing OAuth tokens for server {}",
                self.inner.server_name
            )),
        };
        let request_tokens = refresh_result.as_ref().unwrap_or(&latest);
        if let Err(error) =
            install_tokens_in_manager_guard(&mut guard, request_tokens, CredentialExposure::Request)
                .await
        {
            return Err(error).context("failed to restore request-only OAuth credentials");
        }
        drop(guard);

        let refreshed = refresh_result?;
        // Once the provider rotates a refresh token, persistence must complete even if the caller's
        // deadline expires in the meantime. Returning early here would lose the only usable token.
        // Refresh persistence stays on the source resolved at client startup. In particular, a
        // keyring failure must surface instead of writing the rotated token to fallback File.
        match self.inner.credential_store {
            ResolvedOAuthCredentialStore::File => save_oauth_tokens_to_file(&refreshed)?,
            ResolvedOAuthCredentialStore::Keyring(keyring_backend_kind) => {
                save_oauth_tokens_with_keyring(
                    keyring_store,
                    keyring_backend_kind,
                    &self.inner.server_name,
                    &refreshed,
                )?;
            }
        }
        let mut last_credentials = self.inner.last_credentials.lock().await;
        *last_credentials = Some(refreshed);
        Ok(())
    }

    async fn adopt_credentials(&self, tokens: StoredOAuthTokens) -> Result<()> {
        install_tokens_in_manager(&self.inner.authorization_manager, &tokens).await?;
        let mut last_credentials = self.inner.last_credentials.lock().await;
        *last_credentials = Some(tokens);
        Ok(())
    }

    async fn clear_manager_credentials(&self) {
        let manager = self.inner.authorization_manager.clone();
        let mut guard = manager.lock().await;
        guard.set_credential_store(InMemoryCredentialStore::new());
    }
}

#[derive(Clone, Copy)]
enum RefreshReason {
    Expiry,
    Unauthorized,
}
#[expect(
    clippy::await_holding_invalid_type,
    reason = "AuthorizationManager async access must be serialized through its mutex"
)]
async fn install_tokens_in_manager(
    authorization_manager: &Arc<Mutex<AuthorizationManager>>,
    tokens: &StoredOAuthTokens,
) -> Result<()> {
    let manager = authorization_manager.clone();
    let mut guard = manager.lock().await;
    install_tokens_in_manager_guard(&mut guard, tokens, CredentialExposure::Request).await
}

async fn install_tokens_in_manager_guard(
    authorization_manager: &mut AuthorizationManager,
    tokens: &StoredOAuthTokens,
    exposure: CredentialExposure,
) -> Result<()> {
    let store = InMemoryCredentialStore::new();
    store
        .save(stored_credentials_from_tokens(tokens, exposure))
        .await
        .context("failed to stage OAuth tokens for authorization manager")?;

    authorization_manager.set_credential_store(store);
    // TODO(stevenlee): RMCP's `initialize_from_store` updates the credential store and client ID
    // but not its private `current_scopes`. Credential adoption can therefore leave scope-upgrade
    // state stale until RMCP exposes an adoption API that synchronizes both.
    authorization_manager
        .initialize_from_store()
        .await
        .context("failed to adopt refreshed OAuth tokens")?;
    Ok(())
}

/// Controls which credentials are exposed to RMCP's authorization manager.
///
/// Normal requests receive neither the refresh token nor expiry metadata, so RMCP cannot refresh
/// outside Codex's cross-process transaction. Full credentials are exposed only while that lock is
/// held, and request-only credentials are restored before the transaction returns unless that
/// restoration itself fails.
#[derive(Clone, Copy)]
enum CredentialExposure {
    Request,
    Refresh,
}

fn stored_credentials_from_tokens(
    tokens: &StoredOAuthTokens,
    exposure: CredentialExposure,
) -> StoredCredentials {
    let token_response = match exposure {
        CredentialExposure::Request => request_oauth_token_response(tokens),
        CredentialExposure::Refresh => tokens.token_response.0.clone(),
    };
    let granted_scopes = token_response
        .scopes()
        .map(|scopes| scopes.iter().map(|scope| scope.to_string()).collect())
        .unwrap_or_default();
    let token_received_at = match exposure {
        CredentialExposure::Request => None,
        CredentialExposure::Refresh => SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|duration| duration.as_secs()),
    };

    StoredCredentials::new(
        tokens.client_id.clone(),
        Some(token_response),
        granted_scopes,
        token_received_at,
    )
}

pub(crate) fn request_oauth_token_response(tokens: &StoredOAuthTokens) -> OAuthTokenResponse {
    let mut token_response = tokens.token_response.0.clone();
    token_response.set_refresh_token(None);
    token_response.set_expires_in(None);
    token_response
}

fn refreshed_tokens(
    mut token_response: OAuthTokenResponse,
    previous: &StoredOAuthTokens,
    inner: &OAuthPersistorInner,
) -> StoredOAuthTokens {
    if token_response.refresh_token().is_none() {
        token_response.set_refresh_token(previous.token_response.0.refresh_token().cloned());
    }
    if token_response.scopes().is_none() {
        token_response.set_scopes(previous.token_response.0.scopes().cloned());
    }
    let expires_at = compute_expires_at_millis(&token_response);
    StoredOAuthTokens {
        server_name: inner.server_name.clone(),
        url: inner.url.clone(),
        client_id: previous.client_id.clone(),
        token_response: WrappedOAuthTokenResponse(token_response),
        expires_at,
    }
}
