/// Chat Completions wire API client.
///
/// Translates a `ResponsesApiRequest` into a standard OpenAI `/v1/chat/completions`
/// streaming request and maps the SSE response back into the canonical
/// `ResponseEvent` stream consumed by the rest of the codex engine.
///
/// This is intentionally minimal: it only handles the subset of Responses API
/// features that map cleanly onto Chat Completions (text content, function/tool
/// calls).  Provider-specific extensions (reasoning, multi-agent namespaces,
/// web search tool type, etc.) are silently dropped so that the request is
/// accepted by vanilla OpenAI-compatible proxies such as LiteLLM.
use crate::auth::SharedAuthProvider;
use crate::common::ResponseStream;
use crate::common::ResponsesApiRequest;
use crate::endpoint::session::EndpointSession;
use crate::error::ApiError;
use crate::provider::Provider;
use crate::requests::headers::insert_header;
use codex_client::EncodedJsonBody;
use codex_client::HttpTransport;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::TokenUsage;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use http::HeaderMap;
use http::HeaderValue;
use http::Method;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::timeout;
use tracing::debug;
use tracing::trace;

use super::super::common::ResponseEvent;

// ── Request types ────────────────────────────────────────────────────────────

/// A Chat Completions message sent to the API.
#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ChatToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Serialize)]
struct ChatToolCall {
    id: String,
    r#type: String,
    function: ChatToolCallFunction,
}

#[derive(Debug, Serialize)]
struct ChatToolCallFunction {
    name: String,
    arguments: String,
}

/// The subset of tool definitions that Chat Completions accepts.
/// Only `function` type tools are forwarded; all others (namespace, web_search, …)
/// are silently dropped.
#[derive(Debug, Serialize)]
struct ChatTool {
    r#type: String,
    function: ChatToolFunction,
}

#[derive(Debug, Serialize)]
struct ChatToolFunction {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    strict: Option<bool>,
}

#[derive(Debug, Serialize)]
struct ChatCompletionsRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ChatTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<Value>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream_options: Option<ChatStreamOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parallel_tool_calls: Option<bool>,
}

#[derive(Debug, Serialize)]
struct ChatStreamOptions {
    include_usage: bool,
}

// ── SSE response types ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ChatChunk {
    id: Option<String>,
    choices: Vec<ChatChoice>,
    #[serde(default)]
    usage: Option<ChatUsage>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    delta: ChatDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatDelta {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<ChatDeltaToolCall>>,
}

#[derive(Debug, Deserialize)]
struct ChatDeltaToolCall {
    index: usize,
    id: Option<String>,
    function: Option<ChatDeltaFunction>,
}

#[derive(Debug, Deserialize)]
struct ChatDeltaFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatUsage {
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
}

impl From<ChatUsage> for TokenUsage {
    fn from(u: ChatUsage) -> Self {
        TokenUsage {
            input_tokens: u.prompt_tokens,
            cached_input_tokens: 0,
            output_tokens: u.completion_tokens,
            reasoning_output_tokens: 0,
            total_tokens: u.total_tokens,
        }
    }
}

// ── Request conversion ────────────────────────────────────────────────────────

/// Convert a `ResponsesApiRequest` into a `ChatCompletionsRequest`.
///
/// * `instructions` is prepended as a `system` message.
/// * Each `ResponseItem` in `input` is mapped to one or more `ChatMessage`s.
/// * Tool definitions of type `function` are forwarded; all other types are
///   dropped (this is the primary reason for using this wire API – it avoids
///   sending unsupported tool types such as `namespace` or `web_search`).
fn to_chat_request(req: &ResponsesApiRequest) -> ChatCompletionsRequest {
    let mut messages: Vec<ChatMessage> = Vec::new();

    // System prompt from `instructions`
    if !req.instructions.is_empty() {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: Some(Value::String(req.instructions.clone())),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        });
    }

    // Convert each ResponseItem
    for item in &req.input {
        convert_response_item(item, &mut messages);
    }

    // Filter tools to `function` type only
    let tools: Option<Vec<ChatTool>> = req.tools.as_ref().and_then(|tools| {
        let filtered: Vec<ChatTool> = tools
            .iter()
            .filter_map(|t| {
                let kind = t.get("type").and_then(Value::as_str)?;
                if kind != "function" {
                    trace!("chat_completions: dropping non-function tool type={kind}");
                    return None;
                }
                let func = t.get("function")?;
                Some(ChatTool {
                    r#type: "function".to_string(),
                    function: ChatToolFunction {
                        name: func
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        description: func
                            .get("description")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        parameters: func.get("parameters").cloned(),
                        strict: func.get("strict").and_then(Value::as_bool),
                    },
                })
            })
            .collect();
        if filtered.is_empty() { None } else { Some(filtered) }
    });

    // Map tool_choice: "auto" / "none" / "required" pass through; otherwise default to "auto"
    let tool_choice = if tools.is_some() {
        let tc = req.tool_choice.as_str();
        let v = match tc {
            "auto" | "none" | "required" => Value::String(tc.to_string()),
            _ => Value::String("auto".to_string()),
        };
        Some(v)
    } else {
        None
    };

    ChatCompletionsRequest {
        model: req.model.clone(),
        messages,
        tools,
        tool_choice,
        stream: true,
        stream_options: Some(ChatStreamOptions {
            include_usage: true,
        }),
        parallel_tool_calls: if req.parallel_tool_calls {
            Some(true)
        } else {
            None
        },
    }
}

