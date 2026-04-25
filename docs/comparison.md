# xmesh-agent vs other multi-agent frameworks

If you're evaluating multi-agent frameworks for a real project, you'll likely look at LangGraph, CrewAI, AutoGen, and Anthropic's MCP / Claude Agent SDK alongside xmesh-agent. They solve overlapping but distinct problems. This page is honest about what xmesh-agent is, isn't, and where each alternative is the better choice.

**TL;DR** — xmesh-agent is the right pick when you want **decentralised peer-to-peer coordination over an open wire protocol**, with **per-peer admission policy** and **any model + any IDE**. It is the wrong pick if you want a single supervisor agent orchestrating a fixed pipeline (use LangGraph), a quick CrewAI-style team-of-experts demo (use CrewAI), or a Microsoft-Azure-native group chat between agents (use AutoGen).

---

## At a glance

| Property | xmesh-agent | LangGraph | CrewAI | AutoGen | MCP / Claude Agent SDK |
|---|---|---|---|---|---|
| **Topology** | Peer-to-peer mesh | Centralised graph (you author the DAG) | Team-of-experts (sequential or hierarchical) | Group-chat manager | Single agent + tool calls |
| **Wire protocol** | Open (MMP, CC-BY-4.0) | In-process (LangChain) | In-process | In-process | MCP (Anthropic-stewarded) |
| **Model lock-in** | Any (Anthropic / OpenAI / Ollama / Mistral, more on roadmap) | Any LangChain-supported | Any LangChain-supported | Any AutoGen-supported | Any Anthropic-supported |
| **Coordination unit** | CMB (CAT7-fielded message) over the wire | Function calls in a graph | Method calls between agents | Chat messages | Tool calls + responses |
| **Routing** | Per-peer SVAF α weights (admission, not routing) | Edges in the graph | Pre-declared workflow | Group-chat manager decides | N/A — single agent |
| **Memory model** | Per-peer remix store + lineage DAG | LangChain memory abstractions | Pydantic structures | Conversation history | Per-tool context |
| **Cross-process** | Yes — Bonjour LAN or WebSocket relay | No (single Python process) | No (single Python process) | No (single Python process) | Process-local (MCP host ↔ MCP server) |
| **Cross-language** | Yes — wire protocol speaks Node + Swift today, JVM/Rust roadmap | Python only | Python only | Python only | Multiple SDKs (TS, Python, …) |
| **Best fit** | Long-running peer agents on different machines | Complex single-process workflows with deterministic routing | Rapid prototyping a sequential team | Microsoft-stack group chat | Single-agent productivity in a host |

---

## When LangGraph is the better choice

**LangGraph** ([github.com/langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)) is a graph-based orchestration framework where you author the routing logic explicitly as edges in a state machine.

Pick LangGraph when:
- Your workflow is **deterministic** and you want explicit control over which agent handles which state
- You're already invested in the LangChain ecosystem (memory, tools, retrievers)
- You need **conditional edges** with rich logic (if-this-then-that)
- Single-process is fine — no need for the agents to live on different machines

Pick xmesh-agent over LangGraph when:
- You want agents to live on **different machines / different LANs**
- You don't want to author routing — admission is per-peer and self-organising
- You want the wire protocol to be **open and stable** so other vendors can implement it (third-party MMP libraries, future Rust/JVM peers)
- The LangChain dependency surface is too heavy for your use case

---

## When CrewAI is the better choice

**CrewAI** ([github.com/crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)) emphasises a "crew of role-played experts working a sequential or hierarchical task" pattern. You declare agents (each with a role + backstory + goal) and tasks (each with a description + expected output).

Pick CrewAI when:
- You want to **prototype quickly** with a crew of role-named agents
- The Pydantic + Python stack is your home turf
- Your task structure is **known in advance** (not emergent)
- You don't need cross-process / cross-machine coordination

Pick xmesh-agent over CrewAI when:
- You want **emergent coordination** rather than declared task sequences
- You need agents to coordinate **across processes / machines / IDEs**
- You want **per-peer admission** (not just "agent A hands off to agent B")
- You want a wire protocol that survives a peer crash (MMP rejoin-without-replay)

---

## When AutoGen is the better choice

