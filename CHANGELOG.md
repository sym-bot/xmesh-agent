# Changelog

## 0.3.3 (2026-08-10)

Three releases in one day is not a good look. All three were the same defect found in
three places, and the trail ran through the documentation each time — the docs were the
only artifact that wrote the full contract down, so they were the only place the two
halves of a rename could be seen to disagree.

### Fixed

- **The shipped `examples/agent.toml.example` did not validate.** It still said
  `group = "xmesh-dev-demo"`, which 0.3.2's schema rejects. `dry-run` reported
  `room=default` and then failed validation — copy the example, get an error. The 0.3.2
  sweep covered `examples/scenarios/*.toml` and missed the example config beside them.

- **The GitHub Action passed `--group` to a CLI that renamed the flag to `--room`.**
  Every `uses: sym-bot/xmesh-agent` workflow scaffolded a peer with a dead flag.

- **The cross-host runbook's verification step pointed at an endpoint that does not
  exist.** It told you to check `sym-relay.onrender.com/admin/groups`; `sym-relay` serves
  `/health` and nothing else — the relay forwards frames and does not track membership,
  so verification is always peer-side. Replaced with `sym peers --room`.

### Changed — breaking

- **`agent.toml`: `n_group` → `n_room`.** It sets how many room-context CMBs enter the
  prompt, so it was never a generic sample count. Internally `nGroup` → `nRoom`.

- **Action input `group:` → `room:`.** The retired name is still declared, and setting it
  **fails the run** with the fix in the message. Same reasoning as 0.3.2's schema: an
  ignored setting is what put every peer in the wrong room to begin with.

`::group::`/`::endgroup::` (GitHub log folding), dependabot's `groups:` key, and
`n_group`-free vendor names are untouched — they are other people's vocabulary.

## 0.3.2 (2026-08-10)

### Fixed

- **Every agent landed in the `default` room regardless of its `agent.toml`.** `SymNode`
  0.11.1 accepts `opts.room`; this adapter still passed `group`. An unknown option is not
  an error, so the room silently defaulted while the config file sat there looking obeyed.

### Changed — breaking

- `agent.toml`: `group = ...` → `room = ...`; the schema **rejects** the old key rather
  than ignoring it. `SYM_GROUP` → `SYM_ROOM`. `fieldWeights` → `categoryWeights`.

## 0.3.1 (2026-08-10)

### Changed

- **Repin `@sym-bot/sym` 0.11.0 → 0.11.1** and adopt the one-container CAT7 record:
  `fields` → `categories` alongside `metadata`.

## 0.3.0 (2026-08-07)

### Changed

- **Repin `@sym-bot/sym` 0.10.5 → 0.11.0 (core 0.7.4 → 0.8.1).** Carries core's verification fix:
  `verifyCMB` used to return `valid: true` for records it had never checked, and `recomputeKey`
  could not recompute a single record the library minted.

  This package derives and verifies no content address of its own — zero references to
  `recomputeKey`, `cmbKeyV1`, `blockKeyV2`, `keyScheme` or `verifyCMB` outside `node_modules` — so
  a corrected core invalidates nothing here. That was checked rather than assumed, because `sym`
  DID carry a hand-rolled workaround around the same defect and the bump alone turned it into a
  regression that would have discarded every pre-boundary record on fetch.

  Resolved after install, not declared: `sym` 0.11.0, `core` 0.8.1. 303/303.

## 0.1.17 — 2026-07-21 · verify both key prefixes before the cmb1- migration

- Takes `@sym-bot/sym` ^0.7.32 (and through it `@sym-bot/core` ^0.3.49), whose verification
  accepts a v1 CMB under **either** prefix. The mesh is migrating `cmb1-<64hex>` keys to
  `cmb-<64hex>`; the prefix used to select the signing scheme, and the digest LENGTH now does
  (64 hex = v1, 32 hex = legacy). No code change here — xmesh-agent has zero `cmb1-`
  references and never treated the prefix as the scheme.
- **This release does not emit the new form.** Emission stays `cmb1-` until cutover: every
  process must READ both prefixes before any process WRITES the new one, or blocks from an
  upgraded node fail verification on one that has not restarted.
- Fixes two bugs in `scripts/release.mjs` that made it unable to complete: the CHANGELOG
  section regex read every well-formed entry as empty, and `run()` crashed on the
  `stdio: "inherit"` steps (npm test / build).

## 0.1.16 — 2026-07-20