fn convert_response_item(item: &ResponseItem, messages: &mut Vec<ChatMessage>) {
    match item {
        ResponseItem::Message { role, content, .. } => {
            let text: String = content
                .iter()
                .filter_map(|c| match c {
                    ContentItem::OutputText { text, .. } => Some(text.clone()),
                    ContentItem::InputText { text, .. } => Some(text.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("");
            messages.push(ChatMessage {
                role: role.clone(),
                content: Some(Value::String(text)),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            });
        }
        ResponseItem::FunctionCall {
            name,
            arguments,
            call_id,
            ..
        } => {
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: None,
                tool_calls: Some(vec![ChatToolCall {
                    id: call_id.clone(),
                    r#type: "function".to_string(),
                    function: ChatToolCallFunction {
                        name: name.clone(),
                        arguments: arguments.clone(),
                    },
                }]),
                tool_call_id: None,
                name: None,
            });
        }
        ResponseItem::FunctionCallOutput {
            call_id, output, ..
        } => {
            let content_str = output.body.to_text().unwrap_or_default();
            messages.push(ChatMessage {
                role: "tool".to_string(),
                content: Some(Value::String(content_str)),
                tool_calls: None,
                tool_call_id: Some(call_id.clone()),
                name: None,
            });
        }
        // Reasoning items, compaction items, and other internal items are not
        // forwarded to Chat Completions providers.
        _ => {
            trace!("chat_completions: skipping non-mappable ResponseItem variant");
        }
    }
}

// ── SSE stream processing ─────────────────────────────────────────────────────

async fn process_chat_completions_sse(
    stream: codex_client::ByteStream,
    tx: mpsc::Sender<Result<ResponseEvent, ApiError>>,
    idle_timeout: Duration,
) {
    let mut sse_stream = stream.eventsource();
    let mut token_usage: Option<TokenUsage> = None;
    let mut response_id = String::from("chat-completions");
    let mut finished = false;
    // Whether we have already emitted the synthetic Created + OutputItemAdded
    // events that the codex engine requires before receiving any OutputTextDelta.
    let mut text_item_started = false;
    // Accumulate full text content for the OutputItemDone at the end.
    let mut text_content_buf = String::new();
    // Synthetic message item id used for the text response.
    let text_item_id = "chat-msg-0".to_string();

    // Accumulated tool calls keyed by index.
    // Each entry: (call_id, function_name, arguments_buf)
    let mut tool_calls_buf: std::collections::BTreeMap<usize, (String, String, String)> =
        std::collections::BTreeMap::new();

    loop {
        let result = timeout(idle_timeout, sse_stream.next()).await;
        let sse = match result {
            Ok(Some(Ok(sse))) => sse,
            Ok(Some(Err(e))) => {
                debug!("chat_completions SSE error: {e:#}");
                let _ = tx.send(Err(ApiError::Stream(e.to_string()))).await;
                return;
            }
            Ok(None) => {
                if finished {
                    return;
                }
                let _ = tx
                    .send(Err(ApiError::Stream(
                        "chat completions stream closed before [DONE]".into(),
                    )))
                    .await;
                return;
            }
            Err(_) => {
                let _ = tx
                    .send(Err(ApiError::Stream(
                        "idle timeout waiting for chat completions SSE".into(),
                    )))
                    .await;
                return;
            }
        };

        let data = sse.data.trim();
        trace!("chat_completions SSE: {data}");

        if data == "[DONE]" {
            // Emit OutputItemDone for the text message if we started one.
            if text_item_started {
                let done_msg = ResponseItem::Message {
                    id: Some(text_item_id.clone()),
                    role: "assistant".to_string(),
                    content: vec![ContentItem::OutputText {
                        text: text_content_buf.clone(),
                    }],
                    phase: None,
                    internal_chat_message_metadata_passthrough: None,
                };
                let _ = tx.send(Ok(ResponseEvent::OutputItemDone(done_msg))).await;
            }

            // Emit FunctionCall items for any tool calls that were accumulated.
            for (idx, (call_id, name, arguments)) in tool_calls_buf.iter() {
                let fc_id = format!("fc-{idx}");
                let item_added = ResponseItem::FunctionCall {
                    id: Some(fc_id.clone()),
                    name: name.clone(),
                    namespace: None,
                    arguments: arguments.clone(),
                    call_id: call_id.clone(),
                    internal_chat_message_metadata_passthrough: None,
                };
                let _ = tx
                    .send(Ok(ResponseEvent::OutputItemAdded(item_added.clone())))
                    .await;
                let _ = tx.send(Ok(ResponseEvent::OutputItemDone(item_added))).await;
            }

            let usage = token_usage.take();
            let _ = tx
                .send(Ok(ResponseEvent::Completed {
                    response_id: response_id.clone(),
                    token_usage: usage,
                    end_turn: Some(true),
                }))
                .await;
            finished = true;
            return;
        }

        let chunk: ChatChunk = match serde_json::from_str(data) {
            Ok(c) => c,
            Err(e) => {
                debug!("chat_completions: failed to parse chunk: {e}, data={data}");
                continue;
            }
        };

        // Capture response id from first chunk
        if let Some(id) = &chunk.id {
            if !id.is_empty() {
                response_id = id.clone();
            }
        }

        // Capture usage (present on last chunk when stream_options.include_usage=true)
        if let Some(u) = chunk.usage {
            token_usage = Some(u.into());
        }

        for choice in chunk.choices {
            let delta = choice.delta;

            // Text delta
            if let Some(content) = delta.content {
                if !content.is_empty() {
                    // Before the first text delta, emit synthetic lifecycle events
                    // that the codex engine requires to set up an active output item.
                    if !text_item_started {
                        text_item_started = true;
                        // Created event signals the response has begun.
                        let _ = tx.send(Ok(ResponseEvent::Created)).await;
                        // OutputItemAdded establishes the active message item so that
                        // subsequent OutputTextDelta events are associated with it.
                        let synthetic_msg = ResponseItem::Message {
                            id: Some(text_item_id.clone()),
                            role: "assistant".to_string(),
                            content: vec![],
                            phase: None,
                            internal_chat_message_metadata_passthrough: None,
                        };
                        let _ = tx
                            .send(Ok(ResponseEvent::OutputItemAdded(synthetic_msg)))
                            .await;
                    }
                    text_content_buf.push_str(&content);
                    let _ = tx
                        .send(Ok(ResponseEvent::OutputTextDelta(content)))
                        .await;
                }
            }

            // Accumulate tool call deltas.
            if let Some(tcs) = delta.tool_calls {
                for tc in tcs {
                    let idx = tc.index;
                    let entry = tool_calls_buf
                        .entry(idx)
                        .or_insert_with(|| (String::new(), String::new(), String::new()));
                    if let Some(id) = tc.id.filter(|s| !s.is_empty()) {
                        entry.0 = id;
                    }
                    if let Some(func) = tc.function {
                        if let Some(name) = func.name.filter(|s| !s.is_empty()) {
                            entry.1 = name;
                        }
                        if let Some(args) = func.arguments {
                            entry.2.push_str(&args);
                        }
                    }
                }
            }

            // finish_reason is informational here; tool calls are emitted at [DONE].
            if let Some(reason) = choice.finish_reason {
                trace!("chat_completions: finish_reason={reason}");
            }
        }
    }
}

// ── Client ────────────────────────────────────────────────────────────────────

pub struct ChatCompletionsClient<T: HttpTransport> {
    session: EndpointSession<T>,
}

impl<T: HttpTransport> ChatCompletionsClient<T> {
    pub fn new(transport: T, provider: Provider, auth: SharedAuthProvider) -> Self {
        Self {
            session: EndpointSession::new(transport, provider, auth),
        }
    }

    /// Stream a request using the Chat Completions wire API.
    pub async fn stream_request(
        &self,
        request: ResponsesApiRequest,
        extra_headers: HeaderMap,
    ) -> Result<ResponseStream, ApiError> {
        let chat_req = to_chat_request(&request);
        let body = EncodedJsonBody::encode(&chat_req).map_err(|e| {
            ApiError::Stream(format!(
                "failed to encode chat completions request: {e}"
            ))
        })?;

        let mut headers = extra_headers;
        insert_header(&mut headers, "content-type", "application/json");

        let stream_response = self
            .session
            .stream_encoded_json_with(
                Method::POST,
                Self::path(),
                headers,
                Some(body),
                |req| {
                    req.headers.insert(
                        http::header::ACCEPT,
                        HeaderValue::from_static("text/event-stream"),
                    );
                },
            )
            .await?;

        let idle_timeout = self.session.provider().stream_idle_timeout;
        let upstream_request_id = stream_response
            .headers
            .get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);

        let (tx, rx_event) = mpsc::channel::<Result<ResponseEvent, ApiError>>(1600);
        tokio::spawn(process_chat_completions_sse(
            stream_response.bytes,
            tx,
            idle_timeout,
        ));

        Ok(ResponseStream {
            rx_event,
            upstream_request_id,
        })
    }

    fn path() -> &'static str {
        "chat/completions"
    }
}
