// Thin client for the Otari gateway (OpenAI-compatible Chat Completions).
// Every model call in Repo Doctor goes through here.

export const BASE_URL = (process.env.OTARI_BASE_URL || "https://api.otari.ai/api/v1").replace(/\/$/, "");
const API_KEY = process.env.OTARI_API_KEY;

export class OtariError extends Error {
  constructor(message, { status, code, body, meta } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
    this.meta = meta;
  }
}

function readMeta(res) {
  return {
    status: res.status,
    model: res.headers.get("otari-model"),
    fallback: res.headers.get("otari-fallback") === "true",
    endUserBudget: res.headers.get("otari-end-user-budget"),
    guardrails: res.headers.get("otari-guardrails"),
  };
}

function errorMessage(body, text) {
  const d = body?.detail ?? body?.error?.message ?? body?.message;
  if (typeof d === "string") return d;
  if (d) return JSON.stringify(d);
  return text?.slice(0, 300) || "Unknown Otari error";
}

function authHeaders(extra = {}) {
  if (!API_KEY) throw new OtariError("OTARI_API_KEY is not set. Copy .env.example to .env and paste your key.", { status: 500 });
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", ...extra };
}

async function failFrom(res) {
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  const code = json?.code || json?.error?.code || json?.detail?.code;
  return new OtariError(errorMessage(json, text), { status: res.status, code, body: json, meta: readMeta(res) });
}

/**
 * One streamed chat completion through Otari.
 * - `user` names the end user, so a service key bills and budgets them separately.
 * - `guardrails` asks Otari to run a guardrail profile on the request.
 * - Built-in tools (otari_web_fetch, otari_code_execution) and MCP servers run inside the gateway.
 *   Each call they make arrives in `otari_tool_calls`; `onToolCall` sees them live.
 */
export async function chat({ model, messages, tools, mcpServers, mcpServerIds, user, guardrails, metadata, maxTokens = 4000, onToolCall }) {
  const body = { model, messages, max_tokens: maxTokens, stream: true };
  if (tools?.length) body.tools = tools;
  if (mcpServers?.length) body.mcp_servers = mcpServers;
  if (mcpServerIds?.length) body.mcp_server_ids = mcpServerIds;
  if (user) body.user = user;
  if (guardrails?.length) body.guardrails = guardrails;
  if (metadata) body.metadata = metadata;

  const res = await fetch(`${BASE_URL}/chat/completions`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw await failFrom(res);
  const meta = readMeta(res);

  const calls = new Map();
  let content = "";
  let usage = null;
  let buf = "";
  const decoder = new TextDecoder();

  const handle = (data) => {
    if (data === "[DONE]") return;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk.error) {
      throw new OtariError(errorMessage(chunk, data), { status: chunk.error.status || 502, code: chunk.error.code, body: chunk, meta });
    }
    for (const c of chunk.otari_tool_calls ?? []) {
      calls.set(c.id, c);
      onToolCall?.(c);
    }
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) content += delta.content;
    if (chunk.usage) usage = chunk.usage;
  };

  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith("data:")) handle(line.slice(5).trim());
    }
  }
  if (buf.trim().startsWith("data:")) handle(buf.trim().slice(5).trim());

  return { content, toolCalls: [...calls.values()], usage, meta };
}

/** Spend and budget for one end user of a service key. */
export async function getEndUser(externalId) {
  const res = await fetch(`${BASE_URL}/end-users?external_id=${encodeURIComponent(externalId)}`, { headers: authHeaders() });
  if (!res.ok) throw await failFrom(res);
  const json = await res.json();
  return Array.isArray(json) ? json[0] ?? null : json?.data?.[0] ?? json?.items?.[0] ?? null;
}