**AutoGen** ([github.com/microsoft/autogen](https://github.com/microsoft/autogen)) provides a "group chat" manager that orchestrates conversations between role-played agents.

Pick AutoGen when:
- You're on the Microsoft / Azure stack and want native integration
- A **conversational group-chat** model fits your domain (e.g. agents debating until consensus)
- You want extensive observability tooling that AutoGen Studio provides
- Your agents are happy living in one Python process

Pick xmesh-agent over AutoGen when:
- You don't want a centralised group-chat manager — peers should decide what they admit
- You need **distributed peers**, not a Python process
- You want to keep the protocol open and not Microsoft-stewarded
- You're not running .NET / Azure infrastructure

---

## When MCP / Claude Agent SDK is the better choice

**MCP** (Model Context Protocol, [modelcontextprotocol.io](https://modelcontextprotocol.io)) and **Claude Agent SDK** ([docs.claude.com/en/api/agent-sdk](https://docs.claude.com/en/api/agent-sdk)) are Anthropic's standards for connecting tools / data sources to a single Claude agent.

Pick MCP when:
- You want **a single Claude (or Claude-Code/Claude-Desktop) agent** with rich tools and data sources
- You're building a **tool integration**, not a multi-agent system
- You want the broader MCP ecosystem (file system, GitHub, Slack, etc. all expose MCP servers)

Pick xmesh-agent over MCP when:
- You want **multiple agents talking to each other**, not one agent talking to many tools
- You want admission policy on the receiving side (SVAF), not a forced tool-call from the sender
- You want the protocol to be model-agnostic (MCP is Anthropic-stewarded; MMP is a separate spec)

**They compose well:** xmesh-agent ships a separate `@sym-bot/mesh-channel` MCP plugin that pairs a Claude Code session into the mesh as a peer. So you can have a Claude Code agent + two `xmesh-agent` headless peers all on the same mesh, with MCP handling the IDE-side and MMP handling the inter-peer wire.

---

## What xmesh-agent is *not*

- **Not a chat-with-your-agents UI.** No web UI today. CLI + IPC only. (HTTP control plane is on the roadmap.)
- **Not a hosted service.** Self-hosted by design. Optional WebSocket relay for WAN, but the mesh works LAN-only without any hosted dependency.
- **Not a workflow engine.** xmesh-agent doesn't enforce sequential / DAG / hierarchical patterns. Coordination is emergent from per-peer admission + lineage.
- **Not a prompt-tuning framework.** No prompt templates, no chain-of-thought scaffolding. The LLM call is yours; xmesh-agent handles the wire + safety + admission around it.
- **Not Python.** Node.js. Swift on iOS/macOS. JVM/Rust on roadmap. Sorry to PyTorch shops; this isn't your stack.

---

## What xmesh-agent is *uniquely* good at

- **Cross-machine / cross-network coordination** with no central server
- **Per-peer admission policy** so agents can stay sovereign while still listening
- **Open wire protocol** — anyone can implement MMP and join the mesh
- **Cryptographic identity primitive shipped today** (wire-active in v0.6.0); other frameworks have nothing comparable
- **Lineage-by-default** — every response CMB carries pointers to its ancestors; debug-by-provenance, not debug-by-log
- **Cost discipline built in** — wake-budget + token cap + per-run cost cap + circuit breaker. Other frameworks make you bolt these on.

---

## Reverse-evaluation: should you bet on xmesh-agent?

Honest signals to look for before committing:

| Signal | Status |
|---|---|
| Is the protocol open? | Yes — MMP spec at [sym.bot/spec/mmp](https://sym.bot/spec/mmp), CC-BY-4.0 |
| Is the package open source? | Yes — Apache-2.0, [github.com/sym-bot/xmesh-agent](https://github.com/sym-bot/xmesh-agent) |
| Is there a real production deployment? | Yes — MeloTune (consumer iOS app) is built on the same MMP substrate (`@sym-bot/sym`) |
| Test coverage? | 295+ unit tests + smoke tests on Node 18/20/22; CI green; CodeQL + secret-scan clean |
| Cadence? | 10 npm releases in the alpha line, see [CHANGELOG](../CHANGELOG.md) |
| API stability? | 0.1.x is alpha; CLI + config schema may evolve. 1.0 promises stable API for 60+ days. |

**Honest weakness:** xmesh-agent is new (npm release 2026-04). The ecosystem is still small. If you need every problem already solved by someone else, pick a more-established framework. If you're willing to be an early adopter on something cleaner, this is for you.

---

## Migration / interop notes

You can run xmesh-agent **alongside** any other framework — they don't compete for the same process. Common patterns:

- **LangGraph + xmesh-agent** — your LangGraph workflow emits a CAT7 CMB at key state transitions; xmesh-agent peers admit those CMBs and react autonomously. LangGraph keeps the deterministic core; xmesh adds the cross-process layer.
- **CrewAI + xmesh-agent** — your CrewAI crew finalises a deliverable, then publishes a commitment-CMB on the mesh; downstream xmesh peers (e.g. a deployment peer) admit and act on it.
- **AutoGen + xmesh-agent** — same pattern as CrewAI; AutoGen handles in-process group chat, xmesh handles cross-process broadcast.
- **MCP + xmesh-agent** — install `@sym-bot/mesh-channel` MCP server; your Claude Code session becomes a mesh peer alongside `xmesh-agent` headless peers.

There's no "rip and replace" — start by adding one xmesh-agent peer to whatever you have today and see if the per-peer admission model fits your problem.

---

## Where to next

- **[`docs/getting-started.md`](getting-started.md)** — five-minute quickstart
- **[`docs/concepts.md`](concepts.md)** — vocabulary and mental model
- **[`docs/cookbook.md`](cookbook.md)** — recipes for common patterns
- **[`ROADMAP.md`](../ROADMAP.md)** — what's shipped, what's coming
- **Issues + discussions** — [github.com/sym-bot/xmesh-agent/issues](https://github.com/sym-bot/xmesh-agent/issues)
