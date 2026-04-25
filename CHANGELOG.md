# Changelog

## 0.1.4 — 2026-04-25

- `xmesh-agent init <peer-name>` — scaffold a starter `agent.toml` with
  role-specific α weights, adapter defaults, sensible budget caps, and
  a "next steps" prompt. Supports `--role` (writer / reviewer /
  test-writer / auditor / generator / spec / generic), `--adapter`
  (anthropic / openai / ollama), `--group`, `--model`, `--cost-cap`,
  `--out`, `--force`. Round-trip tested against `loadConfig`.

## 0.1.3 — 2026-04-24

- README rewritten for public release: clearer "why", correct quickstart
  paths after `npm i -g`, Anthropic vs OpenAI key disambiguation,
  honest Phase-1 identity caveat, broadcast-routing default surfaced,
  trust-signal badges (npm version + license + node version), accurate
  test counts (225 unit + 4 smoke), removed dead cross-refs to
  private sym-strategy doc.

## 0.1.2 — 2026-04-24

- **Behavior fix:** AgentLoop response routing now defaults to broadcast
  (was implicit-targeted-to-originator). Verified bug from end-to-end
  3-peer demo: targeted-replies to a transient seed peer left the rest
  of the mesh starved. Broadcast is the canonical agent-to-agent
  behavior and matches the "every peer sees every response, runs SVAF"
  mental model.
- New `[routing] response_routing` config: `broadcast` (default),
  `targeted` (legacy behavior), `auto` (broadcast for ≤2 peers,
  targeted otherwise).
- Existing scenarios continue to work — they implicitly inherit the new
  broadcast default. Operators wanting the old behavior set
  `response_routing = "targeted"`.

## 0.1.1 — 2026-04-24

- `examples/scenarios/writer-openai.toml` + `test-writer-openai.toml` —
  full 3-peer demo can run on OpenAI gpt-4o-mini end-to-end (mirror
  of the Anthropic writer + reviewer + test-writer set)
- `test/openai.smoke.js` — live OpenAI API smoke skip-gated on
  `OPENAI_API_KEY`. Asserts emit_cmb tool_use + non-zero usage + cost.

## 0.1.0 — 2026-04-24

First production-grade public release. Phase-1 of `xmesh-agent` is complete:
autonomous runtime, three model adapters (Anthropic / OpenAI / Ollama),
six-layer safety envelope (wake-budget / cycle / token / cost / gates /
circuit), structured JSON logging, persistent stats, full CLI surface, IPC
control plane, JSON Schema for config, ed25519 identity primitive, JSON
schema validation, dry-run validation, migrate command, demo scenarios,
cross-host runbook.

Phase 2 (May–Jun 2026): wire-signed CMBs in `@sym-bot/sym` 0.6.0 +
mesh-channel 0.4.0 + sym-swift + MMP spec v0.3.0 simultaneous release.

## 0.1.0-alpha.14 — 2026-04-24

- `xmesh-agent migrate` command — automated `~/.xmesh-agent` →
  `~/.xmesh` rename. Dry-run by default; `--apply` performs the move.
- Refuses to apply when socket files present (running peers must be
  stopped first) or when both legacy + current dirs exist (conflict
  resolution must be manual).

## 0.1.0-alpha.13 — 2026-04-24

- **BREAKING (alpha):** runtime dir renamed from `~/.xmesh-agent/` →
  `~/.xmesh/` per CMO Q3 — brand alignment with `xmesh.dev`. The npm
  package name (`@sym-bot/xmesh-agent`) is unchanged; only the
  user-facing filesystem path moves.
- New shared module `src/runtime/paths.js` — single source of truth for
  baseDir / keysDir / trustedKeysDir / stateDir / socketsDir
- Env override renamed `XMESH_AGENT_RUNTIME_DIR` → `XMESH_RUNTIME_DIR`
  with legacy var still accepted as fallback