- **Dependency (data loss):** raise `@sym-bot/sym` to `^0.7.31`. Versions before
  0.7.31 delete accumulated cognition on an hourly sweep: CMB retention defaulted
  to 86400s (24h), and `_runRetentionPurge()` — which runs at start and every hour
  — compacts entries to `cold` and then removes any cold CMB with no descendants.
  Observed in production: a node store fell 130 → 116 → 98 CMBs in a few hours,
  taking its authority-bearing gate record with it, and an identity migration lost
  its tail mid-flight to the same sweep. 0.7.31 makes retention **unlimited by
  default**; an explicit finite `retentionSeconds` still opts in, so regulated
  deployments (HIPAA / MiFID II / SEC) are unaffected.
- **If you installed this SDK before 2026-07-20, your lockfile may pin a sym
  between 0.7.12 and 0.7.30 and you are losing memory silently.** The previous
  `^0.7.12` range admitted 0.7.31, so a fresh install was already safe — a pinned
  lockfile was not. This release raises the floor so an upgrade cannot be missed.
  Verify with `npm ls @sym-bot/sym`.
- No API change. Full suite green (303 unit tests).

## 0.1.15 — 2026-07-11

- **Brand:** fix stale `xmesh.dev` references → `xmesh` / `xmesh.bot`.
- Enable the adaptive integration timescale on the SymNode.
- Depends on `@sym-bot/sym` `^0.7.12` (resolves to the current 0.7.30).

## 0.1.14 — 2026-06-10

- **Dependency:** bump `@sym-bot/sym` to `^0.7.6` (lockfile was pinned to
  0.7.3) — picks up same-host loopback discovery (0.7.4), the mesh
  replay-storm receive-path dedup (0.7.5), and the SVAF decision log
  (0.7.6). Full suite green against it (303 unit tests).

## 0.1.13 — 2026-06-01

- **Dependency:** bump `@sym-bot/sym` to `^0.7.3` — picks up groups, the
  cross-platform discovery beacon, and the polyglot real-time node. Full
  suite green against it (303 unit tests; `dry-run` boots clean).
