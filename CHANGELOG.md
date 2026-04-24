# Changelog

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
