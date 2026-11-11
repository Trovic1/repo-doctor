# Repo Doctor

**A check-up for any GitHub repo.** Paste a repository and four open-weight AI agents read the code, run it in a sandbox and write a diagnosis: what's broken, why, and what to fix first.

Built for MozFest Developers Wilding Online. Every model call, MCP call, web fetch and sandbox run goes through one [Otari](https://otari.ai) gateway key.

## The care team

| Agent | Model (all open-weight) | What it does through Otari |
| --- | --- | --- |
| 1. Gatekeeper | `openai/gpt-oss-safeguard-120b` | Screens the request before any money is spent. Optional Otari **guardrail** profile on every call. |
| 2. Explorer | `doctor-explorer` routing policy (DeepSeek V4.1 Flash, falling back to another model) | Reads the repo through **MCP** servers (DeepWiki for architecture, GitMCP for docs and code search) and **web fetch** for single files. |
| 3. Tester | `doctor-tester` routing policy (gpt-oss-120b, with fallback) | Downloads the repo into Otari's **code execution** sandbox, scans for secrets and TODOs, compiles, and runs the test suite. |
| 4. Reporter | `doctor-reporter` routing policy (GLM 5.3 Flash, with fallback) | Turns the notes and the raw sandbox output into a graded health report with fixes. |

Each request names the person using the app in the `user` field. With an Otari **service key**, every user gets their own **budget**, and the key has an overall **spend ceiling**. When someone runs out, Otari refuses the request and the app tells them.

The UI shows, for every agent, the model it asked for and the model that answered (`Otari-Model`), whether a **fallback** was used (`Otari-Fallback`), and a live feed of every MCP call, fetch and sandbox run with its code and output (`otari_tool_calls`).

Repository content is treated as untrusted: the gatekeeper and prompts are built to report prompt-injection attempts found in a repo instead of following them.

## Otari features used

- Open-weight models in four distinct roles
- Model routing and fallbacks: `doctor-explorer`, `doctor-tester`, `doctor-reporter`
- MCP integrations: DeepWiki and GitMCP
- Web fetch: `otari_web_fetch`
- Code execution: `otari_code_execution`
- Budgets and spending limits: spend ceiling on the service key
- Per-user budgets: service key + `user` field + `/api/v1/end-users`
- Guardrails: `guardrails` field, verdict read from `Otari-Guardrails`

## Run it

Needs Node 22 or newer. No dependencies to install.

```bash
cp .env.example .env    # paste your Otari key into OTARI_API_KEY
npm start               # open http://localhost:3000
```

## Otari setup

1. **Tools**: in your workspace, turn on **Code execution** and **Web search / fetch**.
2. **MCP**: under **Tools → MCP servers**, turn on **Let requests name their own MCP servers**. Or add `https://mcp.deepwiki.com/mcp` and `https://gitmcp.io/docs` as servers and put their ids in `OTARI_MCP_SERVER_IDS`.
3. **Routing → Policies → Create policy**, strategy **Fallback**:
   - `doctor-explorer`: `deepseek/deepseek-v4.1-flash-1017`, then `z-ai/glm-5.3-flash`
   - `doctor-tester`: `openai/gpt-oss-120b`, then `deepseek/deepseek-v4.1-flash-1017`
   - `doctor-reporter`: `z-ai/glm-5.3-flash`, then `mistralai/mistral-small-4`
4. **Spend & budgets**: create a budget such as `doctor-per-user`, $0.50 a day.
5. **API keys → Create key → Advanced → Service key**, with `doctor-per-user` as the default end-user budget and a spend ceiling on the key.
6. **Guardrails (optional)**: configure and mandate one under **Organization → Guardrails**, then set `OTARI_GUARDRAIL_PROFILE`.

If a routing policy, MCP or a tool isn't set up yet, the app says so and carries on without it.

## Files

- `server.js`: HTTP server; streams each agent's progress to the page
- `lib/doctor.js`: the four-agent pipeline
- `lib/otari.js`: streaming Otari client and end-user spend lookup
- `public/index.html`: the UI

## License

MIT
