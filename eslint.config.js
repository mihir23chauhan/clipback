// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      // R-VALUE-BOUNDARY (T0) leans on this: an implicit any hides a float
      // crossing a boundary that is declared to carry integers.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'document',
          property: 'write',
          message: 'clipback renders into youtube.com. Use textContent.',
        },
      ],
      // hld K6: S3 is the highest-consequence escape site in the product.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message:
            'innerHTML is forbidden: claims[].text and dropped[].text are unbounded model prose rendered on youtube.com origin. Use textContent.',
        },
      ],
    },
  },
)
