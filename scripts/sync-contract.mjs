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
//   npm run sync:contract                     # shallow-clones markpost fresh
//   npm run sync:contract -- --from <path>    # copies from an existing local checkout
//   npm run sync:contract -- --from=<path>    # same, `=` form

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
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

// Accepts both `--from <path>` and `--from=<path>`. A typo'd flag (e.g.
// `--form`) must fail loudly rather than silently falling through to a
// network clone that overwrites the vendored file from upstream `main`
// instead of the checkout the caller actually meant.
function parseFromPathArg(argv) {
  const equalsFlag = argv.find((argument) => argument.startsWith('--from='));
  const spaceFlagIndex = argv.indexOf('--from');

  if (!equalsFlag && spaceFlagIndex === -1) {
    const unrecognizedFlags = argv.filter((argument) =>
      argument.startsWith('--'),
    );

    if (unrecognizedFlags.length > 0) {
      throw new Error(`Unrecognized option(s): ${unrecognizedFlags.join(', ')}`);
    }

    return undefined;
  }

  const fromPath = equalsFlag
    ? equalsFlag.slice('--from='.length)
    : argv[spaceFlagIndex + 1];

  if (!fromPath || fromPath.startsWith('--')) {
    throw new Error('--from requires a path to a local markpost checkout');
  }

  if (!existsSync(fromPath)) {
    throw new Error(`--from path does not exist: ${fromPath}`);
  }

  return fromPath;
}

function cloneMarkpostInto(cloneDir) {
  execFileSync('git', ['clone', '--depth', '1', MARKPOST_REPO_URL, cloneDir], {
    stdio: 'inherit',
  });
}

function assertContractIsCommitted(checkoutDir) {
  const status = execFileSync(
    'git',
    ['status', '--porcelain', '--', CONTRACT_RELATIVE_PATH],
    { cwd: checkoutDir, encoding: 'utf-8' },
  ).trim();

  if (!status) {
    return;
  }

  throw new Error(
    `${CONTRACT_RELATIVE_PATH} has uncommitted changes in ${checkoutDir} — ` +
      'commit them first so manifest.json records the commit the vendored file actually came from',
  );
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
  mkdirSync(VENDOR_DIR, { recursive: true });
  writeFileSync(VENDOR_FILE, `${VENDOR_FILE_HEADER}${contractSource}`);
}

function writeManifest(sourceCommit) {
  const manifest = {
    sourceRepo: MARKPOST_REPO_URL,
    sourceFile: CONTRACT_RELATIVE_PATH,
    sourceCommit,
    syncedAt: new Date().toISOString(),
  };

  mkdirSync(VENDOR_DIR, { recursive: true });
  writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

// Resolves everything that can fail (missing contract file, uncommitted
// changes to it, `git rev-parse`) before writing anything, so a mid-sync
// failure can't leave the vendored file and the manifest's `sourceCommit`
// out of sync with each other, or a claimed provenance the checkout doesn't
// actually match. Checks the contract file first so a non-markpost
// directory gets the friendly "is this a markpost checkout?" message
// instead of a raw git error.
function syncFrom(checkoutDir) {
  const contractSource = readContractSource(checkoutDir);

  assertContractIsCommitted(checkoutDir);
  const sourceCommit = readCommitHash(checkoutDir);

  writeVendoredContract(contractSource);
  writeManifest(sourceCommit);
}

function main() {
  const fromPath = parseFromPathArg(process.argv.slice(2));
  // Own the temp directory here (not inside a clone helper) so the `finally`
  // below covers a clone that fails partway through, not just a successful one.
  const temporaryCloneDir = fromPath
    ? undefined
    : mkdtempSync(join(tmpdir(), 'markpost-contract-sync-'));

  try {
    if (temporaryCloneDir) {
      cloneMarkpostInto(temporaryCloneDir);
    }

    const checkoutDir = fromPath ?? temporaryCloneDir;

    syncFrom(checkoutDir);
    console.log(`Synced ${VENDOR_FILE} from ${checkoutDir}`);
    console.log(
      'Review the diff, then run `npm run build` and `npm test` before committing.',
    );
  } finally {
    if (temporaryCloneDir) {
      rmSync(temporaryCloneDir, { recursive: true, force: true });
    }
  }
}

main();
