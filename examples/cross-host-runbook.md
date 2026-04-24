# Cross-host verification runbook

Runtime doc §7.2 acceptance — Mac peer + Win peer on the same group exchange
CMBs both ways. This is a manual runbook; run it before tagging a release
that will ship to external users.

## Prerequisites on each machine

- Node.js ≥ 18
- Clone of `github.com/sym-bot/xmesh-agent`
- Same LAN (or WAN relay configured — see § WAN variant below)
- Bonjour / mDNS working (check: `dns-sd -B _services._dns-sd._udp` on Mac,
  Bonjour service running on Windows)

```bash
# One-time on each host
git clone git@github.com:sym-bot/xmesh-agent.git
cd xmesh-agent
npm install
```

## Step 1 — unique group name for this run

Pick a timestamped group name so it does not collide with any running peer.

```bash
export XMESH_SMOKE_GROUP=xmesh-xhost-$(date +%Y%m%d%H%M%S)
echo "using group: $XMESH_SMOKE_GROUP"
```

Communicate the group name to the second machine operator.

## Step 2 — start Alice on Mac

```bash
# Mac
cat > /tmp/alice.toml <<EOF
[identity]
name = "xhost-alice"
role = "verifier"

[mesh]
group = "${XMESH_SMOKE_GROUP}"

[role_weights]
focus = 1.5
issue = 1.5
intent = 1.5
motivation = 1.0
commitment = 1.5
perspective = 0.5
mood = 0.8

[model]
adapter = "anthropic"
# api_key omitted — use env
model_name = "claude-haiku-4-5-20251001"

[budget]
max_wakes_per_minute = 5
max_cost_usd_per_run = 1.0

[attach]
mode = "headless"
EOF

export ANTHROPIC_API_KEY=sk-ant-...
node src/cli/index.js run --config /tmp/alice.toml
```

Keep this terminal open. Expect log lines:
- `[run] xmesh-agent started — peer=xhost-alice group=xmesh-xhost-<ts>`
- `[run] ipc socket: <home>/.xmesh-agent/xhost-alice.sock`

## Step 3 — start Bob on Windows (or second Mac)

```bash
# Windows (Git Bash or WSL) / second Mac
export XMESH_SMOKE_GROUP=xmesh-xhost-<same-as-step-1>
export ANTHROPIC_API_KEY=sk-ant-...

# Same alice.toml but with:
#   name = "xhost-bob"
# Save as /tmp/bob.toml

node src/cli/index.js run --config /tmp/bob.toml
```

Expect log lines as in Step 2, with `peer=xhost-bob`.

## Step 4 — verify peer discovery

On Mac:
```bash
node src/cli/index.js status xhost-alice
```

Look for `budget:` line — no peers listed yet in status, but the mesh adapter
should report both peers in its peer list. Check via running a third terminal
with `@sym-bot/sym`'s peer CLI:

```bash
npx --package=@sym-bot/sym -- sym peers --group "$XMESH_SMOKE_GROUP"
```

Expected output: both `xhost-alice` and `xhost-bob` listed.

## Step 5 — seed a CMB

From a third process on either machine:

```bash
npx --package=@sym-bot/mesh-channel -- sym-mesh-channel init --project /tmp
# OR, if you have sym CLI:
npx --package=@sym-bot/sym -- sym observe --group "$XMESH_SMOKE_GROUP" \
  --focus "cross-host verification ping" \
  --intent "verify duplex" \
  --motivation "pre-release runbook"
```

Within a few seconds:
- Alice's log should show `info emitted` — Alice processed the admission and
  replied via model
- Bob's log should show the same for Bob processing
- `xmesh-agent status xhost-alice` should show `emitted: 1+` and `cost_usd: > 0`
- Same for Bob

## Step 6 — trace a CMB

Pick an emitted CMB id from Alice's logs (look for `info emitted` → `admittedId`
or `info model-call`):

```bash
node src/cli/index.js trace xhost-alice <cmb-id>
```

Expected: indented tree showing the originator's CMB, Alice's response as a
child, etc.

## Step 7 — graceful shutdown

```bash
node src/cli/index.js stop xhost-alice
node src/cli/index.js stop xhost-bob
```

Expect `stop accepted: true`, then each peer logs `[run] IPC_STOP received —
draining` and `[run] stopped cleanly` with final stats.

## WAN variant (optional)

If LAN Bonjour is not available (different networks), add to each TOML:

```toml
[mesh]
group = "xmesh-xhost-<ts>"
relay = "wss://sym-relay.onrender.com"
relay_token = "..."   # or env SYM_RELAY_TOKEN
```

The rest of the runbook is identical. Verify by checking
`https://sym-relay.onrender.com/admin/groups` shows both peers connected.

### Automated WAN smoke (single-machine)

For rapid verification without physically setting up two hosts, the relay
smoke test runs both peers on one machine pointed at the real relay:

```bash
export SYM_RELAY_URL=wss://sym-relay.onrender.com
export SYM_RELAY_TOKEN=...
npm run smoke   # includes test/relay.smoke.js — skips when env vars absent
```

Asserts: two peers in the same group discover through the relay within 30s,
exchange a CAT7 CMB within 20s, shut down cleanly. Fails loudly if the
relay is unreachable, tokens are wrong, or group isolation is broken.

## Acceptance criterion

- Both peers discovered within 30s of second start
- Seed CMB admitted by both peers (check their respective `emitted` counters)
- Both peers emitted at least one response (non-zero `cmbsEmitted`)
- Cost stayed under the per-run cap
- No approval-gate violations in either log
- Both peers exited on `stop` command within 5s

If any criterion fails, do not tag the release. File an issue with logs from
both machines.
