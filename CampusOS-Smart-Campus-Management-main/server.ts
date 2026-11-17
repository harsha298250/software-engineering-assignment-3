import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApp } from './src/server/app.ts';
import { firebaseConfig } from './src/lib/firebase-admin.ts';

function buildClientFirebaseHtml(templateHtml: string): string {
  const publicClientConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || '',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || '',
    messagingSenderId:
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId || '',
    appId: process.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId || '',
    firestoreDatabaseId:
      process.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)',
    measurementId:
      process.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfig.measurementId || '',
  };

  if (!publicClientConfig.apiKey || !publicClientConfig.projectId || !publicClientConfig.appId) {
    return templateHtml;
  }

  const serialized = JSON.stringify(publicClientConfig).replace(/</g, '\\u003c');
  const scriptTag = `<script>window.__FIREBASE_CONFIG__=${serialized};</script>`;
  return templateHtml.includes('</head>')
    ? templateHtml.replace('</head>', `  ${scriptTag}\n  </head>`)
    : `${scriptTag}\n${templateHtml}`;
}

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    const rawHtml = fs.readFileSync(indexPath, 'utf8');
    const renderedHtml = buildClientFirebaseHtml(rawHtml);

    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => {
      res.type('html').send(renderedHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Campus server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
