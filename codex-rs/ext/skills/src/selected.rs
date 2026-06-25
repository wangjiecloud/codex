use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::PoisonError;

use codex_core_plugins::SelectedCapabilityActivation;
use codex_core_plugins::SelectedCapabilitySnapshot;
use codex_extension_api::ExtensionDataInit;
use codex_extension_api::ExtensionFuture;
use codex_extension_api::RuntimeSnapshotContributor;
use codex_extension_api::ThreadExtensionInitContributor;
use tokio::sync::OnceCell;

use crate::catalog::SkillCatalog;
use crate::catalog::SkillProviderResult;
use crate::catalog::SkillReadResult;
use crate::provider::SkillListQuery;
use crate::provider::SkillReadRequest;
use crate::sources::ResolvedExecutorSkillCatalog;
use crate::sources::ResolvedExecutorSkillReader;
use crate::sources::SkillProviders;

#[derive(Clone, Default)]
pub(crate) struct SelectedExecutorSkillSnapshot {
    pub(crate) catalog: SkillCatalog,
    readers: HashMap<
        (
            crate::catalog::SkillAuthority,
            crate::catalog::SkillPackageId,
        ),
        ResolvedExecutorSkillReader,
    >,
}

impl SelectedExecutorSkillSnapshot {
    async fn read_skill(
        &self,
        request: SkillReadRequest,
    ) -> Option<SkillProviderResult<SkillReadResult>> {
        let reader = self
            .readers
            .get(&(request.authority.clone(), request.package.clone()))?;
        Some(reader.read(request).await)
    }
}

#[derive(Default)]
pub(crate) struct SelectedExecutorSkillSnapshotState {
    snapshot: Mutex<SelectedExecutorSkillSnapshot>,
}

impl SelectedExecutorSkillSnapshotState {
    pub(crate) fn snapshot(&self) -> SelectedExecutorSkillSnapshot {
        self.snapshot
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub(crate) async fn read_skill(
        &self,
        request: SkillReadRequest,
    ) -> Option<SkillProviderResult<SkillReadResult>> {
        self.snapshot().read_skill(request).await
    }

    fn publish(&self, snapshot: SelectedExecutorSkillSnapshot) {
        *self.snapshot.lock().unwrap_or_else(PoisonError::into_inner) = snapshot;
    }
}

#[derive(Default)]
struct SelectedExecutorSkillCache {
    catalogs: Mutex<HashMap<usize, Arc<OnceCell<ResolvedExecutorSkillCatalog>>>>,
}

impl SelectedExecutorSkillCache {
    fn catalog(&self, selection_order: usize) -> Arc<OnceCell<ResolvedExecutorSkillCatalog>> {
        Arc::clone(
            self.catalogs
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .entry(selection_order)
                .or_default(),
        )
    }
}

pub(crate) struct SelectedExecutorSkillSnapshotProvider {
    providers: SkillProviders,
}

impl SelectedExecutorSkillSnapshotProvider {
    pub(crate) fn new(providers: SkillProviders) -> Self {
        Self { providers }
    }

    async fn snapshot_for_selected_capabilities(
        &self,
        selected_capabilities: &SelectedCapabilitySnapshot,
        cache: &SelectedExecutorSkillCache,
    ) -> SelectedExecutorSkillSnapshot {
        for selected_root in selected_capabilities.ready() {
            let selected_root_id = selected_root.selected_root().id.clone();
            cache
                .catalog(selected_root.selection_order())
                .get_or_init(|| async {
                    self.providers
                        .list_resolved_executor_root(
                            SkillListQuery {
                                turn_id: selected_root_id,
                                executor_roots: vec![selected_root.selected_root().clone()],
                                host_snapshot: None,
                                include_host_skills: false,
                                include_bundled_skills: false,
                                include_orchestrator_skills: false,
                                mcp_resources: None,
                            },
                            selected_root.clone(),
                        )
                        .await
                })
                .await;
        }

        let mut catalog = SkillCatalog::default();
        let mut readers = HashMap::new();
        for selected_root in selected_capabilities.ready() {
            let root_cache = cache.catalog(selected_root.selection_order());
            let Some(root_catalog) = root_cache.get() else {
                continue;
            };
            catalog.extend(root_catalog.catalog.clone());
            for (key, reader) in &root_catalog.readers {
                readers.entry(key.clone()).or_insert_with(|| reader.clone());
            }
        }
        SelectedExecutorSkillSnapshot { catalog, readers }
    }
}

impl ThreadExtensionInitContributor for SelectedExecutorSkillSnapshotProvider {
    fn initialize<'a>(&'a self, thread_init: &'a mut ExtensionDataInit) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            let Some(activation) = thread_init.get::<SelectedCapabilityActivation>() else {
                return;
            };
            if thread_init
                .get::<SelectedExecutorSkillSnapshotState>()
                .is_none()
            {
                thread_init.insert(SelectedExecutorSkillSnapshotState::default());
            }
            if thread_init.get::<SelectedExecutorSkillCache>().is_none() {
                thread_init.insert(SelectedExecutorSkillCache::default());
            }
            let Some(state) = thread_init.get::<SelectedExecutorSkillSnapshotState>() else {
                return;
            };
            let Some(cache) = thread_init.get::<SelectedExecutorSkillCache>() else {
                return;
            };
            let selected_capabilities = activation.snapshot().selected_capabilities().clone();
            state.publish(
                self.snapshot_for_selected_capabilities(&selected_capabilities, cache.as_ref())
                    .await,
            );
        })
    }
}

impl RuntimeSnapshotContributor for SelectedExecutorSkillSnapshotProvider {
    fn prepare<'a>(&'a self, candidate: &'a mut ExtensionDataInit) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            let Some(activation) = candidate.get::<SelectedCapabilityActivation>() else {
                return;
            };
            candidate.insert(SelectedExecutorSkillSnapshotState::default());
            let Some(candidate_state) = candidate.get::<SelectedExecutorSkillSnapshotState>()
            else {
                return;
            };
            let Some(cache) = candidate.get::<SelectedExecutorSkillCache>() else {
                return;
            };
            let selected_capabilities = activation.snapshot().selected_capabilities().clone();
            candidate_state.publish(
                self.snapshot_for_selected_capabilities(&selected_capabilities, cache.as_ref())
                    .await,
            );
        })
    }

    fn commit(&self, candidate: &ExtensionDataInit, active: &ExtensionDataInit) {
        let Some(candidate_state) = candidate.get::<SelectedExecutorSkillSnapshotState>() else {
            return;
        };
        let Some(active_state) = active.get::<SelectedExecutorSkillSnapshotState>() else {
            return;
        };
        active_state.publish(candidate_state.snapshot());
    }
}
