import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Los tests integran comparten data/ y la GC borra huérfanos: en paralelo
    // una suite puede barrer los fixtures de otra. La app real usa una sola BD.
    fileParallelism: false,
    env: {
      // Root aislado: la GC de media nunca debe alcanzar data/ real.
      AIRSHOT_STORAGE_ROOT: './.test-data',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
