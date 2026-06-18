import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export const prettierOptions = {
  singleQuote: true,
  printWidth: 120,
};

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'out', '**/*.db', 'test/fixtures'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
