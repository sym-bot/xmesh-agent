# Contributing to @sym-bot/xmesh-agent

Thanks for considering a contribution. This is an open-source agent runtime built around the open Mesh Memory Protocol — community input is part of the design.

## Quick start

```bash
git clone https://github.com/sym-bot/xmesh-agent
cd xmesh-agent
npm install
npm test           # 225 unit tests
npm run lint       # ESLint flat config
npm run smoke      # live tests; Bonjour always; vendor adapters skip without keys
```

### Optional: lefthook pre-commit hook

A `lefthook.yml` is included for contributors who want lint + tests to run automatically before commit / push. Lefthook is not added to `devDependencies` (the runtime stays dep-light); install the binary yourself once:

```bash
brew install lefthook   # or see https://github.com/evilmartians/lefthook for other installs
lefthook install        # registers the .git/hooks/* shims
```

After install, `git commit` runs `npm run lint` and `git push` runs `npm test`. Skip on a one-off basis with `LEFTHOOK=0 git commit ...`. Remove with `lefthook uninstall`.

This is opt-in — CI still runs the full matrix on every PR regardless.

## Workflow

1. **Open an issue first** for non-trivial changes. Bug fix, doc tweak, or test addition? Skip the issue and just send a PR. New feature, new CLI command, behaviour change, or API surface delta? Issue first so we can discuss scope.
2. **Branch from `main`.** `git checkout -b your-feature`
3. **Write tests for any code change.** We're at 225 unit tests; the bar is *every behaviour change has a test that fails before and passes after*.
4. **Lint clean.** `npm run lint` must be zero errors.
5. **Open the PR against `main`.** CI runs unit tests on Node 18/20/22 + lint + secret-scan + install rehearsal. All must pass before merge.
6. **One reviewer approval** required for merge. Maintainers will respond within ~48h on weekdays.
7. **Merge style is squash-only.** Your PR title becomes the commit message; keep it descriptive.

## What we accept

- **Bug fixes** with a regression test
- **Adapter additions** (e.g. Mistral, Cohere, Bedrock, Vertex) — keep the `ModelAdapter` contract intact
- **Safety-envelope improvements** — new approval-gate patterns, better cycle-detection edge cases
- **Documentation polish** — vocabulary, examples, runbooks
- **Test additions** — particularly safety drills (see `test/drills.test.js`)
- **CLI ergonomics** — better help text, output formatting, exit codes

## What we don't accept (without prior discussion)

- Wire-protocol changes — these belong in `@sym-bot/sym` and the MMP spec
- Identity / signing scheme changes — these belong in the v0.6.0 design (see [`xmesh_identity_signing_v0.1.md`](https://meshcognition.org/spec/mmp))
- Removing safety guards (wake-budget, cycle detection, approval gates) — open an issue to discuss the threat model first
- Renaming public CLI commands — breaks every operator's runbook
- Changes that introduce a build step (we ship plain Node.js source intentionally)

## Code style

- **Plain Node.js, CommonJS.** No TypeScript build step in the package itself.
- **JSDoc types** where they aid clarity.
- **No new dependencies** without discussion. Current deps: `@anthropic-ai/sdk`, `@iarna/toml`, `@sym-bot/sym`, `openai`. Keep the surface minimal.
- **Defensive but not paranoid.** Validate at boundaries (CLI args, config files, network input). Trust internal calls.
- **Errors are explicit.** Never swallow without logging. Use the structured logger when in the loop.
- **No comments unless they explain *why*.** Identifier names should explain *what*.
- **Tests use Node's built-in `node:test`.** No jest, vitest, mocha. Keep the dep tree tiny.

## Commit messages

Squash-merge means your PR title is the merge commit message. Aim for:

- Imperative mood: `cli: add --json flag to status command` (not "added")
- Subsystem prefix: `safety:`, `model:`, `cli:`, `core:`, `mesh:`, `attach:`, `runtime:`, `test:`, `docs:`
- One short sentence; details in the PR body
- Reference issues with `#123` in the body, not the title

## Reporting security issues

**Don't open a public issue.** See [`SECURITY.md`](SECURITY.md) for the disclosure process.

## License

By contributing, you agree your changes are released under the [Apache-2.0 license](LICENSE).
