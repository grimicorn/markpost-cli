import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.{test,spec}.{ts,js}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@t': fileURLToPath(new URL('./src/types', import.meta.url)),
    },
  },
});
