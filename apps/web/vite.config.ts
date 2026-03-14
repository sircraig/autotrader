import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url))
      },
      {
        find: /^@btc-tui\/core\/(.*)$/,
        replacement: fileURLToPath(new URL('../../packages/core/src/$1', import.meta.url))
      },
      {
        find: '@btc-tui/core',
        replacement: fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url))
      },
      {
        find: /^@btc-tui\/ui\/(.*)$/,
        replacement: fileURLToPath(new URL('../../packages/ui/src/$1', import.meta.url))
      }
    ]
  },
  server: {
    port: 3000
  }
});
