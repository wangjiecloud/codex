use std::time::Duration;

use anyhow::Result;
use app_test_support::TestAppServer;
use app_test_support::to_response;
use codex_app_server_protocol::CapabilityRootLocation;
use codex_app_server_protocol::JSONRPCResponse;
use codex_app_server_protocol::RequestId;
use codex_app_server_protocol::SelectedCapabilityRoot;
use codex_app_server_protocol::ThreadForkParams;
use codex_app_server_protocol::ThreadForkResponse;
use codex_app_server_protocol::ThreadResumeParams;
use codex_app_server_protocol::ThreadResumeResponse;
use codex_app_server_protocol::ThreadStartParams;
use codex_app_server_protocol::ThreadStartResponse;
use codex_app_server_protocol::TurnStartParams;
use codex_app_server_protocol::UserInput;
use codex_exec_server::CreateDirectoryOptions;
use core_test_support::responses;
use core_test_support::test_codex::test_env;
use tempfile::TempDir;
use tokio::time::Instant;
use tokio::time::sleep;
use tokio::time::timeout;

const READ_TIMEOUT: Duration = Duration::from_secs(10);
const SKILL_NAME: &str = "demo-plugin:deploy";
const SKILL_MARKER: &str = "EXECUTOR_SKILL_BODY_MARKER";
const LOCAL_SKILL_MARKER: &str = "LOCAL_SKILL_BODY_MARKER";

#[tokio::test]
async fn selected_executor_root_exposes_plugin_skill() -> Result<()> {
    let server = responses::start_mock_server().await;
    let codex_home = TempDir::new()?;
    std::fs::write(
        codex_home.path().join("config.toml"),
        format!(
            r#"
model = "mock-model"
approval_policy = "never"
sandbox_mode = "read-only"
model_provider = "mock_provider"

[skills]
include_instructions = true

[model_providers.mock_provider]
name = "Mock provider for test"
base_url = "{}/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
"#,
            server.uri()
        ),
    )?;
    let local_skill_dir = codex_home.path().join("skills/local-deploy");
    std::fs::create_dir_all(&local_skill_dir)?;
    std::fs::write(
        local_skill_dir.join("SKILL.md"),
        format!(
            "---\nname: {SKILL_NAME}\ndescription: Colliding local skill.\n---\n\n# Local deploy\n\n{LOCAL_SKILL_MARKER}\n"
        ),
    )?;
    let executor_fixture = test_env().await?;
    let executor_file_system = executor_fixture.environment().get_filesystem();
    let plugin_root = executor_fixture.selection().cwd.join("demo-plugin")?;
    let manifest_dir = plugin_root.join(".codex-plugin")?;
    let skill_dir = plugin_root.join("skills/deploy")?;
    executor_file_system
        .create_directory(
            &manifest_dir,
            CreateDirectoryOptions { recursive: true },
            /*sandbox*/ None,
        )
        .await?;
    executor_file_system
        .create_directory(
            &skill_dir,
            CreateDirectoryOptions { recursive: true },
            /*sandbox*/ None,
        )
        .await?;
    executor_file_system
        .write_file(
            &manifest_dir.join("plugin.json")?,
            br#"{"name":"demo-plugin"}"#.to_vec(),
            /*sandbox*/ None,
        )
        .await?;
    executor_file_system
        .write_file(
            &skill_dir.join("SKILL.md")?,
            format!(
            "---\nname: deploy\ndescription: Deploy through the executor.\n---\n\n# Deploy\n\n{SKILL_MARKER}\n"
            )
            .into_bytes(),
            /*sandbox*/ None,
        )
        .await?;

    let mut app_server = TestAppServer::new_with_auto_env(codex_home.path()).await?;
    timeout(READ_TIMEOUT, app_server.initialize()).await??;
    let environment_id = app_server.auto_env_params()?.environment_id;
    let request_id = app_server
        .send_thread_start_request_with_auto_env(ThreadStartParams {
            model: Some("mock-model".to_string()),
            selected_capability_roots: Some(vec![SelectedCapabilityRoot {
                id: "demo-plugin@1".to_string(),
                location: CapabilityRootLocation::Environment {
                    environment_id,
                    path: plugin_root,
                },
            }]),
            ..Default::default()
        })
        .await?;
    let response: JSONRPCResponse = timeout(
        READ_TIMEOUT,
        app_server.read_stream_until_response_message(RequestId::Integer(request_id)),
    )
    .await??;
    let ThreadStartResponse { thread, .. } = to_response(response)?;
    let thread_id = thread.id;

    activate_selected_skill(&mut app_server, &server, &thread_id, "initial", 1).await?;

    let request_id = app_server
        .send_thread_fork_request(ThreadForkParams {
            thread_id: thread_id.clone(),
            ..Default::default()
        })
        .await?;
    let response = timeout(
        READ_TIMEOUT,
        app_server.read_stream_until_response_message(RequestId::Integer(request_id)),
    )
    .await??;
    let ThreadForkResponse {
        thread: forked_thread,
        ..
    } = to_response(response)?;
    let forked_thread_id = forked_thread.id;
    activate_selected_skill(&mut app_server, &server, &forked_thread_id, "fork", 2).await?;

    drop(app_server);
    let mut app_server = TestAppServer::new_with_auto_env(codex_home.path()).await?;
    timeout(READ_TIMEOUT, app_server.initialize()).await??;
    resume_and_activate_selected_skill(&mut app_server, &server, &thread_id, "resume-original", 2)
        .await?;
    resume_and_activate_selected_skill(
        &mut app_server,
        &server,
        &forked_thread_id,
        "resume-fork",
        3,
    )
    .await?;

    Ok(())
}

