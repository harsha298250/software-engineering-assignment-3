import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function loadLocalAppletFallback(): string {
  if (process.env.VITE_FIREBASE_API_KEY) {
    return 'null';
  }
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    return 'null';
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return JSON.stringify({
      apiKey: parsed.apiKey || '',
      authDomain: parsed.authDomain || '',
      projectId: parsed.projectId || '',
      storageBucket: parsed.storageBucket || '',
      messagingSenderId: parsed.messagingSenderId || '',
      appId: parsed.appId || '',
      firestoreDatabaseId: parsed.firestoreDatabaseId || '(default)',
      measurementId: parsed.measurementId || '',
    });
  } catch {
    return 'null';
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __FIREBASE_APPLET_FALLBACK__: loadLocalAppletFallback(),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
