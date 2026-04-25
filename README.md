# @sym-bot/xmesh-agent

[![npm](https://img.shields.io/npm/v/@sym-bot/xmesh-agent.svg)](https://www.npmjs.com/package/@sym-bot/xmesh-agent)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#requirements)

Run autonomous agents that talk to each other directly over a peer-to-peer mesh — **any model, any copilot, open protocol**.

```bash
npm i -g @sym-bot/xmesh-agent
```

---

## Why

Multi-agent systems today coordinate through a central orchestrator (a server, a queue, or a single human REPL). That model breaks at the edge — when there's no server, when latency kills, when each agent must stay sovereign. xmesh-agent flips it: every agent is a peer, every message is a CMB on the mesh, and admission is decided by the receiving agent's own attention weights, not by a router.

**Two functions, one runtime:**

1. **Real-time duplex agent-to-agent communication.** Peers exchange messages directly via local-network discovery (Bonjour) or an optional WebSocket relay. No polling. No central coordinator.
2. **Autonomous collective intelligence.** Each peer wakes on incoming messages, reasons via its configured model, and emits a response. The receiving peer decides per-field whether to admit — using its own α (alpha) weights over seven semantic categories. Aligned peers converge. Divergent peers stay sovereign.

The substrate is **MMP** (Mesh Memory Protocol — `arXiv:2604.19540`) and **SVAF** (Symbolic-Vector Attention Fusion — `arXiv:2604.03955`). Messages are **CMBs** (Cognitive Memory Blocks) carrying the **CAT7** schema: focus, issue, intent, motivation, commitment, perspective, mood.

---

## Three model adapters out of the box

| Adapter | Models | Credential |
|---|---|---|
| `anthropic` | `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-5`, `gpt-5-mini`, `gpt-4o`, `gpt-4o-mini`, `o1` | `OPENAI_API_KEY` |
| `ollama` | any local model (`llama3.2:3b`, `qwen2.5-coder`, …) | none — `ollama serve` on `localhost:11434` |

Same agent loop, same wire protocol, different inference backend. That's the "any model" claim made mechanical.

---

## Requirements

- Node.js ≥ 18
- macOS, Linux, or Windows (WSL or native)
- One of: Anthropic API key, OpenAI API key, or local Ollama install
- For multi-peer demos: peers must be on the same LAN (Bonjour) or share a relay URL + token

---

## Quickstart — single peer, smoke test

This proves the runtime + your chosen model adapter work end-to-end. Costs ~$0.0001 on `gpt-4o-mini`.

```bash
# 1. Install
npm i -g @sym-bot/xmesh-agent

# 2. Locate the bundled examples (path depends on your npm prefix)
EXAMPLES="$(dirname $(realpath $(which xmesh-agent)))/../lib/node_modules/@sym-bot/xmesh-agent/examples"
# (or just: clone the repo with `git clone https://github.com/sym-bot/xmesh-agent`)

# 3. Set credentials for the adapter you'll use
export OPENAI_API_KEY=sk-proj-...     # or ANTHROPIC_API_KEY=sk-ant-...

# 4. Validate config + adapter without joining the mesh
xmesh-agent dry-run --config "$EXAMPLES/scenarios/reviewer-openai.toml"
```

Expected output:

```
xmesh-agent dry-run — no mesh join, no model call, no CMB emission
config: .../examples/scenarios/reviewer-openai.toml

  ok    load config  — peer=reviewer-02-openai group=xmesh-demo adapter=openai
  ok    claude-code advisory  — (info) Claude config has no "sym-mesh-channel" MCP server entry; install @sym-bot/mesh-channel first
  ok    model adapter  — openai gpt-4o-mini (key present)
  ok    SVAF α_f weights  — focus=1 issue=2.5 ...
  ok    budget sanity  — wakes=5/min cost=$2/run
  ok    cycle depth  — 5
  ok    role sanity  — role "reviewer" α_f emphasis matches expectations
  ok    attach mode  — headless

PASS — 8/8 checks passed
```

---

## Quickstart — 3-peer autonomous demo

Three peers (writer, reviewer, test-writer) coordinate end-to-end on a synthetic engineering task. Bundled scenarios in `examples/scenarios/`.

**Setup (one terminal):**

```bash
git clone https://github.com/sym-bot/xmesh-agent
cd xmesh-agent
npm install
export OPENAI_API_KEY=sk-proj-...

# (optional) generate identity keypairs — Phase-1 primitive, not yet wire-required
xmesh-agent keygen writer-02-openai
xmesh-agent keygen reviewer-02-openai
xmesh-agent keygen test-writer-02-openai
```

**Run (three more terminals — one per peer):**

```bash
# Terminal A
xmesh-agent run --config examples/scenarios/writer-openai.toml

# Terminal B
xmesh-agent run --config examples/scenarios/reviewer-openai.toml

# Terminal C
xmesh-agent run --config examples/scenarios/test-writer-openai.toml
```

Each peer logs `[run] xmesh-agent started` and waits for a triggering CMB.

**Seed a CMB to start the cycle (fifth terminal):**

```bash
# Option A: install the sym CLI and broadcast directly
npm i -g @sym-bot/sym
sym observe --group xmesh-demo \
  --focus "implement rate-limit middleware on /api/login" \
  --intent "draft a spec, review it, add tests"

# Option B: pair a Claude Code session into the mesh and use the
# sym_observe MCP tool — see https://github.com/sym-bot/sym-mesh-channel
```

Within a few seconds each peer logs `model-call` then `emitted`. Watch the mesh from a sixth terminal:

```bash
xmesh-agent status writer-02-openai
xmesh-agent cost writer-02-openai
xmesh-agent trace writer-02-openai <cmb-id>
```

**Stop cleanly:**

```bash
xmesh-agent stop writer-02-openai
xmesh-agent stop reviewer-02-openai
xmesh-agent stop test-writer-02-openai
```

The bundled scenarios cap each peer at $2 per run and 5 wakes per minute — total worst case $6, expected actual ~$0.001 on `gpt-4o-mini`.

---

## CLI

```
xmesh-agent run --config <path>            Start a peer (headless attach mode)
xmesh-agent dry-run --config <path>        Validate config + adapter without joining mesh
xmesh-agent stop <peer>                    Graceful shutdown via IPC socket
xmesh-agent status <peer>                  Peer state, uptime, budget usage, lifetime totals
xmesh-agent cost <peer>                    This-run + lifetime cost
xmesh-agent trace <peer> <cmb-id>          Print ancestor lineage of a CMB
xmesh-agent keygen <peer> [--force]        Generate ed25519 identity keypair (Phase-1; not yet wire-active)
xmesh-agent fingerprint <peer>             Print keyprint (16-hex) + fingerprint (64-hex)
xmesh-agent trust add --group <g> --peer <p> --public-key <b64url>
xmesh-agent trust list --group <g>
xmesh-agent migrate [--apply]              Move legacy ~/.xmesh-agent/ to ~/.xmesh/
xmesh-agent schema                         Print JSON Schema for agent.toml (for editor integrations)
```

Each `--help` works. Stop / status / cost / trace require the peer's IPC socket at `~/.xmesh/<peer>.sock` to be present (peer must be running).

---

## Architecture

A peer is the tuple **(model adapter, attach mode, role α weights)** sharing one wire protocol.

```
            ┌────────────────────────────────────────────┐
            │  xmesh-agent — core loop                   │
            │                                            │
            │  wake on admitted CMB                      │
            │   → assemble context (lineage + own +      │
            │     group recents, token-bounded)          │
            │   → model call                             │
            │   → safety checks (cycle / gates)          │
            │   → emit response CMB                      │
            └────────────────────────────────────────────┘
                ↕                ↕                ↕
        model adapter    attach mode      mesh adapter
                                                     │
        Anthropic        headless                    │
        OpenAI           Claude Code (advisory)      │
        Ollama                                       ▼
                                              @sym-bot/sym
                                              (MMP transport,
                                               SVAF kernel,
                                               CMB store + lineage)
```

Each axis is independently swappable. The mesh adapter is fixed (MMP via `@sym-bot/sym`) — that's the open-protocol commitment.

---

## Safety envelope

Built-in guardrails for autonomous agents on real repos:

- **Wake-budget** — burst (10/min), sustained (100/hr), daily (1000) caps with soft-warn at 80%
- **Cycle detection** — suppresses emission when the proposed CMB's ancestor chain loops back to this peer; commitment-field exception lets a peer close out a task
- **Token + cost cap** — per-call max-tokens; per-run cost cap with auto-stop on overrun
- **Approval gates** — pattern-matched fields (`git push`, `commit to main`, `deploy`, `.env`, `secrets`) blocked from emission
- **Circuit breaker** — opens after 5 consecutive model failures; half-opens after 60s; exponential backoff (1s → 30s); transient-error detection (HTTP 429/502/503/504, rate-limit messages, ECONNRESET)
- **Identity-collision exit** — peer exits cleanly if another peer claims the same name on the relay

All defaults documented in `examples/agent.toml.example`. Override per peer.

---

## Response routing

Since v0.1.2, the loop emits responses via **broadcast** by default — every peer in the group sees every response and runs its own SVAF admission. This is the canonical agent-to-agent behaviour.

Other modes via `[routing] response_routing` in `agent.toml`:

- `broadcast` (default) — every peer sees every response
- `targeted` — response goes only to the originator (useful when the originator gates a workflow)
- `auto` — broadcast in small mesh (≤2 peers), targeted otherwise

---

## Identity

**Today:** ed25519 keypair generation + storage + signing/verification primitives are shipped. `xmesh-agent keygen <peer>` generates a key at `~/.xmesh/keys/<peer>.{key,pub,json}` (private key 0600). `xmesh-agent trust add` pins a peer's public key to `~/.xmesh/trusted-keys/<group>/`.

**Today's caveat:** the wire path does not yet sign or verify CMBs. Identity material is generated and ready; the protocol-level integration is the next planned ship.

**Next:** wire signing in `@sym-bot/sym` v0.6.0 with envelope delta in MMP spec v0.3.0. Three admission modes — `tofu` (trust-on-first-use, default), `strict` (pre-loaded keys only), `open` (legacy interop). Mixed-version migration window so older peers keep working.

---

## Configuration

A peer is one `agent.toml`. Minimal example:

```toml
[identity]
name = "reviewer-01"
role = "reviewer"

[mesh]
group = "my-team"

[role_weights]
focus = 1.0
issue = 2.5
intent = 1.2
motivation = 0.8
commitment = 2.0
perspective = 0.5
mood = 0.6

[model]
adapter = "openai"
model_name = "gpt-4o-mini"

[attach]
mode = "headless"
```

Full schema with every option: `xmesh-agent schema`. Annotated example: `examples/agent.toml.example`. Validate before running: `xmesh-agent dry-run --config <path>`.

---

## Repo layout

```
src/
  core/      loop, lifecycle, context assembly, structured logger, state store
  model/     adapter interface + Anthropic / OpenAI / Ollama implementations
  attach/    headless attach mode + Claude Code compat advisory
  mesh/      @sym-bot/sym wrapper
  safety/    budget, cycle, gates, circuit breaker, identity (ed25519)
  cli/       run, stop, status, cost, trace, keygen, fingerprint, trust, migrate, schema, dry-run
  runtime/   shared paths (~/.xmesh/...)
test/        node:test — 225 unit + 4 smoke (Bonjour / Anthropic / OpenAI / relay)
examples/    agent.toml.example + scenarios/ + cross-host-runbook.md
.github/     CI matrix (Node 18/20/22 + lint + secret-scan + install rehearsal)
```

---

## Run the test suite

```bash
git clone https://github.com/sym-bot/xmesh-agent
cd xmesh-agent
npm install

npm test           # 225 unit tests
npm run lint       # ESLint flat-config
npm run smoke      # live tests — Bonjour always; Anthropic/OpenAI/relay skip without env
```

Real-API smoke tests are skip-gated. Set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `SYM_RELAY_URL`+`SYM_RELAY_TOKEN` to enable.

---

## Project status

- **0.1.x** is alpha. API surface is stable enough to build on; CLI commands and config schema may evolve before 1.0.
- **Test coverage:** 225 unit tests across 14 source modules; CI green on Node 18, 20, 22.
- **Production verification:** end-to-end real-API run with three peers on `gpt-4o-mini` validated 2026-04-24 — three model calls, three CAT7 CMBs, three lineage chains, total cost $0.00023.
- **What's coming:** see [`ROADMAP.md`](ROADMAP.md) for the in-flight, designed, and considering buckets.

---

## Related

- **Spec:** [sym.bot/spec/mmp](https://sym.bot/spec/mmp) — Mesh Memory Protocol v0.2.3 (CC-BY-4.0)
- **Substrate:** [`@sym-bot/sym`](https://github.com/sym-bot/sym) — mesh transport, SVAF kernel, CMB store
- **Claude Code shim:** [`@sym-bot/mesh-channel`](https://github.com/sym-bot/sym-mesh-channel) — MCP plugin that pairs a Claude Code session into the mesh
- **Operations runbook:** [`OPERATIONS.md`](OPERATIONS.md) — launch-day procedures + kill-switch playbook
- **Publishing runbook:** [`PUBLISHING.md`](PUBLISHING.md) — release rehearsal + npm-publish steps
- **Cross-host runbook:** [`examples/cross-host-runbook.md`](examples/cross-host-runbook.md) — Mac+Win verification

---

## License

Apache-2.0. Copyright (c) 2026 SYM.BOT.

Issues + pull requests welcome.
