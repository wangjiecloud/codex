use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

mod executor;
mod host;
mod orchestrator;

use codex_core_plugins::ResolvedSelectedCapabilityRoot;
use codex_core_skills::HostSkillsSnapshot;
use codex_mcp::McpResourceClient;
use codex_protocol::capabilities::SelectedCapabilityRoot;

use crate::catalog::SkillAuthority;
use crate::catalog::SkillCatalog;
use crate::catalog::SkillPackageId;
use crate::catalog::SkillProviderResult;
use crate::catalog::SkillReadResult;
use crate::catalog::SkillResourceId;
use crate::catalog::SkillSearchResult;

pub use executor::ExecutorSkillProvider;
pub use host::HostSkillProvider;
pub use orchestrator::OrchestratorSkillProvider;

#[derive(Clone, Debug)]
pub struct SkillListQuery {
    pub turn_id: String,
    pub executor_roots: Vec<SelectedCapabilityRoot>,
    pub host_snapshot: Option<Arc<HostSkillsSnapshot>>,
    pub include_host_skills: bool,
    pub include_bundled_skills: bool,
    pub include_orchestrator_skills: bool,
    pub mcp_resources: Option<Arc<McpResourceClient>>,
}

#[derive(Clone, Debug)]
pub struct SkillReadRequest {
    pub authority: SkillAuthority,
    pub package: SkillPackageId,
    pub resource: SkillResourceId,
    pub host_snapshot: Option<Arc<HostSkillsSnapshot>>,
    pub mcp_resources: Option<Arc<McpResourceClient>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SkillSearchRequest {
    pub authority: SkillAuthority,
    pub package: SkillPackageId,
    pub query: String,
}

pub type SkillProviderFuture<'a, T> =
    Pin<Box<dyn Future<Output = SkillProviderResult<T>> + Send + 'a>>;

/// Source-specific skill catalog and resource access.
///
/// Implementations must preserve authority boundaries: a resource listed by a
/// provider must be read or searched through the same provider/authority rather
/// than converted into an ambient local path.
pub trait SkillProvider: Send + Sync {
    fn list(&self, query: SkillListQuery) -> SkillProviderFuture<'_, SkillCatalog>;

    /// Lists one root through the exact executor instance that bound it.
    ///
    /// Providers that do not depend on executor identity may use the default implementation.
    fn list_resolved_executor_root(
        &self,
        query: SkillListQuery,
        _selected_root: ResolvedSelectedCapabilityRoot,
    ) -> SkillProviderFuture<'_, SkillCatalog> {
        self.list(query)
    }

    /// Reads a resource through the same provider and executor binding used for listing.
    ///
    /// Providers that own opaque resources may use the default provider-routed implementation.
    fn read_resolved_executor_skill(
        &self,
        request: SkillReadRequest,
        _selected_root: ResolvedSelectedCapabilityRoot,
    ) -> SkillProviderFuture<'_, SkillReadResult> {
        self.read(request)
    }

    fn read(&self, request: SkillReadRequest) -> SkillProviderFuture<'_, SkillReadResult>;

    fn search(&self, request: SkillSearchRequest) -> SkillProviderFuture<'_, SkillSearchResult>;
}
