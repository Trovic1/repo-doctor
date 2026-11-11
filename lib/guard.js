// Repo Doctor's own guardrail service, speaking Otari's guardrails contract:
//   POST <url>/validate  {profile, input_text, validate_kwargs} -> {profile, result: {valid, explanation, score}}
//   GET  <url>/profiles  -> the profiles it offers
// Otari calls it before a request reaches any model. It flags prompt-injection
// attempts and pasted secrets, with plain rules, so it is free, fast and predictable.

export const GUARD_PROFILE = "repo-doctor-shield";

const RULES = [
  { name: "instruction override", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.\n]{0,20}\b(instructions?|rules|prompts?|guidelines)\b/i },
  { name: "prompt extraction", re: /\b(reveal|print|show|repeat|leak|output)\b[^.\n]{0,20}\b(your|the)\b[^.\n]{0,20}\b(system prompt|hidden prompt|instructions you were given)\b/i },
  { name: "role hijack", re: /\byou are now\b|\bact as (an? )?(unfiltered|unrestricted|jailbroken)\b|\bDAN mode\b|\bjailbreak\b/i },
  { name: "fake system message", re: /<\|?(system|im_start)\|?>|\[\/?INST\]|^\s*###\s*system\s*:/im },
  { name: "secret in input", re: /\b(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|otk_[A-Za-z0-9_-]{16,}|xox[bp]-[A-Za-z0-9-]{10,})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

export function checkText(text) {
  const s = String(text || "");
  const hits = RULES.filter((r) => r.re.test(s)).map((r) => r.name);
  return hits.length
    ? { valid: false, explanation: `Flagged: ${hits.join(", ")}`, score: Math.min(1, 0.6 + 0.2 * hits.length) }
    : { valid: true, explanation: null, score: 0 };
}

const send = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 2_000_000) throw new Error("Request too large");
  }
  return data ? JSON.parse(data) : {};
}

export async function handleGuardValidate(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readJson(req);
  const profile = body.profile || GUARD_PROFILE;
  send(res, 200, { profile, result: checkText(body.input_text) });
}

export function handleGuardProfiles(req, res) {
  send(res, 200, { profiles: [GUARD_PROFILE] });
}
