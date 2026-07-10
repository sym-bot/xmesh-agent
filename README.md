<div align="center">

# xmesh-agent

### Autonomous LLM agents that wake on each other's messages —<br>reason with _any_ model, answer agent-to-agent, no host IDE.

<p>
  <a href="https://www.npmjs.com/package/@sym-bot/xmesh-agent"><img src="https://img.shields.io/npm/v/@sym-bot/xmesh-agent" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"></a>
  <a href="#requirements"><img src="https://img.shields.io/badge/node-%E2%89%A518-brightgreen" alt="node"></a>
  <a href="https://meshcognition.org/spec/mmp"><img src="https://img.shields.io/badge/protocol-MMP_v1.0-orange" alt="MMP Spec"></a>
  <a href="https://arxiv.org/abs/2604.19540"><img src="https://img.shields.io/badge/arXiv-2604.19540-b31b1b.svg" alt="MMP paper"></a>
  <a href="https://arxiv.org/abs/2604.03955"><img src="https://img.shields.io/badge/arXiv-2604.03955-b31b1b.svg" alt="SVAF paper"></a>
</p>

**wake on a message&nbsp; → &nbsp;reason with any model&nbsp; → &nbsp;answer, agent-to-agent&nbsp; → &nbsp;peers self-select**

`npm install -g @sym-bot/xmesh-agent`

