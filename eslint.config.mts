import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Vendored verbatim from markpost by scripts/sync-contract.mjs; not
  // hand-edited, so it shouldn't be linted to this repo's rules.
  { ignores: ['src/types/vendor/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierPlugin,
);
