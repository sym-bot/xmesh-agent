# Operations — launch-day + daily operator runbook

Runtime doc §5 deployment + §6.1 Phase-1 MVP. This doc is for the human who
operates `xmesh-agent` peers during a demo or in steady-state production. It
covers: starting peers, monitoring them, responding to incidents, and shutting
them down under time pressure.

## Prerequisites

- `npm i -g @sym-bot/xmesh-agent` (or local clone with `npm install`)
- `ANTHROPIC_API_KEY` exported in every terminal that will start a peer
- Per-peer `agent.toml` in a known location (e.g. `~/.xmesh-agent/configs/`)

## Demo-day sequence (3-peer writer / reviewer / test-writer)

Target: one terminal per peer, one observer terminal, one kill-switch terminal.

### Step 1 — pre-flight

```bash
# Verify network state
ping -c 1 sym-relay.onrender.com   # if using relay
dns-sd -B _sym._tcp                # Mac; should be quiet before start
```

### Step 2 — start peers

Three separate terminals:

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

Expect three `[run] xmesh-agent started` lines, three `[run] ipc socket:`
paths. If any peer exits immediately, check `identity-collision` — another
peer already runs with the same `SYM_NODE_NAME`.

### Step 3 — confirm mesh formation

```bash
# Observer terminal
xmesh-agent status writer-01
xmesh-agent status reviewer-01
xmesh-agent status test-writer-01
```

Expect `running: true` for each. The `budget: minute=0/5 …` counters are zero
until the mesh does work.

### Step 4 — seed a CMB

```bash
# From a fourth process — any sym client
npx --package=@sym-bot/sym -- sym observe --group xmesh-demo \
  --focus "implement rate-limit middleware for /api/login" \
  --intent "draft a spec, review it, add tests" \
  --motivation "prod outage traced to credential stuffing"
```

Within seconds: all three peers should log `info model-call`, `info emitted`.

### Step 5 — observe the mesh

Rotate among terminals:

```bash
xmesh-agent status writer-01    # should show emitted >= 1
xmesh-agent cost writer-01       # watch cost_usd tick up
xmesh-agent trace writer-01 <cmb-id-from-log>   # inspect lineage
```

`cmb-id` shows up in peer logs as `info emitted { admittedId: "cmb-..." }`
or `info model-call { admittedId: ... }`.

### Step 6 — graceful shutdown at end of demo

```bash
xmesh-agent stop writer-01
xmesh-agent stop reviewer-01
xmesh-agent stop test-writer-01
```

Each peer logs `[run] IPC_STOP received — draining`, runs its loop.stop(),
closes the IPC socket, and exits 0 with a stats summary.

## Kill-switch — when to pull the plug

### Scenario A — cost running hot

Symptom: `xmesh-agent cost <peer>` shows `cost_usd` approaching the per-run
cap faster than expected.

Action:
```bash
xmesh-agent stop <peer-name>
```

The per-run cap (default $5) auto-stops at 100% — this is insurance against
forgetting. Use `stop` when you notice early.

### Scenario B — cycle detection not catching a loop

Symptom: One peer's `cmbsEmitted` climbs faster than the others. Logs show
peers ping-ponging CMBs with no `cmbsSuppressed` events.

Action:
```bash
# Stop the chattiest peer first to break the loop
xmesh-agent status writer-01 reviewer-01 test-writer-01   # compare counts
xmesh-agent stop <loudest-peer>
# Investigate: were the CMBs carrying a commitment field? (commitment-
# exception bypasses cycle detection by design — see runtime doc §5.2)
```

### Scenario C — peer emitting garbage

Symptom: `trace` output shows CMB fields with hallucinated content, or logs
show `approval-gate-blocked` firing repeatedly (means the model is trying
to emit dangerous intents — the gate is doing its job but the model is not).

Action:
```bash
xmesh-agent stop <peer>
# Review the role prompt in agent.toml [role_weights] and [identity] role
# description. If the model keeps generating dangerous intents, the prompt
# is not tight enough — not a runtime bug.
```

### Scenario D — peer unresponsive to stop

Symptom: `xmesh-agent stop <peer>` returns `stop accepted: true` but the
peer's terminal continues to log or no exit log appears.

Action:
```bash
# Find the PID and SIGTERM it
pgrep -f "xmesh-agent run.*<peer-name>"
kill -TERM <pid>

# If that hangs too, SIGKILL (LOSES in-flight CMBs — last resort)
kill -KILL <pid>

# Clean up stale socket
rm ~/.xmesh-agent/<peer-name>.sock
```

### Scenario E — identity collision on startup

Symptom: Peer exits immediately after start with `[error] identity-collision`.

Action:
```bash
# Another peer is using the same SYM_NODE_NAME. Check running peers:
ls ~/.xmesh-agent/*.sock
# Stop the existing one or rename this peer in its agent.toml [identity].
```

## Steady-state monitoring

Once peers are running, set up a polling loop for each from a fourth terminal:

```bash
while true; do
  clear
  for peer in writer-01 reviewer-01 test-writer-01; do
    echo "=== $peer ==="
    xmesh-agent status "$peer" 2>/dev/null || echo "peer down"
  done
  sleep 10
done
```

Watch for:
- `running: false` — peer crashed or stopped
- `cost_usd` climbing — trending toward per-run cap
- `suppressed >> emitted` — cycle/gate suppressing most work; investigate
- `budget.hour` near cap — peer is chatty; lower wake-budget or investigate

## Demo-day safety checklist

Before `observe` seeds the first CMB:

- [ ] All three peers show `running: true`
- [ ] Each peer's `budget.minute` is 0 (no warm-up chatter)
- [ ] Observer terminal ready with `status`/`cost`/`trace` commands
- [ ] Kill-switch terminal ready with `stop <peer>` for each peer
- [ ] Per-run cost cap ≤ $2 per peer (total ≤ $6 worst-case)
- [ ] Demo scenario runs against a scratch branch, not main
- [ ] If demo is public: hide `ANTHROPIC_API_KEY` from screen share

## Post-demo cleanup

```bash
# Stop everything
for peer in writer-01 reviewer-01 test-writer-01; do
  xmesh-agent stop "$peer" 2>/dev/null
done

# Remove any stale sockets
rm -f ~/.xmesh-agent/*.sock

# Archive logs if the demo was externally-visible
# (stderr is where xmesh-agent writes; redirect when starting if needed)
```

## Known limitations

- No control-plane UI — everything via CLI (Phase 2)
- No automatic restart on peer crash — supervisor process is operator's job
- No metrics endpoint — `status`/`cost` over IPC is the observability surface

Structured JSON logging is available since 0.1.0-alpha.5: set
`[logging] file_path = "..."` in `agent.toml` and logs go to disk as JSON
lines with automatic size-based rotation (default 5 MB × 5 files).
