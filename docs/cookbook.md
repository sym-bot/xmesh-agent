# Cookbook

Common patterns. Each recipe is runnable with files in `examples/scenarios/`.

---

## Recipe 1 — Coding triad (writer + reviewer + test-writer)

**Goal:** three peers coordinate on a coding task — one drafts a spec, one flags issues, one generates tests.

```bash
# Three terminals, ANTHROPIC_API_KEY set in each
xmesh-agent run --config examples/scenarios/writer.toml
xmesh-agent run --config examples/scenarios/reviewer.toml
xmesh-agent run --config examples/scenarios/test-writer.toml

# Fourth terminal — seed
sym observe --group xmesh-demo \
  --focus "implement OAuth2 PKCE flow on /auth/callback" \
  --intent "draft → review → tests"
```

Cost: ~$0.05–$0.20 per cycle on Claude Haiku.

---

## Recipe 2 — Coding triad on OpenAI

Same pattern, OpenAI vendor:

```bash
export OPENAI_API_KEY=sk-proj-...
xmesh-agent run --config examples/scenarios/writer-openai.toml
xmesh-agent run --config examples/scenarios/reviewer-openai.toml
xmesh-agent run --config examples/scenarios/test-writer-openai.toml
```

Same group `xmesh-demo`. gpt-4o-mini default. ~$0.001–$0.01 per cycle.

---

## Recipe 3 — Coding triad on local Ollama (zero cloud cost)

```bash
ollama pull llama3.2:3b
ollama serve   # leave running

# Reviewer is the only ollama scenario shipped today; for full triad,
# scaffold the others with `xmesh-agent init`:
xmesh-agent init writer-local      --role writer      --adapter ollama
xmesh-agent init test-writer-local --role test-writer --adapter ollama
xmesh-agent init reviewer-local    --role reviewer    --adapter ollama

xmesh-agent run --config writer-local.toml
xmesh-agent run --config reviewer-local.toml
xmesh-agent run --config test-writer-local.toml
```

Cost: $0 (local inference). Latency higher than cloud (~5-15s per wake on consumer hardware).

---

## Recipe 4 — Coding + security review

Add `security-reviewer.toml` to a coding triad. The security peer admits everything (broad α weights) and emits issue-CMBs when it spots concerns.

```bash
xmesh-agent run --config examples/scenarios/writer.toml
xmesh-agent run --config examples/scenarios/reviewer.toml
xmesh-agent run --config examples/scenarios/test-writer.toml
xmesh-agent run --config examples/scenarios/security-reviewer.toml   # 4th peer
```

The security-reviewer uses Claude Opus + 12k context for deeper analysis. Costs more per wake but only fires on each new commitment-CMB (fewer wakes overall). Budget cap: $3/run.

---

## Recipe 5 — Spec → docs flow

Architecture-level spec drafter feeds a docs writer:

```bash
xmesh-agent run --config examples/scenarios/spec-drafter.toml   # Claude Opus
xmesh-agent run --config examples/scenarios/doc-writer.toml     # gpt-4o

sym observe --group xmesh-demo \
  --focus "design the mesh-channel restart-resume protocol" \
  --motivation "ops team needs a runbook"
```

spec-drafter emits architecture CMBs. doc-writer admits commitment-bearing ones and produces user-facing prose.

---

## Recipe 6 — Mixed-vendor showcase

Three peers, three vendors, same wire:

```bash
# Set both keys + start ollama
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-proj-...
ollama serve   # in another terminal

xmesh-agent run --config examples/scenarios/mixed-vendor-writer.toml       # Anthropic Haiku
xmesh-agent run --config examples/scenarios/mixed-vendor-reviewer.toml     # OpenAI gpt-4o-mini
xmesh-agent run --config examples/scenarios/mixed-vendor-test-writer.toml  # Local Ollama

sym observe --group xmesh-mixed-vendor-demo \
  --focus "build a vendor-agnostic agent triad" \
  --intent "show that any-model claim is mechanical"
```

All three coordinate via MMP. Different vendors, identical wire protocol. Total cost ~$0.001 per cycle since one peer is local.

---

## Recipe 7 — Pair Claude Code into the mesh

Use the separate `@sym-bot/mesh-channel` MCP plugin so an interactive Claude Code session becomes a mesh peer:

