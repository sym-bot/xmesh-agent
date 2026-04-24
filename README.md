# @sym-bot/xmesh-agent

Autonomous agent runtime for the xmesh mesh. One process per agent, three orthogonal axes (model × attach × mesh), one wire protocol (MMP).

```bash
npm i -g @sym-bot/xmesh-agent
```

## What it does

xmesh-agent makes "agent-to-agent mesh for collective intelligence" mechanical:

1. **Real-time duplex.** Peers exchange CAT7 CMBs via Bonjour LAN or WebSocket relay — no polling, no central coordinator.
2. **Autonomous collective intelligence.** Each peer wakes on admitted CMBs, reasons via its configured model, emits a response. Per-node SVAF α_f admission decides what each peer accepts. Aligned peers converge; divergent peers stay sovereign.

Three model adapters out of the box:
- **Anthropic** (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`) — set `ANTHROPIC_API_KEY`
- **OpenAI** (`gpt-5`, `gpt-4o`, `o1`) — set `OPENAI_API_KEY`
- **Ollama** (local, zero cost) — `ollama serve` on `localhost:11434`

## Quickstart — 3-peer demo

```bash
# 1. Install
npm i -g @sym-bot/xmesh-agent

# 2. Generate identity keys for each peer (Phase-1 primitive — wire signing in Phase 2)
xmesh-agent keygen writer-01
xmesh-agent keygen reviewer-01
xmesh-agent keygen test-writer-01

# 3. Set credentials
export ANTHROPIC_API_KEY=sk-ant-...

# 4. In three terminals (one per peer):
xmesh-agent run --config examples/scenarios/writer.toml
xmesh-agent run --config examples/scenarios/reviewer.toml
xmesh-agent run --config examples/scenarios/test-writer.toml

# 5. Seed a CMB from any sym client to kick off the cycle
sym observe --group xmesh-demo \
  --focus "implement rate-limit on /api/login" \
  --intent "draft -> review -> tests"

# Watch the mesh:
xmesh-agent status writer-01
xmesh-agent cost writer-01
xmesh-agent trace writer-01 <cmb-id>
```

Demo scenario runs autonomously, $5/peer/run cap, ≤ 5 min, ≥ 10 CMBs per peer. Stop with `xmesh-agent stop <peer>` (graceful drain).

## CLI surface

```
xmesh-agent run --config <path>            Start a peer (headless attach)
xmesh-agent dry-run --config <path>        Validate config + adapters without joining mesh
xmesh-agent stop <peer>                    Graceful shutdown
xmesh-agent status <peer>                  Peer state, uptime, budget
xmesh-agent cost <peer>                    Per-run + lifetime cost
xmesh-agent trace <peer> <cmb-id>          Print ancestor lineage
xmesh-agent keygen <peer> [--force]        Generate ed25519 identity keypair
xmesh-agent fingerprint <peer>             Print keyprint + full fingerprint
xmesh-agent trust add --group <g> --peer <p> --public-key <b64url>
xmesh-agent trust list --group <g>
xmesh-agent migrate [--apply]              Migrate ~/.xmesh-agent/ -> ~/.xmesh/
xmesh-agent schema                         Print JSON Schema for agent.toml
```

## Architecture (three orthogonal axes)

```
                ┌────────────────────────────────────────┐
                │   xmesh-agent — core loop              │
                │   wake on admitted CMB → assemble      │
                │   context → model call → emit CMB      │
                └────────────────────────────────────────┘
                   ↕               ↕              ↕
          model adapter    attach mode    mesh adapter
                                                  │
          Anthropic        headless           ────┼────►
          OpenAI           Claude Code             SymNode
          Ollama           Cursor (P2)             (MMP 0-7)
                           Codex (P2)
```

Same SymNode wire protocol regardless of which model + which attach mode. That is the "any model, any copilot, open protocol" claim made mechanical.

## Safety envelope

- **Wake-budget** — burst (10/min), sustained (100/hr), daily (1000) caps with soft-warn at 80%
- **Cycle detection** — admits CMBs whose ancestor chain doesn't loop back to this peer; commitment-field exception lets you close out a task
- **Token + cost cap** — per-call max_tokens, per-run cost cap with auto-stop on overrun
- **Approval gates** — pattern-matched fields (`git push`, `commit to main`, `deploy`, `.env`, `secrets`) parked rather than emitted
- **Circuit breaker** — opens on 5 consecutive model failures, half-opens after 60s, exponential backoff

All defaults in `examples/agent.toml.example`. Override per-peer.

## Identity (Phase 1 → Phase 2)

**Today (Phase 1):** ed25519 keypairs generated + stored at `~/.xmesh/keys/<peer>.{key,pub,json}` (private key 0600). Trusted-peer registry at `~/.xmesh/trusted-keys/<group>/`. Sign + verify primitives available; CMBs not yet wire-signed.

**Phase 2 (May–Jun 2026):** wire signing in `@sym-bot/sym` v0.6.0 with envelope delta in MMP spec v0.3.0. Three admission modes: `tofu` (default, trust-on-first-use), `strict` (pre-loaded keys only), `open` (legacy interop). 30–60 day mixed-version migration window — no hard cutover. Full plan in `sym-strategy/architecture/xmesh_identity_signing_v0.1.md`.

## Repo layout

```
src/
  core/      loop, lifecycle, context assembly, structured logger, state store
  model/     adapter interface + Anthropic, OpenAI, Ollama implementations
  attach/    headless attach mode (P1) + Claude Code compat advisory
  mesh/      SymNode wrapper
  safety/    budget, cycle detection, approval gates, circuit breaker, identity
  cli/       run, stop, status, cost, trace, keygen, fingerprint, trust, migrate, schema, dry-run
  runtime/   shared paths (~/.xmesh/...)
test/        node:test — 221 unit + smoke (Bonjour/Anthropic/relay)
examples/    agent.toml.example + scenarios/ + cross-host-runbook.md
```

## Related

- **Spec:** `https://sym.bot/spec/mmp` (current v0.2.3; v0.3.0 in Phase 2)
- **Substrate:** [`@sym-bot/sym`](https://github.com/sym-bot/sym) (mesh runtime + SVAF kernel)
- **Claude Code shim:** [`@sym-bot/mesh-channel`](https://github.com/sym-bot/sym-mesh-channel) (MCP plugin for REPL pairing)
- **Architecture:** `sym-strategy/architecture/xmesh_runtime_v0.1.md`
- **Operations:** `OPERATIONS.md` — launch-day runbook + kill-switch playbook
- **Publishing:** `PUBLISHING.md` — release rehearsal + npm-publish runbook

## License

Apache-2.0. Copyright (c) 2026 SYM.BOT.