- **Docs:** README restyled to the SYM poster format + a self-contained
  one-page `docs/overview.html`. Positioned as **the autonomous agent
  runtime for [xmesh.dev](https://xmesh.dev)**; `peer-to-peer` → the
  ratified `agent-to-agent`; model refs refreshed (`claude-opus-4-8`);
  trimmed the stale "next: sym v0.6.0 wire signing" version pin.
- **package.json:** `homepage` → `https://xmesh.dev`; description refresh.

## 0.1.12 — 2026-05-12

- **MeshAdapter `payload` slot.** `send` and `observe` accept an
  optional `payload` param alongside `fields` and `parents`. Forwarded
  to `SymNode.remember(fields, { payload, … })` (requires
  `@sym-bot/sym` ≥ 0.5.8) and attached to the CMB; rides the wire
  frame to peers; surfaced on the receive side by `_normalizeEntry` so
  `onCmbAccepted(handler)` callbacks see `entry.payload`. Used by
  substrate-level protocols that carry data beyond CAT7 — LLM
  request/response primitive, sym.day SQLite ATTACH-DATABASE pattern.
- Back-compat: omitting `payload` keeps `opts.payload` off the
  underlying remember call (no surface change for v0.1.10 callers);
  incoming peer CMBs without payload surface as `entry.payload === null`.

## 0.1.10 — 2026-04-25

- `xmesh-agent watch` — live multi-peer status table (refresh in
  place). Polls every running peer's IPC socket for status, renders
  as a single colored table: peer / model / group / uptime / CMBs
  emitted+suppressed / cost / budget usage / circuit breaker state.
  Stale sockets show STALE; non-responding peers show ERROR.
- Flags: `--interval <ms>` (default 2000), `--once` (one-shot, no
  refresh loop), `--no-color`.
- Lower-friction operator UX than running `status` per peer in a loop.

## 0.1.9 — 2026-04-25

- **Mistral model adapter** (`src/model/mistral.js`) — fourth vendor.
  Pricing table covers mistral-large / medium / small / codestral /
  open-mistral-nemo / pixtral. Mistral's API is OpenAI-compatible so
  the adapter delegates to the OpenAI SDK with `baseURL` override
  (zero new dep). Defaults to `mistral-small-latest`.
- `xmesh-agent init --adapter mistral` scaffolds with sensible defaults.
- `MISTRAL_API_KEY` env var; friendly error on missing key.
- `examples/scenarios/reviewer-mistral.toml` — sample peer config.
- 12 new unit tests including object-arguments tool_call handling
  (Mistral sometimes returns parsed args, OpenAI returns strings).

## 0.1.8 — 2026-04-25

- `dry-run` now validates the parsed `agent.toml` against the JSON
  Schema in `src/cli/schema.js`. Catches typos in section names,
  unknown properties at any depth, wrong types, enum violations
  (e.g. `model.adapter = "cohere"`), missing required fields, minimum
  / minLength violations.
- New module `src/cli/schema-validate.js` — minimal Draft-2020-12
  validator covering the subset our schema uses (additionalProperties,
  required, type, enum, minimum, minLength). Zero new dependencies.
- New "schema validation" check in dry-run output, between load-config
  and claude-code-advisory.
- 11 new unit tests including a drift-guard that validates every
  scenario in `examples/scenarios/` against the SCHEMA.

## 0.1.7 — 2026-04-25

- **GitHub Action** (`action.yml` at the repo root) — composite action
  that drops a xmesh-agent peer into any GitHub Actions workflow.
  Inputs: config OR scaffold flags (role / adapter / model / group /
  peer-name), cost-cap-usd, duration-seconds, anthropic-api-key,
  openai-api-key, xmesh-agent-version. Outputs: cmbs-emitted, cost-usd,
  config-path. Five steps: setup-node → install xmesh-agent → resolve
  config (or scaffold inline) → dry-run validate → run with bounded
  duration + cost cap.
- `docs/github-action.md` — quickstart (review-bot on every PR),
  inputs/outputs reference, multi-peer mesh-in-CI pattern using a
  relay (Bonjour doesn't cross runners), custom-config example, cost
  discipline guidance, troubleshooting.

## 0.1.6 — 2026-04-25

- `xmesh-agent doctor` — one-command health check across the local
  setup. Reports node version, baseDir, identity keys (with mode
  warnings if not 0600), trusted-keys groups, persistent state +
  lifetime totals, running peer IPC sockets (pings them for liveness),
  and environment variables. Exits 0 on healthy / 1 on issues with
  concrete fix suggestions per issue.

## 0.1.5 — 2026-04-25

- Friendlier error messages across the operator entry path:
  - `loadConfig` — file-not-found names the path + suggests
    `xmesh-agent init`; malformed TOML cites the parse error + links
    https://toml.io; missing required section / CAT7 weight / model
    adapter all link to remediation
  - `pickModelAdapter` — missing API key gives the exact `export`
    command + the vendor's key-management URL
  - `dryRun` — model adapter check now includes the export hint inline;
    on PASS prints the exact `xmesh-agent run --config <path>` command;
    on FAIL points at `docs/getting-started.md` + the init command
- CAT7 weight completeness now checked at config-load time (was
  dry-run only) — fails earlier with a clearer message

## 0.1.4 — 2026-04-25

- `xmesh-agent init <peer-name>` — scaffold a starter `agent.toml` with
  role-specific α weights, adapter defaults, sensible budget caps, and
  a "next steps" prompt. Supports `--role` (writer / reviewer /
  test-writer / auditor / generator / spec / generic), `--adapter`
  (anthropic / openai / ollama), `--group`, `--model`, `--cost-cap`,
  `--out`, `--force`. Round-trip tested against `loadConfig`. Uses
  `flag: 'wx'` exclusive-create on writeFileSync — eliminates TOCTOU
  race window between existence check and write.
- **Security:** IPC handler dispatch (`src/cli/ipc.js`) now guards
  against prototype-chain method names. `handlers[req.cmd]` previously
  resolved `cmd=toString` to `Object.prototype.toString`, bypassing
  the unknown-cmd guard. Fixed via `Object.prototype.hasOwnProperty`
  check + function-type validation. CodeQL js/unvalidated-dynamic-method-call.
- 5 new bundled scenarios in `examples/scenarios/`:
  `security-reviewer.toml` (auditor role, attacker-perspective lens),
  `doc-writer.toml` (long-form docs on gpt-4o), `spec-drafter.toml`
  (architecture-level specs on Claude Opus), and a mixed-vendor triad
  (`mixed-vendor-{writer,reviewer,test-writer}.toml`) demonstrating
  the "any model" claim with Anthropic + OpenAI + Ollama on the same
  wire. Total 11 scenarios (was 6).
- scenarios/README.md updated with full table + 5 recommended triads.

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
