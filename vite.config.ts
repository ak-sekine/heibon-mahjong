import { defineConfig } from 'vite';

export default defineConfig({
  base: '/heibon-mahjong/',
  build: { rollupOptions: { input: { main: 'index.html', kanTest: 'kan-test.html', test: 'test.html' } } },
});
