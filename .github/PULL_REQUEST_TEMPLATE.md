## Summary

<!-- Describe the outcome, the problem it solves, and intentionally excluded work. -->

## Validation

<!-- List exact commands/checks and observed results. Use "not run" with a reason when applicable. -->

## Risk and rollback

<!-- Cover security, tenant, financial, data, migration, operational risk, and the concrete rollback path. -->

## Release notes

<!-- Choose one: breaking-change, feature, fix, security, documentation, maintenance, or skip-changelog. -->

## Checklist

- [ ] This branch follows the OrbitOS branch naming convention.
- [ ] The base is `staging`, or this is the manual `staging` to `main` release PR.
- [ ] I reviewed the changed and staged file lists.
- [ ] Confidential `.agents` content, PDFs, credentials, and customer data are absent.
- [ ] Relevant tests and `pnpm guard:public` pass.
- [ ] Documentation and migration/recovery notes are updated where required.
- [ ] The rollback procedure is specific and executable.
