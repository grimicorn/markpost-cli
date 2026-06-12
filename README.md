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
