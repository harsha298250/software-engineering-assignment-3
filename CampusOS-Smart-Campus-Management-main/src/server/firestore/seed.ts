import 'dotenv/config';
import { runIdempotentSeed } from './store.ts';

async function main() {
  const token = process.env.FIREBASE_ADMIN_ID_TOKEN;
  if (!token) {
    console.log(
      'Note: Cloud Firestore enforces zero-trust Security Rules. Sign in as Admin in the web app to auto-seed Firestore, or pass FIREBASE_ADMIN_ID_TOKEN.'
    );
    return;
  }
  console.log('Seeding Smart Campus Cloud Firestore database...');
  await runIdempotentSeed(token);
  console.log('Firestore seed completed.');
}

main().catch((err) => {
  console.error('Firestore seed failed:', err);
  process.exit(1);
});
