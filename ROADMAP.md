# Roadmap

Where `@sym-bot/xmesh-agent` is going. Items in **In flight** are committed work; items in **Designed** have a written spec waiting on review or upstream coordination; items in **Considering** are likely-but-not-yet-committed.

This is a living document. Open an issue to suggest changes.

---

## Released — v0.1.x (alpha)

The autonomous agent runtime is shipped on npm and verified end-to-end. Public alpha.

- Three model adapters: Anthropic, OpenAI, Ollama
- Headless attach mode + Claude Code mesh-channel compatibility advisory
- Six-layer safety envelope: wake-budget, cycle detection, token cap, cost cap, approval gates, circuit breaker
- Structured JSON logging with size-based file rotation
- Persistent per-peer state (lifetime cost + CMB counts across restarts)
- IPC control plane: `stop`, `status`, `cost`, `trace` over Unix socket
- ed25519 identity primitive (keygen, sign, verify, trust pinning) — *wire path not yet active; see Designed*
- Full CLI: `run`, `dry-run`, `keygen`, `fingerprint`, `trust`, `migrate`, `schema`
- 225 unit tests, 4 smoke tests, CI matrix on Node 18 / 20 / 22, lint, secret-scan, install rehearsal, CodeQL
- Cross-host runbook + operations runbook + publishing runbook
- End-to-end real-API verification (OpenAI gpt-4o-mini three peers, $0.00023 per run)

See [`CHANGELOG.md`](CHANGELOG.md) for per-version detail.

---

## In flight — next minor (v0.2.0)

Polish + extension within the existing single-process / no-wire-change envelope. No breaking changes.

- **More example scenarios** — auditor, security-reviewer, doc-writer roles with role-specific α weights
- **Improved error messages** — friendlier output when `agent.toml` is malformed, when API keys are wrong, when Bonjour discovery times out
- **Coverage threshold in CI** — enforce ≥ 80% line coverage on new code
- **Pre-commit hook** — optional lefthook setup for local lint + test before push
- **`xmesh-agent init <peer>`** — scaffolds a starter `agent.toml` + keypair + role profile
- **Live Anthropic + OpenAI smoke required (not just skip-gated) when keys are present in CI** — catches adapter regressions across model-vendor SDK bumps

Tracked via the [`v0.2.0` milestone](https://github.com/sym-bot/xmesh-agent/milestones).

---

## Designed — wire-signed CMBs (next major, v0.3.0 or named "Phase 2")

Ed25519-signed CMBs verified at admission time. The Phase-1 identity primitive becomes wire-active. **Coordinated breaking change across `@sym-bot/sym` v0.6.0 + `@sym-bot/mesh-channel` v0.4.0 + MMP spec v0.3.0.**

Scope:

- Envelope delta — every CMB carries `identity.publicKey` + `identity.keyId` + `signature` over a canonical content hash
- Three admission modes per group: `tofu` (trust-on-first-use, default), `strict` (pre-loaded keys only), `open` (legacy interop opt-in)
- Mixed-version migration window — older v0.5.x peers continue to interop for ~30–60 days; the v0.6.0 default flips to strict after the window
- Key rotation with dual-sign grace window
- 30–60 day mixed-version window — no hard cutover

Coordination matrix:

| Package | Change | Status |
|---|---|---|
| MMP spec | v0.2.3 → v0.3.0 envelope delta | designed; published with v0.6.0 |
| `@sym-bot/sym` | v0.5.x → v0.6.0 (BREAKING) | designed; in queue |
| `@sym-bot/mesh-channel` | v0.3.x → v0.4.0 | designed; depends on sym v0.6.0 |
| `@sym-bot/sym-swift` | matching ed25519 branch | designed; depends on spec v0.3.0 |
| `@sym-bot/xmesh-agent` | adopt v0.6.0 sym; admission-mode config | this repo, low effort once upstream lands |

Eta: depends on upstream. xmesh-agent will adopt within ~1 week of `@sym-bot/sym` v0.6.0 GA.

---

## Designed — interactive attach modes

Pair existing single-agent IDEs into the mesh as peers. Each shim adapts its host's IPC convention to the same mesh adapter.

- **Claude Code** — already supported via the separate `@sym-bot/mesh-channel` MCP plugin (no work in this repo)
- **Cursor** — designed; MCP-host interop investigation pending
- **Codex** — designed; depends on Codex CLI's plugin model stabilising

These will land as separate `attach.mode` values in `agent.toml` once one of them is built and verified end-to-end.

---

## Considering

No commitment yet. Open issues to vote / discuss.

- **Shared team DAG** — a CRDT-merged CMB graph scoped to a group, so peers see a unified team-memory view rather than only their own remix store
- **Convergence / deadlock detection** beyond cycle detection — periodic commitment-CMBs + quorum agreement signal
- **Role conflict arbitration** at the group level — protocol-level rule for "two peers both claim the same role"
- **HTTP control plane** — REST surface alongside the IPC socket so a web dashboard can render `status` / `cost` / `trace`
- **Streaming model output** — relevant for interactive attach modes; not needed for headless
- **Post-quantum signatures** — Phase-3+; ed25519 is the current primitive
- **Platform-keychain key storage** — macOS Keychain / Windows Credential Manager as opt-in alternative to file-based
- **JVM / Rust reference implementations of MMP** — third-party CC-BY-4.0 implementations welcomed; we'll link them when they exist

---

## Versioning policy

- **0.1.x** — alpha. CLI and config schema may evolve. Breaking changes called out explicitly in CHANGELOG.
- **0.2.x** — beta-equivalent. Stable CLI surface + config schema. Behavior changes via additive config flags.
- **0.3.x / "Phase 2"** — wire-signed CMBs. Coordinates with `@sym-bot/sym` v0.6.0. Mixed-version migration window per the Designed section above.
- **1.0.0** — when the spec is at v0.3+ stable, two production deployments report sustained use, and the API surface has been stable for ≥ 60 days.

Semantic versioning followed strictly from 1.0.0 onward.

---

## Contributing to the roadmap

- **Bug or missing capability?** Open an issue with the [feature_request](.github/ISSUE_TEMPLATE/feature_request.md) template.
- **Want to upgrade a "Considering" item to "In flight"?** Open an issue and tag it `roadmap`. Describe the use case + proposed approach.
- **Building an MMP-compliant implementation in another language?** Drop a link in an issue tagged `ecosystem` — happy to cross-reference.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development workflow.
