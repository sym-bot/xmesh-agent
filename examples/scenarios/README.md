# xmesh-agent demo scenario — 3-peer coding mesh

Runtime doc §6.1 Phase-1 acceptance scenario. Three headless peers exchange CMBs
autonomously for ≥ 5 minutes, total cost < $5, ≥ 10 CMBs per peer, no infinite loops.

## Topology

```
  writer-01 ─── issue describes feature want  ──►  reviewer-01
      ▲                                                 │
      │                                                 │
      └─── tests + confidence ◄── test-writer-01 ◄──────┘
```

- **writer-01** — drafts specs from issue descriptions (α_f: intent + focus weighted high)
- **reviewer-01** — identifies issues + blockers + commitment gaps (α_f: issue + commitment)
- **test-writer-01** — generates regression tests from specs + review (α_f: commitment + issue)

All three join the same mesh group `xmesh-demo` via Bonjour. They discover each
other automatically; no central coordinator, no scheduler.

## Running the scenario

Each peer needs `ANTHROPIC_API_KEY` in its environment. Pick a scratch branch
on a sample repo before starting — the demo is **autonomous** and approval gates
are the only defence against blast radius.

In three separate terminals:

```bash
# Terminal 1
export ANTHROPIC_API_KEY=sk-ant-...
xmesh-agent run --config examples/scenarios/writer.toml

# Terminal 2
export ANTHROPIC_API_KEY=sk-ant-...
xmesh-agent run --config examples/scenarios/reviewer.toml

# Terminal 3
export ANTHROPIC_API_KEY=sk-ant-...
xmesh-agent run --config examples/scenarios/test-writer.toml
```

## Seeding a first CMB

The mesh is quiet on startup (no admissions = no wakes). Seed with the
`@sym-bot/mesh-channel` MCP plugin or the `sym` CLI from a fourth process:

```bash
sym observe --group xmesh-demo \
  --focus "implement rate-limit middleware for /api/login" \
  --intent "draft a spec, review it, add tests" \
  --motivation "prod outage on Apr 21 traced to credential stuffing"
```

Once the first CMB lands, the writer peer admits it, produces a spec CMB, which
reviewer admits and responds to with issues, which test-writer admits and
responds to with tests. The cycle continues until a peer emits a `commitment`
field (which terminates the cycle-detection chain) or the wake-budget caps out.

## Safety envelope

- Wake-budget: 5 wakes/minute per peer (≤ 15 wakes/minute across the triad)
- Cost cap: $2/peer/run hard-stop → $6 total worst-case
- Cycle detection at depth 5 with commitment exception
- Approval gates block: `git push`, `deploy`, `commit to main`, `.env` writes

All budgets default-tight for Phase 1. Loosen per-deployment via `agent.toml`.

## Observing the mesh

From a fourth terminal:

```bash
sym peers --group xmesh-demo     # see three peers connected
sym recall --group xmesh-demo    # read the mesh memory graph
```

Or attach Claude Code / Claude Desktop with `@sym-bot/mesh-channel` configured
to group `xmesh-demo` — the mesh-channel MCP plugin surfaces all admitted CMBs
as `<channel>` events in the transcript.

## Acceptance criterion (runtime doc §7.5)

- Runs autonomously for ≥ 5 min
- Total cost across three peers < $5
- Each peer produces ≥ 10 CMBs
- No human input after `xmesh-agent run` commands
- No cycle-detection bypass (check `stats.cmbsSuppressed` vs emitted)
- No approval-gate violations (check logs for `approval-gate-blocked`)
- All three peers exit cleanly on SIGINT
