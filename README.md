# dh-sync-cli

CLI tool for sync.danholloran.me

## Installation

This package is hosted on a private GitHub repository. To install it, you need a GitHub personal access token with `repo` scope.

### 1. Create a GitHub token

Go to [GitHub Settings → Developer Settings → Personal Access Tokens](https://github.com/settings/tokens) and create a token with `repo` scope.

### 2. Set your GitHub token in your shell

```bash
export GITHUB_TOKEN={YOUR_GITHUB_TOKEN}
```

Add this to your `~/.zshrc` or `~/.bashrc` to persist it.

### 3. Install the package

```bash
npm install -g @grimicorn/dh-sync-cli --//npm.pkg.github.com/:_authToken=$GITHUB_TOKEN
```

## Development

### Prerequisites

- Node.js
- npm

### Setup

```bash
git clone https://github.com/grimicorn/dh-sync-cli.git
cd dh-sync-cli
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
