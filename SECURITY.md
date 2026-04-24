# Security policy

## Supported versions

Active alpha line: **0.1.x.** Only the latest patch release receives security updates.

| Version | Status |
|---|---|
| 0.1.x | Supported (active alpha) |
| < 0.1.0 | Not supported (no public alphas existed) |

When 0.2.x or 1.0.0 ships, this table will be updated with a deprecation window.

## Reporting a vulnerability

**Do not open a public GitHub issue for security concerns.**

Email `security@sym.bot` with:

- A description of the issue
- Steps to reproduce
- The version of `@sym-bot/xmesh-agent` you tested against
- Your assessment of impact (data exposure, code execution, denial of service, etc.)

You'll get an acknowledgement within 48 hours. Disclosure timeline depends on severity:

| Severity | Triage SLA | Coordinated disclosure |
|---|---|---|
| Critical (RCE, key exfiltration, auth bypass) | 24h | 7 days |
| High (DoS, privilege escalation) | 72h | 30 days |
| Medium / Low | 1 week | 60 days |

We'll credit you in the release notes unless you ask otherwise.

## Surface that needs your attention

`xmesh-agent` runs autonomous agents that:

- Hold model API keys (Anthropic / OpenAI / Ollama)
- Hold private ed25519 keys at `~/.xmesh/keys/<peer>.key` (mode 0600)
- Listen on a Unix domain socket per peer at `~/.xmesh/<peer>.sock`
- Optionally connect to a WebSocket relay
- Discover other peers via Bonjour mDNS on the local network
- Make outbound HTTPS calls to model vendors

Threat models we care about:

1. **Mesh peer impersonation.** Today's identity is name-string only; wire-signed CMBs ship in `@sym-bot/sym` v0.6.0. Until then, run on trusted networks only.
2. **Approval-gate bypass.** The default gate list blocks `git push`, `commit to main`, `deploy`, `.env`, `secrets`. New patterns welcome via PR.
3. **Cost runaway.** Wake-budget + cost-cap + circuit-breaker are designed to bound spend on a hostile or malfunctioning model. Report any combination of inputs that bypasses these.
4. **IPC socket abuse.** The IPC socket is created at 0600 by `xmesh-agent run`. If a process running as your user can write a malicious payload that the runtime mishandles, we want to know.
5. **Key exfiltration.** Private key files are 0600 by default. The structured logger explicitly sanitises `raw` and `cmb` keys; if you find a code path that logs the key material, that's a critical issue.

## What is *not* in scope

- Compromise of the model vendor (Anthropic, OpenAI). Report to them.
- Compromise of an OS-level mDNS daemon. Report to your OS vendor.
- Issues in `@sym-bot/sym` (mesh substrate) — report at <https://github.com/sym-bot/sym/security>.
- Denial of service via resource exhaustion of the host process by an admitted-as-trusted peer (this is a topology problem, not a code problem).
