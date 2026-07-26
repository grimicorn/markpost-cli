// Guards against the vendored markpost contract
// (src/types/vendor/markpost-api.types.ts) silently drifting from what the
// CLI actually depends on. This intentionally never hits the network — the
// vendored file is refreshed by hand via `npm run sync:contract` (see
// README.md#contract-sync) and reviewed like any other diff; this test only
// checks that the *currently committed* vendored copy still exports what the
// CLI expects, and that the CLI's own source compiles against it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TSCONFIG_PATH = fileURLToPath(
  new URL('../../tsconfig.json', import.meta.url),
);
const VENDOR_CONTRACT_PATH = fileURLToPath(
  new URL('../../src/types/vendor/markpost-api.types.ts', import.meta.url),
);

// The exact set of type names the CLI's own types (records.types.ts,
// sources.types.ts, api.types.ts) import from the vendored contract. This is
// a fast, specific check; the full-project compile below is what actually
// proves the CLI's usage still works, including cases (a renamed export
// becoming an interface, a re-export) this name list wouldn't catch on its
// own.
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

function isExportedTypeAlias(node: ts.Node): node is ts.TypeAliasDeclaration {
  if (!ts.isTypeAliasDeclaration(node)) {
    return false;
  }

  return (
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  );
}

function parseProjectConfig(): ts.ParsedCommandLine {
  const configFile = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'),
    );
  }

  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, REPO_ROOT);
}

// Compiles the CLI's actual `src/` — the same file set `npm run build`
// compiles — rather than a hand-written stand-in fixture, so this test
// fails on exactly the same drift a real build would catch, without
// depending on running a full build.
function compileProjectDiagnostics(): readonly ts.Diagnostic[] {
  const parsedConfig = parseProjectConfig();
  const program = ts.createProgram(parsedConfig.fileNames, {
    ...parsedConfig.options,
    noEmit: true,
  });

  return ts.getPreEmitDiagnostics(program);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => '\n',
  });
}

describe('markpost contract drift', () => {
  it('the vendored contract still exports what the CLI depends on', () => {
    const vendorSource = readFileSync(VENDOR_CONTRACT_PATH, 'utf-8');
    const actualExports = exportedTypeAliasNames(vendorSource);

    expect(actualExports).toEqual(
      expect.arrayContaining(EXPECTED_VENDORED_EXPORTS),
    );
  });

  it("the CLI's own source compiles against the vendored contract", () => {
    const diagnostics = compileProjectDiagnostics();

    expect(diagnostics, formatDiagnostics(diagnostics)).toHaveLength(0);
  });
});
