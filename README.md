# @markpost/cli

CLI tool for sync.danholloran.me

## Installation

```bash
npm install -g @markpost/cli
```

Once installed, run the CLI with the `markpost` command.

## Development

### Prerequisites

- Node.js
- npm

### Setup

```bash
git clone https://github.com/grimicorn/markpost-cli.git
cd markpost-cli
npm install
```

### Environment Variables

Copy [`.envrc`](.envrc) and populate your values. If you use [direnv](https://direnv.net/), run `direnv allow` to load them automatically.

| Variable | Description |
|---|---|
| `API_TOKEN` | API token for sync.danholloran.me |
| `BASE_URL` | Base URL of the sync API (e.g. `http://localhost:8888` for local dev) |
| `OUTPUT_DIRECTORY` | Absolute path to the directory where synced files are written |

### Scripts

| Command            | Description                            |
| ------------------ | -------------------------------------- |
| `npm run build`    | Compile TypeScript to `dist/`          |
| `npm run watch`    | Watch and recompile on changes         |
| `npm test`         | Run tests with Vitest                  |
| `npm run test:ci`  | Run tests once (CI mode)               |
| `npm run test:ui`  | Run tests with Vitest UI               |
| `npm run lint`     | Check formatting and linting           |
| `npm run lint:fix` | Auto-fix formatting and linting issues |
| `npm run sync:contract` | Refresh the vendored markpost API contract (see below) |

### Contract sync

The CLI talks to [markpost](https://github.com/grimicorn/markpost)'s API, so its
request/response types need to match markpost's real contract exactly — a
structural mismatch here previously caused real pagination and
error-swallowing bugs. Instead of hand-mirroring markpost's types (which drift
silently), `src/types/vendor/markpost-api.types.ts` is a vendored, verbatim
copy of markpost's `server/types/api.types.ts`, and `src/types/api.types.ts`
re-exports the generic envelope types (`ApiError`, `ApiRequest`,
`ApiResourceObject`, `ApiResponse`) from it.

- **Refreshing it:** run `npm run sync:contract` (optionally
  `-- --from <path-to-a-local-markpost-checkout>`; without `--from` it
  shallow-clones markpost fresh). This is a **human-run** step, not part of
  CI — it needs network access (or a local checkout) to fetch the current
  contract, and a test that depends on network access would be flaky and fail
  offline. Review the resulting diff, run `npm run build` and `npm test`, then
  commit it like any other change.
- **Catching drift:** `tests/types/contract-drift.test.ts` runs on every
  `npm test` / `npm run test:ci` and fails if either (a) the committed vendored
  file stops exporting the exact type names the CLI depends on, or (b) the
  CLI's own usage of those types (`tests/types/fixtures/contract-usage.fixture.ts`)
  no longer compiles against it. It does this by feeding the vendored file and
  the fixture through the TypeScript compiler API directly — no network
  access, no CI workflow changes needed.
- **Wiring into CI:** the agent that authored this can't push to
  `.github/workflows/*` (the token lacks the `workflow` scope), so add this
  step to CI by hand — it's already covered by the existing `npm test` /
  `npm run test:ci` invocation in your workflow, so no new step is strictly
  required. If you want an explicit, separate CI signal for contract drift
  specifically (e.g. to label it distinctly in the checks UI), add:
  ```yaml
  - name: Check markpost contract drift
    run: npx vitest run tests/types/contract-drift.test.ts
  ```
  after your existing install step.
- **What this does *not* do:** it does not detect when markpost's *real*
  upstream contract has changed and the vendored copy has fallen behind — that
  would require network access at test time (flaky, and fails offline CI).
  Re-run `npm run sync:contract` periodically or whenever a markpost API
  change is suspected.

## Security scanning

This repo runs a deterministic security-scanner layer in two places: a local
pre-commit hook and GitHub Actions CI.

### Secret detection (gitleaks)

[gitleaks](https://github.com/gitleaks/gitleaks) scans for committed secrets.
The ruleset lives in [`.gitleaks.toml`](.gitleaks.toml): it extends the gitleaks
default rules and adds custom rules for Clerk secret keys (`sk_live_` /
`sk_test_`) and Postgres/Neon connection strings that embed credentials. Example
and test-fixture files are allowlisted.

- **Locally**, the [`.husky/pre-commit`](.husky/pre-commit) hook runs
  `gitleaks git --staged` and blocks the commit on any finding. Install
  gitleaks to enable it (`brew install gitleaks`, or see the
  [install docs](https://github.com/gitleaks/gitleaks#installing)). If gitleaks
  is not installed the hook prints a notice and continues — CI still enforces the
  scan, so nothing slips through.
- **In CI**, the `gitleaks` job in
  [`.github/workflows/security.yml`](.github/workflows/security.yml) downloads
  the pinned gitleaks release and scans the pull-request commit range on PRs and
  the full history on push to `main`. Any finding fails the build.

### Dependency scanning

The `dependency-audit` job in the same workflow runs `npm audit`. Moderate and
low advisories are printed as a summary; the build fails only on **high** or
**critical** severity. [`.github/dependabot.yml`](.github/dependabot.yml) opens
weekly dependency-update PRs, grouping minor and patch bumps into a single PR.
