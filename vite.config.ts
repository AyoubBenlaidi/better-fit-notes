import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('recharts')) return 'charts';
          if (id.includes('@supabase')) return 'supabase';
if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/')) return 'forms';
          if (id.includes('react-router')) return 'router';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('date-fns') || id.includes('lucide-react') || id.includes('/clsx/')) return 'utils';
          if (id.includes('react-dom') || (id.includes('node_modules/react/') && !id.includes('react-'))) return 'react';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
