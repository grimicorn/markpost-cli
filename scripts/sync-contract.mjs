#!/usr/bin/env node
// Human-run tool: vendors markpost's `server/types/api.types.ts` into
// `src/types/vendor/markpost-api.types.ts` so the CLI's request/response
// types can never silently drift from markpost's real contract again.
//
// This intentionally does NOT run in CI or in the test suite — it needs
// network access (or a local markpost checkout) to fetch the current
// contract, and a test that depends on network access is flaky and fails
// offline. Run it by hand whenever markpost's API contract changes, review
// the diff it produces, then commit the result.
//
// Usage:
//   npm run sync:contract                # shallow-clones markpost fresh
//   npm run sync:contract -- --from <path>  # copies from an existing local checkout

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKPOST_REPO_URL = 'https://github.com/grimicorn/markpost';
const CONTRACT_RELATIVE_PATH = 'server/types/api.types.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');
const VENDOR_DIR = join(REPO_ROOT, 'src/types/vendor');
const VENDOR_FILE = join(VENDOR_DIR, 'markpost-api.types.ts');
const MANIFEST_FILE = join(VENDOR_DIR, 'manifest.json');

const VENDOR_FILE_HEADER = `// GENERATED FILE — do not hand-edit.
//
// This is a vendored, verbatim copy of markpost's \`server/types/api.types.ts\`.
// markpost is the source of truth for the request/response contract; the CLI
// mirrors it here instead of re-deriving it by hand so the two can't quietly
// drift apart the way \`ApiData\` (attributes+errors on one object) did before.
//
// Regenerate with \`npm run sync:contract\` (see README.md#contract-sync).
// The drift test at tests/types/contract-drift.test.ts fails if this file's
// exports or the CLI's usage of them stop lining up.
//
// Source: grimicorn/markpost @ ${CONTRACT_RELATIVE_PATH}
// See src/types/vendor/manifest.json for the exact commit this was synced from.

`;

function parseFromPathArg(argv) {
  const fromFlagIndex = argv.indexOf('--from');

  if (fromFlagIndex === -1) {
    return undefined;
  }

  const fromPath = argv[fromFlagIndex + 1];

  if (!fromPath) {
    throw new Error('--from requires a path to a local markpost checkout');
  }

  return fromPath;
}

function cloneMarkpostShallow() {
  const cloneDir = mkdtempSync(join(tmpdir(), 'markpost-contract-sync-'));

  execFileSync('git', ['clone', '--depth', '1', MARKPOST_REPO_URL, cloneDir], {
    stdio: 'inherit',
  });

  return cloneDir;
}

function readCommitHash(checkoutDir) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: checkoutDir,
    encoding: 'utf-8',
  }).trim();
}

function readContractSource(checkoutDir) {
  const contractSourcePath = join(checkoutDir, CONTRACT_RELATIVE_PATH);

  if (!existsSync(contractSourcePath)) {
    throw new Error(
      `No ${CONTRACT_RELATIVE_PATH} found in ${checkoutDir} — is this a markpost checkout?`,
    );
  }

  return readFileSync(contractSourcePath, 'utf-8');
}

function writeVendoredContract(contractSource) {
  writeFileSync(VENDOR_FILE, `${VENDOR_FILE_HEADER}${contractSource}`);
}

function writeManifest(sourceCommit) {
  const manifest = {
    sourceRepo: MARKPOST_REPO_URL,
    sourceFile: CONTRACT_RELATIVE_PATH,
    sourceCommit,
    syncedAt: new Date().toISOString(),
  };

  writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

// Resolves everything that can fail (missing contract file, `git rev-parse`)
// before writing anything, so a mid-sync failure can't leave the vendored
// file and the manifest's `sourceCommit` out of sync with each other.
function main() {
  const fromPath = parseFromPathArg(process.argv.slice(2));
  const isTemporaryClone = !fromPath;
  const checkoutDir = fromPath ?? cloneMarkpostShallow();

  try {
    const contractSource = readContractSource(checkoutDir);
    const sourceCommit = readCommitHash(checkoutDir);

    writeVendoredContract(contractSource);
    writeManifest(sourceCommit);
    console.log(`Synced ${VENDOR_FILE} from ${checkoutDir}`);
    console.log('Review the diff, then run `npm run build` and `npm test` before committing.');
  } finally {
    if (isTemporaryClone) {
      rmSync(checkoutDir, { recursive: true, force: true });
    }
  }
}

main();
