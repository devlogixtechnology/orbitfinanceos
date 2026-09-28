# OrbitOS GitHub Operations Plan

Status: owner-directed operating policy

## Purpose

This document defines how OrbitOS changes move from local development to GitHub,
through integration, and into the protected `main` branch. It applies to people,
coding agents, automation, documentation, application code, infrastructure, and
release work.

The operating path is:

```text
topic branch -> pull request -> staging -> release pull request -> main -> versioned release
```

No person or agent commits or pushes directly to `staging` or `main`. GitHub
Actions supplies deterministic checks and review comments. A human reviewer owns
approval and the final `staging` to `main` merge.

## Branch topology

| Branch       | Purpose                                | Allowed changes                                                      | Merge authority                          |
| ------------ | -------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| `main`       | Released, rollback-ready history       | Pull requests whose head is exactly `staging`                        | Manual human review and merge only       |
| `staging`    | Protected integration shadow of `main` | Reviewed pull requests from named topic branches                     | Human review after required checks pass  |
| Topic branch | One bounded change                     | Commits for one feature, fix, document, release, or operational task | Author pushes; never treated as released |

`staging` is the integration branch. It must be created from `main`, kept under
the same non-bypass protections, and synchronized from `main` after each release.
It is not a deployment secret or a substitute for an actual staging environment.

## Non-negotiable rules

1. Create a new topic branch for every change, including documentation and CI.
2. Never commit, force-push, or merge directly to `main` or `staging`.
3. Every change reaches `staging` through a pull request.
4. Only a manually reviewed pull request from `staging` may merge into `main`.
5. GitHub Actions must pass before merge. Automated checks do not replace human
   approval.
6. Resolve every review conversation before merge.
7. Dismiss prior approvals when new commits are pushed and require approval of the
   most recent reviewable push.
8. Do not bypass branch protection, including for administrators or automation.
9. Do not rewrite protected history. Use a revert pull request and immutable
   release tags for recovery.
10. Never stage, commit, upload, quote, or publish `.agents/`, project PDFs,
    credentials, tenant data, or other confidential local context.

## Branch naming

Use lowercase kebab-case after one approved prefix:

```text
feat/<short-description>
fix/<short-description>
docs/<short-description>
refactor/<short-description>
test/<short-description>
chore/<short-description>
ci/<short-description>
release/v<major>.<minor>.<patch>
hotfix/<short-description>
revert/<short-description>
```

Examples:

- `feat/tenant-evidence-api`
- `fix/replay-idempotency-race`
- `docs/github-operations-plan`
- `ci/pr-health-checks`
- `release/v0.1.0`
- `revert/release-v0.1.0`

Do not place customer names, credentials, incident details, private source names,
or confidential business information in a branch name.

## Commit and pull request conventions

Use Conventional Commit-style subjects:

```text
feat(scope): concise outcome
fix(scope): concise outcome
docs(scope): concise outcome
refactor(scope): concise outcome
test(scope): concise outcome
chore(scope): concise outcome
ci(scope): concise outcome
revert(scope): concise outcome
```

Each pull request must contain:

- a concise outcome-focused title;
- the problem and bounded solution;
- affected areas and intentionally excluded work;
- validation commands and observed results;
- security, data, migration, and operational risk;
- a concrete rollback procedure;
- release-note classification;
- links to the work item or decision when one exists; and
- screenshots or evidence when behavior or presentation changes.

Comments must be specific and actionable. Reviewers should identify the affected
file or behavior, severity, expected correction, and why it matters. Do not merge
with unresolved correctness, security, tenant-isolation, financial-integrity,
migration, recovery, or public-boundary concerns.

## Standard change workflow

1. Update local `staging` from `origin/staging`.
2. Create one correctly named topic branch from the current `staging` head.
3. Implement the smallest complete change and its tests/documentation.
4. Run the relevant local checks and `pnpm guard:public`.
5. Inspect `git status`, the intended staged paths, and the full staged diff.
6. Commit only the intended public files.
7. Push the topic branch and open a pull request with base `staging`.
8. Address GitHub Actions failures and review comments with new commits on the
   same branch.
