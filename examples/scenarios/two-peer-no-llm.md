# Two-peer no-LLM (60-second proof)

The fastest way to see CMBs flow over the mesh wire — **no API key, no daemon, no
LLM**. Two terminal sessions, two `sym observe` calls, one `sym recall`. If you
have npm and ~60 seconds, you can run it now.

This scenario proves the substrate works **without** buying into any AI vendor.
Once you've seen typed messages with provenance flow between identities, the
LLM scenarios in this directory layer on top of the same wire.

## What you'll see

- Two distinct peer identities (`alice`, `bob`) emit CMBs into a shared mesh group
- Each CMB carries the CAT7 schema (focus / intent / motivation / commitment /
  perspective / issue / mood) and a stable identity signature
- A third call (`sym recall`) reads the admitted CMBs back from the mesh,
  showing both peers' contributions with their identity attribution

## Install

```bash
npm i -g @sym-bot/sym
```

That's it. No daemon to start, no relay to configure. Default relay credentials
ship with the package and point at the public Render relay; identities are
generated on first use and cached in `~/.sym/nodes/<name>/`.

## Run

In one terminal:

```bash
sym observe --standalone --name alice \
  '{"focus":"hello mesh","intent":"prove the wire works","mood":{"text":"curious","valence":0.4,"arousal":0.3}}'
```

You'll see `Shared: cmb-<id>` — that's alice's CMB on the wire.

In a second terminal (can be on a different machine):

```bash
sym observe --standalone --name bob \
  '{"focus":"hi alice","intent":"reply with my own CMB","commitment":"will read your next observation","mood":{"text":"engaged","valence":0.5,"arousal":0.2}}'
```

> `mood.text` is required for every CMB per MMP §9.3 R5 — keeps emotional
> context first-class on the wire, not optional. Use any short string and
> valence/arousal in `[-1, 1]`.

In either terminal, read what landed:

```bash
sym recall "hello"
```

You'll see both alice's and bob's CMBs returned with their identity attribution
and CAT7 fields. The recall query runs SVAF cosine-drift admission per field
against the local store; both CMBs admit because the queries match their focus.

## Topology

```
  alice ──┐
          │
          ├──►  relay (public Render WebSocket) ──►  remix-store ◄── sym recall
          │
  bob   ──┘
```

- **alice** + **bob** — independent peer identities, no shared state, no auth
- **relay** — public WebSocket fan-out (Bonjour discovery also works on a LAN
  if both peers are on the same network — relay is the fallback)
- **remix-store** — append-only CMB log per peer, addressable via `sym recall`
- **No daemon** — `--standalone` mode does one-shot publish + read, no
  long-running process required

## What this is NOT

This isn't the full xmesh-agent autonomous scenario — peers don't wake on
incoming CMBs and reason via an LLM. For that, see the LLM-driven scenarios
(`writer.toml`, `reviewer.toml`, etc.) in this same directory.

This IS the wire-protocol proof: typed messages, stable identities,
cryptographic provenance, no central broker. Everything the LLM scenarios
build on, demonstrated in 60 seconds with zero AI vendor commitments.

## Next steps

- **Same wire, three vendors:** `mixed-vendor-*.toml` triad — shows
  Anthropic + OpenAI + Ollama peers exchanging CMBs over the same protocol
- **Autonomous coding mesh:** `writer.toml` + `reviewer.toml` +
  `test-writer.toml` (see [scenarios/README.md](README.md))
- **MCP integration:** install `@sym-bot/mesh-channel` and your AI copilot
  (Claude Code, Cursor, Copilot) sees `<channel>` events for every admitted CMB

## Why this matters

The substrate is a **wire protocol**, not an AI framework. CMBs are typed
messages with provenance; you can use them with or without an LLM. xmesh-agent
adds autonomous LLM peers; `@sym-bot/sym` and `@sym-bot/mesh-channel` are the
no-LLM path. Pick whichever surface fits your application — the wire is the
same.
