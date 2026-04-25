# GitHub Action

Drop a xmesh-agent peer into any GitHub Actions workflow. The action handles install + scaffold + dry-run + bounded-duration run + log capture.

The action is published in this repo as `sym-bot/xmesh-agent@v0.1.6` (and tracks every released version of the package).

---

## Quickstart — review-bot on every PR

`.github/workflows/review-bot.yml` in your repo:

```yaml
name: review-bot
on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sym-bot/xmesh-agent@v0.1.6
        with:
          role: reviewer
          adapter: openai
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          cost-cap-usd: '0.50'
          duration-seconds: '180'
```

The job spins up a reviewer peer for 3 minutes, capped at $0.50, runs autonomously, logs to the workflow output.

---

## Inputs

| Input | Default | Description |
|---|---|---|
| `config` | `''` | Path to an existing `agent.toml` in the repo. If set, scaffolding inputs are ignored. |
| `role` | `reviewer` | Peer role when scaffolding. One of: writer / reviewer / test-writer / auditor / generator / spec / generic. |
| `adapter` | `anthropic` | Model adapter when scaffolding. One of: anthropic / openai / ollama. |
| `model` | `''` (per-adapter default) | Vendor-specific model name. |
| `group` | `xmesh-ci` | Mesh group name. |
| `peer-name` | `<role>-<run-id>` | Peer name. Defaults uniquely per CI run. |
| `cost-cap-usd` | `1.00` | Per-run cost cap in USD. |
| `duration-seconds` | `300` | Maximum runtime. Peer auto-stops at this deadline. |
| `anthropic-api-key` | `''` | Anthropic API key. Pass via `secrets.ANTHROPIC_API_KEY`. |
| `openai-api-key` | `''` | OpenAI API key. Pass via `secrets.OPENAI_API_KEY`. |
| `xmesh-agent-version` | `latest` | Pin a specific @sym-bot/xmesh-agent version. |

---

## Outputs

| Output | Description |
|---|---|
| `config-path` | The resolved (scaffolded or provided) path to `agent.toml`. |
| `cmbs-emitted` | Number of CMBs the peer emitted during the run. |
| `cost-usd` | Total cost in USD. |

Use them in subsequent steps:

```yaml
      - uses: sym-bot/xmesh-agent@v0.1.6
        id: peer
        with:
          role: reviewer
          adapter: openai
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}

      - name: Comment on PR with peer stats
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `xmesh-agent peer emitted ${{ steps.peer.outputs.cmbs-emitted }} CMB(s); cost ~\$${{ steps.peer.outputs.cost-usd }}`
            });
```

---

## Multi-peer mesh in CI

Each `uses: sym-bot/xmesh-agent` step runs ONE peer. To get a 3-peer mesh, run three jobs in parallel sharing a `group`:

```yaml
jobs:
  writer:
    runs-on: ubuntu-latest
    steps:
      - uses: sym-bot/xmesh-agent@v0.1.6
        with:
          role: writer
          group: ci-mesh-${{ github.run_id }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}

  reviewer:
    runs-on: ubuntu-latest
    steps:
      - uses: sym-bot/xmesh-agent@v0.1.6
        with:
          role: reviewer
          group: ci-mesh-${{ github.run_id }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}

  test-writer:
    runs-on: ubuntu-latest
    steps:
      - uses: sym-bot/xmesh-agent@v0.1.6
        with:
          role: test-writer
          group: ci-mesh-${{ github.run_id }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

**Caveat:** GitHub Actions runners are isolated network namespaces — Bonjour discovery doesn't cross runners. For multi-peer meshes in CI, configure a relay:

```yaml
      - uses: sym-bot/xmesh-agent@v0.1.6
        with:
          # ... other inputs ...
        env:
          SYM_RELAY_URL: ${{ secrets.SYM_RELAY_URL }}
          SYM_RELAY_TOKEN: ${{ secrets.SYM_RELAY_TOKEN }}
```

The relay forwards CMBs across runners.

---

## Custom config

Drop a `.xmesh/agent.toml` into your repo and reference it:

```yaml
      - uses: actions/checkout@v4
      - uses: sym-bot/xmesh-agent@v0.1.6
        with:
          config: .xmesh/agent.toml
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

Scaffolding inputs (role / adapter / etc.) are ignored when `config` is set.

---

## Cost discipline

- The `cost-cap-usd` input enforces a per-run budget; the peer auto-stops on overrun
- The `duration-seconds` input enforces a wall-clock cap; even without cost overrun, the run ends at the deadline
- Set both. Recommended baseline: `cost-cap-usd: '0.50'`, `duration-seconds: '180'`

For small repos / cheap models, $0.10 + 60s is usually enough for a useful review pass.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ANTHROPIC_API_KEY not set` in dry-run output | Pass `anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}` |
| Action exits 0 but peer emitted 0 CMBs | The peer didn't see any CMBs to wake on. Add a seeding step before the action with `sym observe` or pre-write a CMB file. |
| Peer's log shows `circuit-open-skip` | Model API failed N times. Check API key validity + rate limits + model availability. |
| Action runs longer than `duration-seconds` | The action SHOULD stop the peer at the deadline; if not, file an issue. |

---

## See also

- [xmesh-agent README](../README.md) — package overview
- [docs/getting-started.md](getting-started.md) — local quickstart
- [examples/scenarios/](../examples/scenarios/) — 11 ready-to-use agent.toml templates