9. Obtain the required human approval after the latest push.
10. Merge using a merge commit, then delete the topic branch.

Merge commits preserve the exact pull request boundary and provide a clear revert
target. Rebase merges and direct protected-branch pushes are disabled. Squash
merges are disabled so the integration and release ancestry stays intact.

## Pull request gates

### Automated gates

The required checks are:

- `Merge policy`: correct base/head relationship, branch name, pull-request
  title, and required PR-body sections;
- `Repository policy`: confidential-boundary guard and diff hygiene;
- `Quality`: frozen dependency install, lint, typecheck, tests, schema checks, and
  build.

GitHub Actions posts one managed PR-readiness comment. It is advisory when green
and blocking when policy validation fails. Automation must not approve its own
pull request.

### Human gates

For `staging`:

- at least one approving review;
- approval after the most recent reviewable push;
- all conversations resolved;
- no critical or high-risk unresolved finding; and
- required Actions checks passing on the current head commit.

For `main`:

- pull-request head must be exactly `staging`;
- manual approval from a reviewer other than the release author;
- required Actions checks passing on the current head commit;
- release version and scope confirmed;
- rollback target and release notes confirmed; and
- all conversations resolved.

Use two human approvals for changes that affect tenant isolation, evidence
integrity, verification/finality policy, accounting controls, secrets, migration
strategy, or release/rollback automation whenever the team has two eligible
reviewers.

## Protected branch settings

Apply the following settings to both `staging` and `main`:

- require a pull request before merging;
- require at least one approving review;
- dismiss stale approvals when new commits are pushed;
- require approval of the most recent reviewable push;
- require conversation resolution;
- require branches to be up to date before merging;
- require `Merge policy`, `Repository policy`, and `Quality` status checks;
- enforce rules for administrators;
- block force pushes and branch deletion;
- require linear-history setting off because merge commits are intentional;
- disable branch lock except during an incident or planned release freeze; and
- do not grant bypass permission to GitHub Actions.

Repository merge settings:

- allow merge commits;
- disable squash merging;
- disable rebase merging; and
- delete topic branches automatically after merge.

Branch protection is the enforcement boundary. Local hooks improve feedback but
cannot replace server-side rules.

## GitHub Actions configuration

Repository Actions settings should be:

- Actions enabled;
- only GitHub-owned, verified, and explicitly allowlisted third-party actions;
- action dependencies pinned to immutable commit SHAs;
- default `GITHUB_TOKEN` permissions set to read-only;
- no permission for Actions to approve pull requests;
- workflow-specific permissions granted explicitly and minimally;
- secrets limited to the workflows and environments that require them;
- fork pull requests run without repository secrets; and
- production environments require a human approval when deployment is added.

Repository workflows:

| Workflow    | Trigger                                      | Responsibility                                                              |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| `CI`        | PRs and pushes involving `staging` or `main` | Repository boundary and complete quality suite                              |
| `PR policy` | Pull request lifecycle                       | Branch/base/title/body policy and managed readiness comment                 |
| `PR health` | Daily schedule and manual dispatch           | Identify stale PRs without auto-closing them                                |
| `Release`   | Accepted push to `main`                      | Publish a version tag and generated GitHub release when the version changed |

The `pull_request_target` PR-policy workflow must never check out or execute pull
request code. It may inspect event metadata and comment through the GitHub API
only. CI executes untrusted pull-request code with read-only permissions and no
repository secrets.

## Stale pull requests and merge readiness

The PR-health workflow marks a pull request stale after 14 days without activity,
posts a reminder, and removes the label when activity resumes. It does not close
pull requests automatically.

Exempt labels:

- `keep-open`: intentionally paused but still owned;
- `blocked`: waiting on a recorded dependency;
- `security`: restricted coordination is required; and
- `release`: active release preparation.

During regular triage, record:

