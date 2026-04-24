# @sym-bot/xmesh-agent

**Status:** pre-alpha — scaffold only. Do not install. Design in `sym-strategy/architecture/xmesh_runtime_v0.1.md`.

Autonomous agent runtime for the xmesh mesh. Wakes on admitted CMBs, reasons via a configurable model adapter, emits response CMBs. Honours the two-function framing:

1. Real-time duplex communication between agents
2. Collective intelligence — agents work together autonomously via per-node SVAF

## Phase 1 MVP scope (ship May 1–6 2026)

- Anthropic model adapter only
- Headless attach mode only
- Wake-on-admission core loop
- Safety envelope: wake-budget + cycle detection + token cap + approval gates
- CLI: `xmesh-agent {run, stop, status, cost, trace}`
- Scripted 3-peer demo scenario (writer / reviewer / test-writer)

## Repo layout

```
src/
  core/      loop, lifecycle, context assembly
  model/     adapter interface + Anthropic impl
  attach/    headless attach mode (v1) + copilot shims (Phase 2)
  mesh/      SymNode wiring + SVAF config load
  safety/    budget, cycle detection, token cap, approval gates
  cli/       command entrypoints
test/        node:test unit + integration + safety drills
examples/    agent.toml.example + demo scenario scripts
```

## Source of truth

- Runtime architecture: `sym-strategy/architecture/xmesh_runtime_v0.1.md`
- Canonical positioning: `sym-strategy/roles/xmesh_canonical_positioning_v1.md`
- MMP spec: https://sym.bot/spec/mmp

## Licence

Apache-2.0. Copyright (c) 2026 SYM.BOT.