- One-shot deprecation advisory at `xmesh-agent run` startup if
  `~/.xmesh-agent/` exists and `~/.xmesh/` does not — operator-driven
  migration with explicit `mv` command, no automatic file moves
- `fullFingerprintOf()` exported alongside `fingerprintOf()` —
  64-hex full SHA-256 vs 16-hex short form
- `xmesh-agent keygen` + `fingerprint` now print BOTH keyprint (16-hex)
  and fingerprint (64-hex) per CMO Q4 — keyprint for casual display,
  fingerprint for trust decisions
- `xmesh-agent trust add` now prints full 64-hex fingerprint with an
  explicit verification advisory ("verify this matches the peer's
  reported full fingerprint before sharing CMBs")

## 0.1.0-alpha.12 — 2026-04-24

- Phase-1 identity signing primitive (`src/safety/identity.js`) —
  ed25519 keypair generation, storage (~/.xmesh-agent/keys/, 0600 on
  private key), canonical envelope serialisation + sign + verify
- Trust pinning: `trustKey()` + `listTrustedKeys()` write to
  `~/.xmesh-agent/trusted-keys/<group>/` for peer-public-key registry
- CLI: `keygen <peer> [--force]`, `fingerprint <peer>`,
  `trust add --group <g> --peer <p> --public-key <b64url>`, `trust list`
- Spec delta + wire integration (@sym-bot/sym 0.6.0) deferred to Phase 2
  per `sym-strategy/architecture/xmesh_identity_signing_v0.1.md`

## 0.1.0-alpha.11 — 2026-04-24

- Circuit breaker for model adapter (`src/safety/circuit-breaker.js`) —
  opens after 5 consecutive failures, half-opens after 60s, exponential
  backoff per consecutive failure (1s → 30s cap)
- Transient-error detection: 429 / 502 / 503 / 504, "rate limit",
  "overloaded", "ECONNRESET", "ETIMEDOUT" — these trigger backoff + retry
- AgentLoop `stats.breaker` exposes state + consecutive failures + next
  backoff for observability via `xmesh-agent status`
- Non-transient errors (invalid API key, 4xx other) still open the
  breaker but do not trigger the sleep-then-retry — fail fast

## 0.1.0-alpha.10 — 2026-04-24

- Gitleaks secret-scan job in CI — runs on every push/PR, independent of
  the test matrix (so a secret leak fails CI even if tests pass)
- `.gitleaks.toml` — allowlists the fake API keys in test fixtures
  (`sk-ant-fake`, `sk-openai-env`, etc.) and excludes lockfiles

## 0.1.0-alpha.9 — 2026-04-24

- Role-vs-weights sanity check (`src/core/role-sanity.js`) — compares
  peer's `identity.role` against expected CAT7 α_f emphasis. Known roles:
  writer, reviewer, test-writer, spec, spec-drafter, auditor, generator,
  mood. Unknown roles pass silently.
- Wired into `xmesh-agent dry-run` — surfaces advisories for mismatches
  (e.g. `role="reviewer"` with low `issue` weight) without blocking start.

## 0.1.0-alpha.8 — 2026-04-24

- JSON Schema for agent.toml (`src/cli/schema.js`) — JSON Schema Draft
  2020-12 covering all sections and field types
- `xmesh-agent schema` command — prints the schema to stdout for piping
  into editor integrations (VS Code Even Better TOML, IntelliJ, etc.)
- Schema kept in lockstep with config: model adapter enum matches
  SUPPORTED_ADAPTERS, logging level matches LEVEL_ORDER, additionalProperties
  false at top level

## 0.1.0-alpha.7 — 2026-04-24

- `test/relay.smoke.js` — automated WAN-relay smoke test, two-peer
  discover + CMB exchange via real WebSocket relay. Skip-gated on
  SYM_RELAY_URL + SYM_RELAY_TOKEN env vars.
- `examples/cross-host-runbook.md` — new "Automated WAN smoke"
  subsection linking to the smoke test for single-machine verification.

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
