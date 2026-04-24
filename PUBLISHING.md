# Publishing `@sym-bot/xmesh-agent`

Runtime doc §5.1 + §6.1. This doc captures the publish rehearsal verified on
2026-04-24 and the pre-publish checklist for future releases.

## Pre-publish checklist

- [ ] `npm test` green on the commit to be tagged
- [ ] `npm run smoke` green (real Bonjour, Anthropic smoke skipped or green)
- [ ] Cross-host runbook (`examples/cross-host-runbook.md`) completed on
      Mac↔Win or Mac↔Mac within the prior 24h
- [ ] `CHANGELOG.md` updated for the release version
- [ ] `package.json` version bumped
- [ ] Commit tagged: `git tag v0.1.0-alpha.N && git push --tags`
- [ ] `npm pack --dry-run` tarball contents match expectations (no test/, no
      .git, no node_modules, no agent.toml)
- [ ] `npm pack` tarball installs cleanly into a fresh directory and the
      `xmesh-agent --version` bin works

## Rehearsed procedure (verified 2026-04-24)

```bash
# 1. Clean state
cd ~/code/xmesh-agent
git status   # expect clean
npm ci       # re-install from lockfile (deterministic)

# 2. Unit + smoke
npm test
npm run smoke

# 3. Tarball preview
npm pack --dry-run

# 4. Real tarball
npm pack
ls -lh *.tgz  # expect ~17-20 KB

# 5. Install rehearsal
cd /tmp
rm -rf xmesh-install-test
mkdir xmesh-install-test && cd xmesh-install-test
npm init -y
npm install ~/code/xmesh-agent/sym-bot-xmesh-agent-<version>.tgz

# 6. Bin + CLI verify
./node_modules/.bin/xmesh-agent --version
./node_modules/.bin/xmesh-agent --help
./node_modules/.bin/xmesh-agent run         # expect exit 2 "missing --config"
./node_modules/.bin/xmesh-agent stop ghost  # expect exit 1 "no running peer"

# 7. Tarball contents
tar -tzf ~/code/xmesh-agent/sym-bot-xmesh-agent-<version>.tgz | sort
# Expect: package/CHANGELOG.md, package/LICENSE, package/README.md,
# package/examples/*, package/package.json, package/src/**.js
# Do NOT expect: package/test/, package/node_modules/, package/.git/

# 8. Publish (ONLY when all checks green)
#    npm publish --access restricted   # @sym-bot scope defaults to restricted
#    npm publish --tag alpha          # tag alpha pre-release; not latest
```

## Rollback

If a bad version is published:

```bash
# Within 72h: unpublish entirely (npm policy allows within 72h only)
npm unpublish @sym-bot/xmesh-agent@<bad-version>

# After 72h: deprecate instead
npm deprecate @sym-bot/xmesh-agent@<bad-version> "broken — use <good-version>"
```

## Version tagging strategy

- `0.1.0-alpha.N` — pre-ship internal builds; install via `npm install
  @sym-bot/xmesh-agent@alpha`
- `0.1.0-beta.N` — external-testers build; install via `@beta`
- `0.1.0` — first stable release of Phase-1 MVP; auto-`latest` tag on publish
- `0.2.x` — Phase-2 features (OpenAI adapter, interactive attach modes)

## Rehearsal result — 2026-04-24

- Tarball size: 17.5 KB
- File count: 25
- No test/, node_modules/, or .git/ leaked
- Installed `xmesh-agent --version` returned `0.1.0-alpha.0`
- `--help` rendered cleanly
- `run` without `--config` exited 2 with expected message
- `stop ghost` exited 1 with expected "no running peer" message

Verified by: CTO `claude-code-mac`.
