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
import ts from 'typescript';

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
// instead of the checkout the caller actually meant. This check runs
// unconditionally (not just on the no-`--from` path) so `--from ../markpost
// --dry-run` doesn't silently ignore the typo'd `--dry-run` and proceed.
function parseFromPathArg(argv) {
  const unrecognizedFlags = argv.filter(
    (argument) => argument.startsWith('--') && !argument.startsWith('--from'),
  );

  if (unrecognizedFlags.length > 0) {
    throw new Error(`Unrecognized option(s): ${unrecognizedFlags.join(', ')}`);
  }

  const equalsFlag = argv.find((argument) => argument.startsWith('--from='));
  const spaceFlagIndex = argv.indexOf('--from');

  if (!equalsFlag && spaceFlagIndex === -1) {
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

// The commit that actually last touched the contract file, not just
// whatever HEAD happens to be — keeps the manifest diff stable across
// upstream commits that don't touch `server/types/api.types.ts`.
function readCommitHash(checkoutDir) {
  return execFileSync(
    'git',
    ['log', '-1', '--format=%H', '--', CONTRACT_RELATIVE_PATH],
    { cwd: checkoutDir, encoding: 'utf-8' },
  ).trim();
}

// Resolves the checkout's real `origin` remote so a `--from` sync against a
// fork or a local branch records provenance the manifest can actually be
// verified against, instead of hardcoding `grimicorn/markpost` for a commit
// that may not exist there. Falls back to the absolute local path when the
// checkout has no `origin` remote (e.g. a bare local clone).
function resolveSourceRepo(checkoutDir) {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: checkoutDir,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return checkoutDir;
  }
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

// The vendored file gets compiled straight into the published CLI's `dist`,
// so nothing today stops a future runtime statement or side-effecting
// import in markpost's contract file from riding along silently — the diff
// review is the only guard, and it's human. Refuse to vendor anything but
// type-only declarations (type aliases, interfaces, and the `import type`s
// they depend on) so that gap fails loudly at sync time instead.
function assertContractIsTypeOnly(contractSource) {
  // `setParentNodes: true` so each statement's `.getStart()` below can
  // resolve its position without needing the source file passed explicitly.
  const sourceFile = ts.createSourceFile(
    CONTRACT_RELATIVE_PATH,
    contractSource,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const runtimeStatements = sourceFile.statements.filter((statement) => {
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      return false;
    }

    if (ts.isImportDeclaration(statement)) {
      return !statement.importClause?.isTypeOnly;
    }

    return true;
  });

  if (runtimeStatements.length > 0) {
    throw new Error(
      `${CONTRACT_RELATIVE_PATH} contains non-type declaration(s) at line(s) ` +
        `${runtimeStatements
          .map(
            (statement) =>
              sourceFile.getLineAndCharacterOfPosition(statement.getStart())
                .line + 1,
          )
          .join(', ')} — refusing to vendor a file that isn't type-only`,
    );
  }
}

function writeVendoredContract(contractSource) {
  assertContractIsTypeOnly(contractSource);

  mkdirSync(VENDOR_DIR, { recursive: true });
  writeFileSync(VENDOR_FILE, `${VENDOR_FILE_HEADER}${contractSource}`);
}

function writeManifest(sourceRepo, sourceCommit) {
  const manifest = {
    sourceRepo,
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
  const sourceRepo = resolveSourceRepo(checkoutDir);

  writeVendoredContract(contractSource);
  writeManifest(sourceRepo, sourceCommit);
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

// Only run when executed directly (`node scripts/sync-contract.mjs` /
// `npm run sync:contract`), not when imported — this module is imported by
// tests/scripts/sync-contract.test.ts to unit-test the pure parsing and
// validation logic below without touching the network.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { assertContractIsTypeOnly, parseFromPathArg };
