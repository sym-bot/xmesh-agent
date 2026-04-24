## What

<!-- One sentence describing the change. -->

## Why

<!-- The behaviour change, the bug, or the missing capability that motivates this PR. Link the issue if there is one (#123). -->

## How

<!-- Brief mechanism. What you changed, why that approach. Skip this for one-line fixes. -->

## Test plan

- [ ] `npm test` passes locally (current bar: 225/225)
- [ ] `npm run lint` clean
- [ ] New behaviour has a test that fails before this change and passes after
- [ ] Smoke (`npm run smoke`) — note any vendor-adapter or relay change here

## Risk

<!-- What could break? Cost cap? Wire compatibility? Operator runbook? Be explicit about blast radius. -->

## Checklist

- [ ] CHANGELOG entry under the next version
- [ ] CLI surface unchanged OR change documented in README
- [ ] No new runtime dependency OR new dep justified in the PR description
- [ ] No private keys, API keys, or other secrets in the diff (gitleaks runs in CI; verify locally too)
