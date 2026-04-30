# Getting Started with xmesh-agent

Five minutes from `npm i` to three peers coordinating autonomously on your machine.

---

## Prerequisites

- Node.js ≥ 18
- One of: an Anthropic API key, an OpenAI API key, or a local Ollama install
- macOS, Linux, or Windows (WSL or native)

---

## Step 1 — Install

```bash
npm i -g @sym-bot/xmesh-agent
```

Verify:

```bash
xmesh-agent --version
# prints the installed version (e.g. 0.1.10)
```

---

## Step 2 — Set credentials

For Anthropic:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or OpenAI:

```bash
export OPENAI_API_KEY=sk-proj-...
```

Or local Ollama (no key, but `ollama serve` must be running and a model pulled):

```bash
ollama pull llama3.2:3b
ollama serve   # leave running in a separate terminal
```

---

## Step 3 — Scaffold a peer config

```bash
xmesh-agent init reviewer-01 --role reviewer --adapter anthropic
```

This writes `reviewer-01.toml` in the current directory with:

- A unique peer name on the mesh
- Role-tuned SVAF α weights (reviewer emphasises issue + commitment)
- Sensible budget caps ($5 per run, 10 wakes per minute)
- Adapter defaults (claude-haiku-4-5 model)
- All seven CAT7 fields configured

Inspect the file — every section is commented.

---

## Step 4 — Validate the config

```bash
xmesh-agent dry-run --config reviewer-01.toml
```

Expected:

```
xmesh-agent dry-run — no mesh join, no model call, no CMB emission
config: reviewer-01.toml

  ok    load config  — peer=reviewer-01 group=xmesh-default adapter=anthropic
  ok    claude-code advisory  — (info) ...
  ok    model adapter  — anthropic claude-haiku-4-5-20251001 (key present)
  ok    SVAF α_f weights  — focus=1 issue=2.5 ...
  ok    budget sanity  — wakes=10/min cost=$5/run
  ok    cycle depth  — 5
  ok    role sanity  — role "reviewer" α_f emphasis matches expectations
  ok    attach mode  — headless

PASS — 8/8 checks passed
```

If any check fails, the message tells you what to fix.

---

## Step 5 — Run three peers in three terminals

Scaffold the writer + test-writer too:

```bash
xmesh-agent init writer-01      --role writer
xmesh-agent init test-writer-01 --role test-writer
```

Now in three separate terminals (each with `ANTHROPIC_API_KEY` exported):

```bash
# Terminal A
xmesh-agent run --config writer-01.toml

# Terminal B
xmesh-agent run --config reviewer-01.toml

# Terminal C
xmesh-agent run --config test-writer-01.toml
```

Each peer logs `[run] xmesh-agent started` and waits.

---

## Step 6 — Seed a CMB to start the cycle

In a fourth terminal, install the sym CLI and broadcast the first CMB:

```bash
npm i -g @sym-bot/sym
sym observe --group xmesh-default \
  --focus "implement rate-limit middleware on /api/login" \
  --intent "draft a spec, review it, add tests" \
  --motivation "production outage traced to credential stuffing"
```

Within seconds, all three peers log `model-call` then `emitted`. They're coordinating — the writer drafts a spec, the reviewer flags issues, the test-writer generates tests, all autonomously, all on the mesh.

---

## Step 7 — Watch the mesh

In a fifth terminal:

```bash
xmesh-agent status writer-01      # peer state, uptime, budget usage
xmesh-agent cost writer-01         # this-run + lifetime cost
xmesh-agent trace writer-01 <cmb-id>   # ancestor lineage of any CMB
```

`<cmb-id>` is whatever shows up in the peer logs as `admittedId`.

---

## Step 8 — Stop cleanly

```bash
xmesh-agent stop writer-01
xmesh-agent stop reviewer-01
xmesh-agent stop test-writer-01
```

Each peer drains in-flight work, closes its IPC socket, and exits with a final stats summary.

---

## What just happened

1. Each peer ran an **autonomous loop**: wake on admitted CMB → assemble context → call its model → emit a response CMB → sleep.
2. Peers discovered each other via **Bonjour** (mDNS) on your local network — no central server.
3. Each admitted CMB went through the receiving peer's **SVAF α weights** — reviewer admits issue-heavy CMBs more eagerly than mood-heavy ones.
4. Every response CMB carries **lineage** back to the CMBs it was derived from. `xmesh-agent trace` walks that DAG.
5. Total cost: typically **$0.001–$0.05 per peer per run** depending on model.

That's the mesh.

---

## Where to go next

- **[`docs/concepts.md`](concepts.md)** — what CMBs, CAT7, SVAF, α weights, mesh groups, and lineage actually mean
- **[`docs/cookbook.md`](cookbook.md)** — common patterns (security review, doc generation, mixed-vendor mesh, CI integration)
- **[`examples/scenarios/README.md`](../examples/scenarios/README.md)** — ready-to-run agent.toml templates covering writer / reviewer / test-writer / security-reviewer / auditor / doc-writer / spec-drafter / mixed-vendor triad, across Anthropic + OpenAI + Ollama + Mistral adapters
- **[`OPERATIONS.md`](../OPERATIONS.md)** — production runbook + kill-switch playbook
- **[`examples/cross-host-runbook.md`](../examples/cross-host-runbook.md)** — Mac+Win cross-host verification

---

## Troubleshooting

| Symptom | Likely cause + fix |
|---|---|
| `xmesh-agent run` exits with `identity-collision` | Another peer on the mesh has the same `SYM_NODE_NAME`. Rename your peer in `agent.toml` `[identity] name`. |
| Peers don't discover each other | Check both peers are on the same Wi-Fi/LAN. mDNS doesn't cross VLANs. For cross-network, use a relay (`mesh.relay = "wss://..."`). |
| `dry-run` says model adapter FAIL | API key not set — check `echo $ANTHROPIC_API_KEY`. For Ollama, check `curl http://localhost:11434/api/tags`. |
| Peer doesn't respond to admitted CMBs | Check `xmesh-agent status <peer>` — likely budget exhausted (`minute=10/10`) or circuit breaker open. |
| Cost climbing faster than expected | Lower `[budget] max_cost_usd_per_run` and restart, or use `--cost-cap` on the next `init`. |

Open an issue at https://github.com/sym-bot/xmesh-agent/issues with the bug template if your problem isn't here.