**▸ [Open the one-page overview](https://htmlpreview.github.io/?https://github.com/sym-bot/xmesh-agent/blob/main/docs/overview.html)**

*The autonomous agent runtime for [xmesh](https://xmesh.bot) — built on the open [SYM](https://github.com/sym-bot/sym) mesh.*

</div>

> Copilots wait for you. **xmesh-agent peers don't.** They run headless in the background, wake the moment a relevant message crosses the mesh, reason with their own configured model, and answer — agent-to-agent, with no orchestrator in the middle and no IDE in the loop. Spin up a writer, a reviewer, and a test-writer; seed one task; watch them coordinate.

```bash
npm i -g @sym-bot/xmesh-agent
xmesh-agent run --config examples/scenarios/reviewer-openai.toml
```

> **No API key handy?** [Try the wire first in 60 seconds](examples/scenarios/two-peer-no-llm.md) — install `@sym-bot/sym`, emit two CMBs from two terminals, recall them. No LLM required. Once you've seen typed messages with provenance flow between identities, the autonomous LLM peers below run on top of the same wire.

---

## What is xmesh-agent?

**xmesh-agent runs autonomous LLM peers on the open mesh — agents that act on their own instead of waiting for you to drive them.**

First, the word: **the mesh is just agents connected directly to each other** — agent-to-agent, no central server in the middle. A peer is one process that wakes on an incoming message, calls a model, and emits a response; every other peer decides *for itself* whether that response is relevant. There's no router and no orchestrator — admission is the receiving agent's own call.

**Two functions, one runtime:**

1. **Real-time duplex agent-to-agent communication.** Peers exchange messages directly via local-network discovery (Bonjour) or an optional WebSocket relay. No polling, no central coordinator.
2. **Autonomous collective intelligence.** Each peer wakes on incoming messages, reasons via its configured model, and emits a response. The receiver decides per-field whether to admit — using its own α (alpha) weights over seven semantic categories. Aligned peers converge; divergent peers stay sovereign.

The substrate is **MMP** (Mesh Memory Protocol — `arXiv:2604.19540`) and **SVAF** (Symbolic-Vector Attention Fusion — `arXiv:2604.03955`). Messages are **CMBs** (Cognitive Memory Blocks) carrying the **CAT7** schema: focus, issue, intent, motivation, commitment, perspective, mood.

> **xmesh-agent vs [`@sym-bot/sym`](https://github.com/sym-bot/sym) — which do I want?** They're complementary, not alternatives. Use **sym** directly if you already run AI copilots (Claude Code, Cursor, Copilot) and just want them to share memory through a SKILL file — each copilot stays in its own UI. Use **xmesh-agent** if you want **dedicated autonomous peers** that wake on incoming messages and call a model on their own, with no host IDE. Mix both in one mesh: a Claude Code session via SYM plus a couple of xmesh-agent peers as background reviewers all see each other's CMBs.

## Why do you need it?

Multi-agent systems today coordinate through a central orchestrator — a server, a queue, or a single human REPL. That model breaks at the edge: when there's no server, when latency kills, when each agent must stay sovereign. Wiring agents together means integration code between every pair, and it only connects the agents you thought to wire.

**xmesh-agent flips it.** Every agent is a peer, every message is a CMB on the mesh, and admission is decided by the *receiving* agent's own attention weights — not by a router you configure and maintain. An agent you forgot you had can still answer. An agent with nothing to add costs nothing — its gate rejects silently, no tokens spent.

## How do you use it?

### 1. Install

```bash
npm install -g @sym-bot/xmesh-agent
```

### 2. Define a peer

A peer is one `agent.toml` — its identity, its group, its role α-weights (what it pays attention to), and its model:

```toml
[identity]
name = "reviewer-01"
role = "reviewer"

[mesh]
group = "my-team"

[role_weights]      # what this peer attends to (SVAF α)
focus = 1.0
issue = 2.5         # a reviewer weights "issue" heavily
commitment = 2.0

[model]
adapter = "openai"
model_name = "gpt-4o-mini"

[attach]
mode = "headless"
```

Validate before running — config + adapter + budgets, no mesh join, no model call:

```bash
xmesh-agent dry-run --config path/to/reviewer-01.toml
```

### 3. Run the peer, then seed a task

```bash
export OPENAI_API_KEY=sk-proj-...           # or ANTHROPIC_API_KEY, or run Ollama
xmesh-agent run --config path/to/reviewer-01.toml   # logs "[run] xmesh-agent started", waits

# from another terminal — broadcast a task into the group:
sym observe --group my-team \
  --focus "implement rate-limit middleware on /api/login" \
  --intent "draft a spec, review it, add tests"
```

Within seconds the peer logs `model-call` then `emitted`. Add more peers (writer, test-writer) to the same group and they coordinate end-to-end — each waking on the others' responses, each running its own SVAF admission. Watch and control:

```bash
xmesh-agent status <peer>      # state, uptime, budget usage
xmesh-agent cost <peer>        # this-run + lifetime cost
xmesh-agent trace <peer> <id>  # ancestor lineage of a CMB
xmesh-agent stop <peer>        # graceful shutdown
```

> Five-minute walkthrough from `npm i` to three peers coordinating: **[docs/getting-started.md](docs/getting-started.md)**.

## Three model adapters out of the box

| Adapter | Models | Credential |
|---|---|---|
| `anthropic` | `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-5`, `gpt-5-mini`, `gpt-4o`, `gpt-4o-mini`, `o1` | `OPENAI_API_KEY` |
| `ollama` | any local model (`llama3.2:3b`, `qwen2.5-coder`, …) | none — `ollama serve` on `localhost:11434` |

Same agent loop, same wire protocol, different inference backend. That's the "any model" claim made mechanical.

## Why this is different from multi-agent frameworks

| | CrewAI / AutoGen / LangGraph | xmesh-agent |
|---|---|---|
| **Who decides which agent answers?** | You configure routing | The receiving agent decides, per message |
| **Unknown agents contribute?** | No — only agents you wired | Yes — any coupled peer |
| **Irrelevant agents waste tokens?** | Often — broadcast to all | Never — gate rejects silently |
| **Answer traceable?** | Depends on implementation | Always — lineage DAG |
| **Runs headless, no host IDE?** | Usually in-process | Native — background peers |
| **Cross-process / cross-device?** | Single-process (usually) | Native — Bonjour LAN + relay |
| **Protocol open?** | Framework-specific | Open spec ([MMP](https://meshcognition.org/spec/mmp)) + arXiv papers |

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
        OpenAI           Claude Code (advisory)      ▼
        Ollama                                @sym-bot/sym
                                              (MMP transport, SVAF
                                               kernel, CMB store + lineage)
```

Each axis is independently swappable. The mesh adapter is fixed (MMP via `@sym-bot/sym`) — that's the open-protocol commitment.

## Safety envelope

Built-in guardrails for autonomous agents on real repos:

- **Wake-budget** — burst (10/min), sustained (100/hr), daily (1000) caps with soft-warn at 80%
- **Cycle detection** — suppresses emission when a CMB's ancestor chain loops back to this peer; a commitment-field exception lets a peer close out a task
- **Token + cost cap** — per-call max-tokens; per-run cost cap with auto-stop on overrun
- **Approval gates** — pattern-matched fields (`git push`, `commit to main`, `deploy`, `.env`, `secrets`) blocked from emission
- **Circuit breaker** — opens after 5 consecutive model failures; half-opens after 60s; exponential backoff; transient-error detection (HTTP 429/502/503/504, `ECONNRESET`)
- **Identity-collision exit** — a peer exits cleanly if another claims the same name on the relay

All defaults live in `examples/agent.toml.example`; override per peer.

## Identity

ed25519 keypair generation, storage, and signing/verification primitives ship today: `xmesh-agent keygen <peer>` writes a key to `~/.xmesh/keys/`, `xmesh-agent trust add` pins a peer's public key. **Caveat:** the wire path does not yet sign or verify CMBs — the identity material is generated and ready, and protocol-level signing (admission modes `tofu` / `strict` / `open`, with a mixed-version migration window) is the next planned ship. See [ROADMAP.md](ROADMAP.md).

## CLI

```
xmesh-agent run --config <path>        Start a peer (headless)
xmesh-agent dry-run --config <path>    Validate config + adapter without joining the mesh
xmesh-agent stop | status | cost <peer>   Lifecycle + budget + cost
xmesh-agent trace <peer> <cmb-id>      Print the ancestor lineage of a CMB
xmesh-agent keygen | fingerprint | trust  ed25519 identity (Phase-1)
xmesh-agent schema                     Print the agent.toml JSON Schema (for editors)
xmesh-agent migrate [--apply]          Move legacy ~/.xmesh-agent/ to ~/.xmesh/
```

Every command has `--help`. Lifecycle commands need the peer's IPC socket at `~/.xmesh/<peer>.sock` (peer must be running).

## Requirements

- Node.js ≥ 18 · macOS, Linux, or Windows
- One of: Anthropic API key, OpenAI API key, or a local Ollama install
- Multi-peer: peers on the same LAN (Bonjour), or sharing a relay URL + token

## Project status

**0.1.x is alpha** — the API surface is stable enough to build on; CLI and config schema may evolve before 1.0. 303 unit tests across the source modules; CI green on Node 18, 20, 22. End-to-end real-API run with three peers on `gpt-4o-mini` validated 2026-04-24 — three model calls, three CAT7 CMBs, three lineage chains, total cost $0.00023. What's coming: [ROADMAP.md](ROADMAP.md).

## Documentation

- **[docs/getting-started.md](docs/getting-started.md)** — five-minute quickstart, `npm i` to three peers
- **[docs/concepts.md](docs/concepts.md)** — CMB, CAT7, SVAF, α weights, lineage, the autonomous loop
- **[docs/cookbook.md](docs/cookbook.md)** — recipes: coding triad, mixed-vendor mesh, cross-host, custom α
- **[docs/comparison.md](docs/comparison.md)** — vs LangGraph / CrewAI / AutoGen / MCP
- **[docs/github-action.md](docs/github-action.md)** — drop a peer into any GitHub Actions workflow
- **[OPERATIONS.md](OPERATIONS.md)** — launch-day runbook + kill-switch playbook

## Related

- **Runtime home:** [xmesh.bot](https://xmesh.bot) — build & run autonomous agents on the open mesh
- **Substrate:** [`@sym-bot/sym`](https://github.com/sym-bot/sym) — MMP transport, SVAF kernel, CMB store + lineage
- **Claude Code shim:** [`@sym-bot/mesh-channel`](https://github.com/sym-bot/sym-mesh-channel) — MCP plugin that pairs a Claude Code session into the mesh
- **Spec:** [meshcognition.org/spec/mmp](https://meshcognition.org/spec/mmp) — Mesh Memory Protocol v1.0 (CC-BY-4.0)

## License

Apache-2.0. Copyright (c) 2026 SYM.BOT. Issues + pull requests welcome.

**[SYM.BOT](https://sym.bot)** — Glasgow, Scotland.
