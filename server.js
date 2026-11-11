// Local server. On Vercel, the same routes run as functions in api/.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BASE_URL } from "./lib/otari.js";
import { handleConfig, handleMe, handleDiagnose, sendJson } from "./lib/routes.js";
import { handleGuardValidate, handleGuardProfiles } from "./lib/guard.js";

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(join(root, "public", "index.html")));
      return;
    }
    if (req.method === "GET" && pathname === "/api/config") return handleConfig(req, res);
    if (req.method === "GET" && pathname === "/api/me") return await handleMe(req, res);
    if (pathname === "/api/diagnose") return await handleDiagnose(req, res);
    if (pathname === "/api/guard/validate") return await handleGuardValidate(req, res);
    if (pathname === "/api/guard/profiles") return handleGuardProfiles(req, res);
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