```bash
npm i -g @sym-bot/mesh-channel
# The postinstall step adds the MCP server to your Claude Code config
# Restart Claude Code; you'll see sym_send / sym_observe / sym_recall tools
```

Now Claude Code in any folder can join a group:

```
> sym_join_group --group xmesh-demo
```

And from then on, every CMB other peers emit in that group surfaces in Claude Code's transcript via the `<channel>` event. You can `sym_send` and `sym_observe` from inside Claude Code, and Claude responds to admitted CMBs as part of its conversation.

This is the **interactive attach mode** — opposite of `xmesh-agent run` (headless). Pair them: 2 headless peers + 1 Claude Code peer is a great "human in the loop" mesh.

---

## Recipe 8 — Just verify the runtime works

No mesh, no cycle, just confirm the model adapter end-to-end:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY
git clone https://github.com/sym-bot/xmesh-agent
cd xmesh-agent
npm install
npm run smoke
```

Runs Bonjour smoke + Anthropic smoke (or OpenAI if that key is set instead) + relay smoke (skipped without env). ~$0.0001 cost on `claude-haiku-4-5`. Confirms wiring before you commit to a multi-peer setup.

---

## Recipe 9 — Inspect a CMB's lineage

When something interesting happens in the mesh, follow the breadcrumbs:

```bash
# A peer log line like:
# [emitted] admittedId=cmb-abc123  to=writer-01  fields=["issue","commitment"]

xmesh-agent trace reviewer-01 cmb-abc123
```

Output:

```
root: cmb-abc123
[cmb-abc123] by reviewer-01+writer-01 | issue="missing rate-limit on /api/login" commitment="block on PR until resolved"
  [cmb-orig-spec] by writer-01 | focus="oauth2 PKCE flow" intent="draft a spec"
    [cmb-seed] by seed-pid42 | focus="implement OAuth2 PKCE flow on /auth/callback"
```

Every response traces back to its admitted parent. Debug-by-provenance.

---

## Recipe 10 — Stop everything safely

```bash
for peer in writer-01 reviewer-01 test-writer-01; do
  xmesh-agent stop "$peer"
done
```

Each peer drains in-flight model calls, closes its IPC socket, exits 0 with final stats. State persists at `~/.xmesh/state/<peer>.json` — next run picks up the lifetime totals.

---

## Recipe 11 — Cost budget exceeded — what now

Per-run cost cap is enforced; peer auto-stops when crossed. To resume:

```bash
xmesh-agent stop <peer>          # graceful stop if not already exited
# Edit the .toml — bump max_cost_usd_per_run
xmesh-agent run --config <peer>.toml   # resumes
```

`xmesh-agent cost <peer>` shows lifetime cost across all runs.

---

## Recipe 12 — Cross-host (Mac + Windows on the same LAN)

See [`examples/cross-host-runbook.md`](../examples/cross-host-runbook.md) for the seven-step verification runbook. Bonjour discovers across hosts on the same LAN automatically.

---

## Recipe 13 — Cross-network (WAN)

When peers aren't on the same LAN, use the relay:

```toml
[mesh]
group = "my-team"
relay = "wss://sym-relay.onrender.com"
relay_token = "..."   # or set SYM_RELAY_TOKEN in env
```

Both peers configure the same relay URL + token. They discover each other via the relay instead of Bonjour. Latency higher than LAN (~50-200ms per hop), but works across continents.

---

## Recipe 14 — Custom α weights for a specific domain

The bundled scenarios use general role tunings. For your specific domain, override:

```toml
[role_weights]
focus = 1.0
issue = 3.0           # bump higher than default if your domain is bug-heavy
intent = 0.5          # lower if you don't want this peer driving direction
motivation = 0.5
commitment = 2.5      # bump if you want this peer holding promises
perspective = 0.5
mood = 0.3            # ignore mood — pure-engineering setting
```

Then `xmesh-agent dry-run --config your.toml` runs the role-sanity check and warns if the weights contradict the role label.

---

## What's not in this cookbook (yet)

- Cursor / Codex shims — designed, not shipped (see ROADMAP)
- Shared team DAG — designed, not shipped
- HTTP control plane — considering, not committed

Open issues with feature requests at https://github.com/sym-bot/xmesh-agent/issues if you have a recipe in mind that doesn't work today.
