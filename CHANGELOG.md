# Changelog

## 0.1.0-alpha.6 — 2026-04-24

- Persistent per-peer state (`src/core/state-store.js`) — lifetime cost,
  CMBs emitted, suppressions, run count persisted to
  `~/.xmesh-agent/state/<peer>.json` with atomic tmp-rename writes
- `xmesh-agent cost <peer>` now reports both this-run and lifetime totals
- `xmesh-agent status <peer>` includes lifetime totals
- Startup log prints prior totals when previous runs exist
- Schema versioned (v1); old-version files are reset, not crashed on

## 0.1.0-alpha.5 — 2026-04-24

- Structured JSON logging (`src/core/logger.js`) — RotatingJsonLogger writes
  one JSON line per event to stderr + optional log file. Size-based rotation
  (default 5 MB × 5 files). Level filter (error / warn / info / debug).
  Synchronous append semantics — no buffering, no flush lag.
- `[logging]` section in agent.toml — `level`, `file_path`, `max_file_size`,
  `keep`. All optional; stderr-only when file_path omitted.
- AgentLoop accepts the new logger via existing `logger` constructor arg —
  no API change.

## 0.1.0-alpha.4 — 2026-04-24

- `xmesh-agent dry-run --config <path>` — validates config, adapter creds,
  SVAF weights completeness, budget sanity, attach mode; no mesh join, no
  model call. Exits 0 on PASS, 1 on any FAIL.

## 0.1.0-alpha.3 — 2026-04-24

- Claude Code attach advisory (`src/attach/claude-code.js`) — pre-flight
  check that a Claude Code mesh-channel plugin, if installed, shares the
  same group and does not name-collide with this peer
- run.js prints advisory on start (ok / warning both stderr-visible)

## 0.1.0-alpha.2 — 2026-04-24

- Ollama local model adapter (`src/model/ollama.js`) — zero-cost inference
  against local `ollama serve`; cost always reports $0
- OLLAMA_HOST env var override for remote GPU boxes
- `examples/scenarios/reviewer-ollama.toml` — local-only peer sample
- eslint globals updated to include `fetch` + `URL`

## 0.1.0-alpha.1 — 2026-04-24

- OpenAI model adapter (`src/model/openai.js`) — GPT-5 / GPT-4o / o1 families,
  function-calling translated to emit_cmb tool-use, per-call cost tracking
- Config validation rejects unsupported model adapters with clear error
- `examples/scenarios/reviewer-openai.toml` — sample OpenAI-backed peer
- ESLint flat-config + npm run lint + CI lint step
- GitHub Actions CI — test matrix Node 18/20/22 + install rehearsal

## 0.1.0-alpha.0 — 2026-04-24

Initial scaffold. Architecture grounded in `sym-strategy/architecture/xmesh_runtime_v0.1.md` @ `2921295`.

- Repo layout per runtime doc §3.2
- Wake-budget safety primitive (runtime doc §5.1) — implemented, tested
- Cycle-detection safety primitive (runtime doc §5.2) — implemented, tested
- CLI skeleton with `run`, `stop`, `status`, `cost`, `trace` stubs
- Model / attach / mesh / core-loop modules — skeleton only
