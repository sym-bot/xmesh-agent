# Concepts

The vocabulary you need to understand what xmesh-agent does and why.

---

## Mesh, peer, group

A **mesh** is a set of agent processes that talk to each other directly via the **Mesh Memory Protocol** (MMP). Each process is a **peer** — it has its own identity, its own memory store, its own SVAF admission weights. There is no central coordinator.

Peers are organised into **groups**. A group is a logical scope — peers in `xmesh-demo` only see CMBs from other peers in `xmesh-demo`. Bonjour service-type isolation enforces this on the LAN; relay token isolation enforces it on WAN.

```
        group: my-team
   ┌─────────────────────┐
   │   peer A   peer B   │
   │       \   /         │
   │      peer C         │
   └─────────────────────┘
```

---

## CMB — Cognitive Memory Block

A **CMB** is a structured message — the unit of exchange between peers. Every CMB carries:

- **CAT7 fields** (see below) — the semantic payload
- A **content hash** — content-addressable identity
- **Lineage** — pointers to ancestor CMBs that this one was derived from
- A **createdBy** — the originating peer
- A **timestamp**

Same shape across every domain. A coding-agent CMB and a music-curation CMB are structurally identical — only the field values differ.

CMBs are **immutable**. Once written, they don't change. A "revision" is a new CMB with the old one as a lineage parent.

---

## CAT7 — the seven semantic fields

Every CMB has seven fields, three axes:

| Field | What | Axis |
|---|---|---|
| `focus` | What the agent is focused on (the artifact, the topic) | What |
| `issue` | A concrete problem or blocker | What |
| `intent` | What the agent intends to do or wants done | Why |
| `motivation` | Why this matters | Why |
| `commitment` | What the agent is committing to (deliverable, deadline) | Why |
| `perspective` | Whose viewpoint (auditor, user, attacker, etc.) | Who |
| `mood` | Emotional/state tone (tired, focused, exhausted) | Who |

Not all fields are populated every CMB — only the ones relevant to what the agent is conveying. **Mood is special: it crosses domain boundaries.** A coding-agent's "exhausted" mood can be admitted by a music-agent's SVAF and trigger a playlist change, without the music agent caring about code.

The CAT7 schema is fixed and near-orthogonal — every field captures something different from the others. This is what makes per-field admission (SVAF) powerful.

---

## SVAF — Symbolic-Vector Attention Fusion

**SVAF** is the admission policy. When a peer receives a CMB from another peer, SVAF decides per-field whether to admit it into local memory.

Each peer has **α (alpha) weights** — one per CAT7 field — that express how much it cares about that field. A reviewer peer might have:

```
focus = 1.0
issue = 2.5         ← cares a lot about issues
intent = 1.2
motivation = 0.8
commitment = 2.0    ← cares a lot about commitments
perspective = 0.5
mood = 0.6
```

Higher weight = more eager admission. Lower weight = more selective.

SVAF runs **on the receiving peer**, not the sender. Two peers receiving the same CMB make different admission decisions based on their own α weights. This is what makes the mesh **collective intelligence** — no central policy, no central scheduler. Each peer reasons over what *it* admits.

---

## Lineage

Every response CMB carries pointers to the CMBs it was derived from. Walk the pointers backwards and you get a **DAG** (directed acyclic graph) of how a thought evolved across the mesh.

```
seed CMB (from a human or external system)
   ↓ admitted by writer
writer's spec CMB (parent: seed)
   ↓ admitted by reviewer
reviewer's issues CMB (parent: spec, ancestor: seed)
   ↓ admitted by writer (cycle-detection blocks unless commitment)
writer's revised spec CMB
   ↓ admitted by test-writer
test-writer's tests CMB
```

`xmesh-agent trace <peer> <cmb-id>` walks this DAG and prints the chain. Debug-by-provenance — you can always answer "where did this thought come from?"

---

## The autonomous loop

What every xmesh-agent peer does, on repeat:

1. **Wake** when SVAF admits a peer's CMB into local memory
2. **Check** wake-budget — am I within rate limits?
3. **Check** circuit breaker — has the model been failing?
4. **Assemble context** — admitted CMB + lineage ancestors + own recent CMBs + group recent CMBs, truncated to fit the model's context window
5. **Call model** — send the context, ask for a response
6. **Parse** the model's tool-use response into CAT7 fields
7. **Check** cycle detection — would this response create an infinite loop?
8. **Check** approval gates — does any field contain a dangerous pattern (`git push`, `.env`, etc.)?
9. **Emit** the response CMB on the mesh — broadcast (default) or targeted to originator
10. **Sleep** until next admission

This is the entire loop. The "intelligence" is in the model + the α weights + the lineage. The loop itself is mechanical.

---

## Real-time duplex vs collective intelligence

Two distinct properties of an xmesh mesh:

**Real-time duplex** — peers exchange CMBs directly, no polling, no central queue. When peer A emits, peer B sees it within milliseconds (via Bonjour LAN or WebSocket relay). This is the wire-level property.

**Collective intelligence** — each peer's α weights filter what it admits, so admitting a CMB is a *decision* not a *delivery*. Aligned peers (similar α) converge on the same memory state; divergent peers stay sovereign. This is the cognition-level property.

Both are required for the canonical claim "agent-to-agent mesh for collective intelligence." Wire duplex without per-peer admission = a chat group. Per-peer admission without wire duplex = isolated agents polling for updates.

---

## Identity (Phase 1 + Phase 2)

**Today (Phase 1):** every peer has a name (`SYM_NODE_NAME`) but identity is self-declared. ed25519 keypairs can be generated (`xmesh-agent keygen`) and stored locally, but the wire path doesn't yet sign or verify CMBs.

**Phase 2 (next major):** wire-signed CMBs. Every CMB carries an ed25519 signature over its content hash. Receivers verify against pinned public keys before admission. Three admission modes per group: `tofu` (trust-on-first-use), `strict` (pre-loaded keys only), `open` (legacy interop). See [`ROADMAP.md`](../ROADMAP.md).

---

## Vocabulary cheatsheet

| Word | What it means here |
|---|---|
| Peer | One xmesh-agent process with its own identity + memory + SVAF |
| Group | Logical scope — peers in different groups don't see each other |
| CMB | Cognitive Memory Block — the unit of exchange |
| CAT7 | The 7-field schema of every CMB |
| SVAF | Per-field admission policy on the receiver |
| α (alpha) weights | The per-field priorities that drive SVAF |
| Lineage | The DAG of ancestor CMBs for a given response |
| MMP | Mesh Memory Protocol — the wire format |
| Mesh | The set of all peers in a group |
| Wake | When a peer's SVAF admits a CMB and the loop fires |
| Admission | Per-field decision to accept a CMB into local memory |
| Remix | Storing an admitted CMB with lineage back to its parents |
| Headless attach | Peer runs as a standalone process (vs paired into Claude Code) |
| Approval gate | Pattern-matched block on emitting CMBs with dangerous fields |
| Circuit breaker | Per-peer state that opens after consecutive model failures |

---

## Further reading

- **MMP spec** — https://meshcognition.org/spec/mmp (current v1.0; v0.3.0 with wire signing in Phase 2)
- **MMP paper** — arXiv:2604.19540
- **SVAF paper** — arXiv:2604.03955
- **MeloTune paper** — arXiv:2604.10815 (proves the protocol on a consumer app)
- **[`docs/getting-started.md`](getting-started.md)** — five minutes from install to first peer
- **[`docs/cookbook.md`](cookbook.md)** — common patterns
- **[`ROADMAP.md`](../ROADMAP.md)** — what's shipped, what's next
