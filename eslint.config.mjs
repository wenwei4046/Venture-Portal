import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Next 16 (2026-10-21): `next lint` is gone and eslint-config-next is flat config itself, so the FlatCompat bridge
// went. `npm run lint` lints src/, the folder `next lint` linted here.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next 16 brings eslint-plugin-react-hooks 7, whose recommended set adds the React Compiler's
    // checks as errors — 1,157 of them on the day, not one from a rule Next 15 asked. The app does not run the React
    // Compiler, so the upgrade keeps Next 15's two hook rules (rules-of-hooks error, exhaustive-deps warn) and leaves
    // these off; taking them on is its own task (TODOS.md › Owed — the React Compiler's lint rules).
    rules: {
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
    },
  },
  globalIgnores(['.next/**', '.open-next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