- PR age and last meaningful activity;
- author and reviewer ownership;
- merge conflicts;
- failed or missing required checks;
- unresolved conversations;
- missing approval after the latest push;
- dependency or decision blockers; and
- whether the branch is behind `staging`.

A pull request is merge-ready only when it is not a draft, all required checks
pass on the current head, required approval is current, conversations are
resolved, and the base/head relationship follows this policy.

## Release and version workflow

OrbitOS uses semantic versions: `MAJOR.MINOR.PATCH`.

1. Merge completed feature/fix/documentation PRs into `staging`.
2. Create `release/vX.Y.Z` from `staging`.
3. Update the root package version and any explicit public version references.
4. Open the release-preparation PR back to `staging` with label `release`.
5. Confirm the generated release-note categories, known limitations, migration
   requirements, rollback target, and validation evidence.
6. Merge the release-preparation PR into `staging` after review.
7. Open a manually reviewed pull request from `staging` to `main`.
8. After merge, the Release workflow creates immutable tag `vX.Y.Z` and a GitHub
   release with notes generated from merged pull requests since the prior tag.
9. Verify the release, then synchronize `main` back into `staging` through the
   protected workflow if GitHub did not already preserve identical ancestry.

The release workflow skips version `0.0.0`, skips pushes that do not change the
root version, and fails rather than moving an existing version tag. Publishing to
npm or another package registry is not authorized by this plan; add it only after
the package, license, provenance, and registry decision is approved.

Pull requests should carry one release-note label:

- `breaking-change`;
- `feature`;
- `fix`;
- `security`;
- `documentation`;
- `maintenance`; or
- `skip-changelog`.

## Rollback and incident response

### Before merge

Close or convert the pull request to draft. Do not delete evidence needed to
understand the failed change.

### After merge to `staging`

Create `revert/<description>` from current `staging`, revert the pull-request merge
commit, and open a new reviewed PR to `staging`. Never reset or force-push the
integration branch.

### After release to `main`

The fastest operational rollback is to redeploy the previous immutable release
tag. This does not rewrite Git history. Freeze new `staging` merges while the
release is assessed. Then prepare the source correction or revert on `staging`,
run all required checks, and use the normal manually reviewed `staging` to `main`
release PR.

Database rollback must follow the documented migration strategy. Prefer
forward-compatible expand/migrate/contract changes and corrective forward
migrations. Never assume code rollback can safely reverse financial or evidence
data.

Every rollback records:

- triggering release and pull request;
- impact and detection time;
- immediate containment;
- restored tag or commit;
- data/migration consequences;
- verification evidence; and
- follow-up owner.

## Bootstrap sequence

1. Create `staging` from the current protected `main` head.
2. Commit these policy and workflow files on a topic branch.
3. Open and review the topic-branch PR into `staging`.
4. Let every required workflow run at least once so GitHub registers the check
   names.
5. Enable Actions and apply the repository/token restrictions above.
6. Apply branch protection to `staging`, including the registered checks.
7. Open the first manual `staging` to `main` PR.
8. After the workflows exist on `main`, protect `main` with the same checks and the
   source-branch policy.
9. Test protection with a disposable topic PR and a rejected direct-push attempt.
10. Record the verified settings and first successful run in project memory.

If organization policy prevents a repository setting, record the inherited rule
and do not weaken another control to compensate silently.

## Definition of done

GitHub operations are established only when:

- `staging` exists and matches the expected `main` base;
- Actions are enabled and the four workflows run successfully;
- `main` and `staging` reject direct pushes and force pushes;
- required reviews, latest-push approval, conversation resolution, and status
  checks are enforced on both protected branches;
- a topic PR can merge only into `staging` after checks and review;
- a non-`staging` PR to `main` is rejected;
- a manually approved `staging` to `main` PR succeeds;
- stale PR labeling and readiness comments are visible;
- a test version bump produces one immutable tag and generated GitHub release;
- a rollback rehearsal can restore the prior release tag without rewriting
  protected history; and
- the public-boundary guard proves confidential local material is absent.
