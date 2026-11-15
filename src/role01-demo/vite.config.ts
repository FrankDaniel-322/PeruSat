import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/role01-demo',
    rollupOptions: { input: 'role01-demo.html' },
  },
});
