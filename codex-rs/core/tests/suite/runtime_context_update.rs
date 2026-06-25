use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

use anyhow::Result;
use codex_context_fragments::AdditionalContextDeveloperFragment;
use codex_core::config::Config;
use codex_extension_api::ContextualUserFragment;
use codex_extension_api::ExtensionData;
use codex_extension_api::ExtensionFuture;
use codex_extension_api::ExtensionRegistryBuilder;
use codex_extension_api::TurnInputContext;
use codex_extension_api::TurnInputContributor;
use codex_features::Feature;
use codex_protocol::items::TurnItem;
use codex_protocol::protocol::EventMsg;
use codex_protocol::protocol::Op;
use codex_protocol::user_input::UserInput;
use core_test_support::responses;
use core_test_support::test_codex::test_codex;
use core_test_support::wait_for_event;
use pretty_assertions::assert_eq;

const RUNTIME_UPDATE_MARKER: &str = "runtime snapshot context";
const STEER_PROMPT: &str = "use the late skill";

struct RuntimeUpdateContributor {
    emitted: AtomicBool,
}

impl TurnInputContributor for RuntimeUpdateContributor {
    fn contribute<'a>(
        &'a self,
        _input: TurnInputContext,
        _session_store: &'a ExtensionData,
        _thread_store: &'a ExtensionData,
        _turn_store: &'a ExtensionData,
    ) -> ExtensionFuture<'a, Vec<Box<dyn ContextualUserFragment + Send>>> {
        Box::pin(async { Vec::new() })
    }

    fn contribute_runtime_update<'a>(
        &'a self,
        input: TurnInputContext,
        _session_store: &'a ExtensionData,
        _thread_store: &'a ExtensionData,
        _turn_store: &'a ExtensionData,
    ) -> ExtensionFuture<'a, Vec<Box<dyn ContextualUserFragment + Send>>> {
        Box::pin(async move {
            let saw_steer = input
                .user_input
                .iter()
                .any(|input| matches!(input, UserInput::Text { text, .. } if text == STEER_PROMPT));
            if !saw_steer {
                return Vec::new();
            }
            if self.emitted.swap(true, Ordering::Relaxed) {
                return Vec::new();
            }
            let fragment: Box<dyn ContextualUserFragment + Send> =
                Box::new(AdditionalContextDeveloperFragment::new(
                    "runtime_update".to_string(),
                    RUNTIME_UPDATE_MARKER.to_string(),
                ));
            vec![fragment]
        })
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pending_steer_receives_incremental_runtime_context() -> Result<()> {
    let server = responses::start_mock_server().await;
    let response_mock = responses::mount_sse_sequence(
        &server,
        vec![
            responses::sse(vec![
                responses::ev_response_created("resp-1"),
                responses::ev_function_call("sleep-1", "sleep", r#"{"duration_ms":60000}"#),
                responses::ev_completed("resp-1"),
            ]),
            responses::sse(vec![
                responses::ev_response_created("resp-2"),
                responses::ev_assistant_message("msg-1", "done"),
                responses::ev_completed("resp-2"),
            ]),
        ],
    )
    .await;
    let mut extension_builder = ExtensionRegistryBuilder::<Config>::new();
    extension_builder.turn_input_contributor(Arc::new(RuntimeUpdateContributor {
        emitted: AtomicBool::new(false),
    }));
    let mut builder = test_codex()
        .with_extensions(Arc::new(extension_builder.build()))
        .with_config(|config| {
            config
                .features
                .enable(Feature::SleepTool)
                .expect("sleep tool feature should be available");
        });
    let test = builder.build_with_auto_env(&server).await?;

    test.codex
        .submit(Op::UserInput {
            items: vec![UserInput::Text {
                text: "wait for more input".to_string(),
                text_elements: Vec::new(),
            }],
            final_output_json_schema: None,
            responsesapi_client_metadata: None,
            additional_context: Default::default(),
            thread_settings: Default::default(),
        })
        .await?;
    wait_for_event(&test.codex, |event| {
        matches!(
            event,
            EventMsg::ItemStarted(started)
                if matches!(&started.item, TurnItem::Sleep(item) if item.id == "sleep-1")
        )
    })
    .await;
    test.codex
        .steer_input(
            vec![UserInput::Text {
                text: STEER_PROMPT.to_string(),
                text_elements: Vec::new(),
            }],
            /*additional_context*/ Default::default(),
            /*expected_turn_id*/ None,
            /*client_user_message_id*/ None,
            /*responsesapi_client_metadata*/ None,
        )
        .await
        .expect("steer input");
    wait_for_event(&test.codex, |event| {
        matches!(event, EventMsg::TurnComplete(_))
    })
    .await;

    let requests = response_mock.requests();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests
            .iter()
            .map(|request| {
                request
                    .message_input_texts("developer")
                    .iter()
                    .any(|text| text.contains(RUNTIME_UPDATE_MARKER))
            })
            .collect::<Vec<_>>(),
        vec![false, true]
    );

    Ok(())
}
