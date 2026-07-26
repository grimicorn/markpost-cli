// Guards against the vendored markpost contract
// (src/types/vendor/markpost-api.types.ts) silently drifting from what the
// CLI actually depends on. This intentionally never hits the network — the
// vendored file is refreshed by hand via `npm run sync:contract` (see
// README.md#contract-sync) and reviewed like any other diff; this test only
// checks that the *currently committed* vendored copy still exports what the
// CLI expects, and that the CLI's own usage of it still compiles.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const VENDOR_CONTRACT_PATH = fileURLToPath(
  new URL('../../src/types/vendor/markpost-api.types.ts', import.meta.url),
);
const USAGE_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/contract-usage.fixture.ts', import.meta.url),
);

// The exact set of type names the CLI's own types (records.types.ts,
// sources.types.ts, api.types.ts) import from the vendored contract.
const EXPECTED_VENDORED_EXPORTS = [
  'ApiError',
  'ApiRequest',
  'ApiResourceObject',
  'ApiResponse',
];

function exportedTypeAliasNames(sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(
    'markpost-api.types.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  const names: string[] = [];

  sourceFile.forEachChild((node) => {
    if (isExportedTypeAlias(node)) {
      names.push(node.name.text);
    }
  });

  return names;
}

function isExportedTypeAlias(
  node: ts.Node,
): node is ts.TypeAliasDeclaration {
  if (!ts.isTypeAliasDeclaration(node)) {
    return false;
  }

  return (
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  );
}

function compileFixtureDiagnostics(): readonly ts.Diagnostic[] {
  const program = ts.createProgram([USAGE_FIXTURE_PATH], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  });

  const relevantFiles = new Set([USAGE_FIXTURE_PATH, VENDOR_CONTRACT_PATH]);

  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => relevantFiles.has(diagnostic.file?.fileName ?? ''));
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => '\n',
  });
}

describe('markpost contract drift', () => {
  it('the vendored contract still exports exactly what the CLI depends on', () => {
    const vendorSource = readFileSync(VENDOR_CONTRACT_PATH, 'utf-8');
    const actualExports = exportedTypeAliasNames(vendorSource).sort();

    expect(actualExports).toEqual([...EXPECTED_VENDORED_EXPORTS].sort());
  });

  it("the CLI's own usage of the vendored contract compiles with no errors", () => {
    const diagnostics = compileFixtureDiagnostics();

    expect(diagnostics, formatDiagnostics(diagnostics)).toHaveLength(0);
  });
});
