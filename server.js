import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDoctor, ROLES } from "./lib/doctor.js";
import { getEndUser, OtariError, BASE_URL } from "./lib/otari.js";

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

// Each person using the app is an Otari end user with their own budget.
const cleanUser = (u) => String(u || "").trim().toLowerCase().replace(/[^a-z0-9_.@-]/g, "").slice(0, 64);

async function readBody(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 20_000) throw new Error("Request too large");
  }
  return data ? JSON.parse(data) : {};
}

function sendJson(res, status, obj) {
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(join(root, "public", "index.html")));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      sendJson(res, 200, {
        gateway: BASE_URL,
        hasKey: Boolean(process.env.OTARI_API_KEY),
        roles: ROLES,
        guardrail: process.env.OTARI_GUARDRAIL_PROFILE || null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = cleanUser(url.searchParams.get("user"));
      if (!user) return sendJson(res, 400, { error: "user is required" });
      try {
        sendJson(res, 200, { user, endUser: await getEndUser(user) });
      } catch (e) {
        sendJson(res, 200, { user, endUser: null, note: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/diagnose") {
      const body = await readBody(req);
      const user = cleanUser(body.user);
      if (!user) return sendJson(res, 400, { error: "Enter a username first." });

      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
      const emit = (event) => res.write(JSON.stringify(event) + "\n");
      try {
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
      return;
    }

    res.writeHead(404).end("Not found");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Repo Doctor running at http://localhost:${PORT}`);
  console.log(`Gateway: ${BASE_URL}`);
  if (!process.env.OTARI_API_KEY) console.warn("Warning: OTARI_API_KEY is not set. Copy .env.example to .env.");
});