async fn activate_selected_skill(
    app_server: &mut TestAppServer,
    server: &wiremock::MockServer,
    thread_id: &str,
    response_prefix: &str,
    expected_skill_fragment_count: usize,
) -> Result<()> {
    let activation_deadline = Instant::now() + READ_TIMEOUT;
    let mut attempt = 0;
    let request = loop {
        let response_id = format!("resp-selected-{response_prefix}-{attempt}");
        let response_mock = responses::mount_sse_once(
            server,
            responses::sse(vec![
                responses::ev_response_created(&response_id),
                responses::ev_assistant_message(&format!("{response_id}-message"), "Done"),
                responses::ev_completed(&response_id),
            ]),
        )
        .await;
        let request_id = app_server
            .send_turn_start_request(TurnStartParams {
                thread_id: thread_id.to_string(),
                input: vec![UserInput::Text {
                    text: format!("Use ${SKILL_NAME}"),
                    text_elements: Vec::new(),
                }],
                ..Default::default()
            })
            .await?;
        timeout(
            READ_TIMEOUT,
            app_server.read_stream_until_response_message(RequestId::Integer(request_id)),
        )
        .await??;
        timeout(
            READ_TIMEOUT,
            app_server.read_stream_until_notification_message("turn/completed"),
        )
        .await??;
        let request = response_mock.single_request();
        if request
            .message_input_texts("user")
            .iter()
            .filter(|text| text.starts_with("<skill>") && text.contains(SKILL_MARKER))
            .count()
            >= expected_skill_fragment_count
        {
            break request;
        }
        if Instant::now() >= activation_deadline {
            anyhow::bail!("selected executor skill did not activate before the deadline");
        }
        attempt += 1;
        sleep(Duration::from_millis(100)).await;
    };
    assert!(
        request
            .message_input_texts("developer")
            .iter()
            .any(|text| text.contains(SKILL_NAME))
    );
    let skill_fragments = request
        .message_input_texts("user")
        .into_iter()
        .filter(|text| text.starts_with("<skill>") && text.contains(SKILL_MARKER))
        .collect::<Vec<_>>();
    assert_eq!(skill_fragments.len(), expected_skill_fragment_count);
    let skill_fragment = skill_fragments
        .last()
        .expect("executor skill instructions should be model-visible");
    assert!(skill_fragment.contains(&format!("<name>{SKILL_NAME}</name>")));
    assert!(skill_fragment.contains(SKILL_MARKER));
    assert!(!skill_fragment.contains(LOCAL_SKILL_MARKER));

    Ok(())
}

async fn resume_and_activate_selected_skill(
    app_server: &mut TestAppServer,
    server: &wiremock::MockServer,
    thread_id: &str,
    response_prefix: &str,
    expected_skill_fragment_count: usize,
) -> Result<()> {
    let request_id = app_server
        .send_thread_resume_request(ThreadResumeParams {
            thread_id: thread_id.to_string(),
            ..Default::default()
        })
        .await?;
    let response = timeout(
        READ_TIMEOUT,
        app_server.read_stream_until_response_message(RequestId::Integer(request_id)),
    )
    .await??;
    let ThreadResumeResponse { thread, .. } = to_response(response)?;
    assert_eq!(thread.id, thread_id);
    activate_selected_skill(
        app_server,
        server,
        thread_id,
        response_prefix,
        expected_skill_fragment_count,
    )
    .await
}
