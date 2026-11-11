// The app's API, shared by the local server (server.js) and Vercel functions (api/*.js).
import { runDoctor, ROLES } from "./doctor.js";
import { getEndUser, ensureEndUser, OtariError, BASE_URL } from "./otari.js";

// Each person using the app is an Otari end user with their own budget.
const cleanUser = (u) => String(u || "").trim().toLowerCase().replace(/[^a-z0-9_.@-]/g, "").slice(0, 64);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body; // already parsed (Vercel)
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 20_000) throw new Error("Request too large");
  }
  return data ? JSON.parse(data) : {};
}

export function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function describeError(e) {
  if (e instanceof OtariError) {
    if (e.code === "budget_exceeded" || /budget/i.test(e.message)) {
      return { kind: "budget", message: "You've used up your budget for now. Otari refused the request.", detail: e.message };
    }
    if (e.code === "guardrail_violation" || /guardrail/i.test(e.message)) {
      return { kind: "guardrail", message: "An Otari guardrail blocked this request.", detail: e.message };
    }
    if (e.code === "user_blocked") return { kind: "blocked_user", message: "This user is blocked.", detail: e.message };
    return { kind: "otari", message: `Otari error ${e.status ?? ""}`.trim(), detail: e.message };
  }
  return { kind: "app", message: e.message };
}

export function handleConfig(req, res) {
  sendJson(res, 200, {
    gateway: BASE_URL,
    hasKey: Boolean(process.env.OTARI_API_KEY),
    roles: ROLES,
    guardrail: process.env.OTARI_GUARDRAIL_PROFILE || null,
  });
}

export async function handleMe(req, res) {
  const url = new URL(req.url, "http://localhost");
  const user = cleanUser(url.searchParams.get("user"));
  if (!user) return sendJson(res, 400, { error: "user is required" });
  try {
    sendJson(res, 200, { user, endUser: await getEndUser(user) });
  } catch (e) {
    sendJson(res, 200, { user, endUser: null, note: e.message });
  }
}

export async function handleDiagnose(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const user = cleanUser(body.user);
  if (!user) return sendJson(res, 400, { error: "Enter a username first." });

  res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
  const emit = (event) => res.write(JSON.stringify(event) + "\n");
  try {
    try {
      const eu = await ensureEndUser(user);
      if (eu) emit({ type: "spend", endUser: eu });
    } catch (e) {
      emit({ type: "warn", message: `Couldn't set up your budget: ${e.message}` });
    }
    await runDoctor({ repoUrl: body.repo, focus: body.focus }, user, emit);
  } catch (e) {
    console.error(e);
    emit({ type: "error", ...describeError(e) });
  }
  try {
    emit({ type: "spend", endUser: await getEndUser(user) });
  } catch {
    /* spend lookup needs a service key */
  }
  res.end();
}
