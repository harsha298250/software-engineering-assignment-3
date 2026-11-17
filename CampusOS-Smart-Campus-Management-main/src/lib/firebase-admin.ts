import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

function loadLocalConfigFile(): Partial<FirebaseAppletConfig> {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<FirebaseAppletConfig>;
  } catch (error) {
    console.warn('Unable to parse local firebase-applet-config.json:', error);
    return {};
  }
}

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  const jsonString = raw.startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');

  const parsed = JSON.parse(jsonString) as Record<string, unknown>;
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed as ServiceAccount;
}

const fileConfig = loadLocalConfigFile();
const serviceAccount = parseServiceAccountFromEnv();
const serviceAccountProjectId =
  serviceAccount && 'project_id' in serviceAccount
    ? String((serviceAccount as Record<string, unknown>).project_id || '')
    : serviceAccount?.projectId || '';

export const firebaseConfig: FirebaseAppletConfig = {
  projectId:
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    serviceAccountProjectId ||
    fileConfig.projectId ||
    '',
  appId:
    process.env.FIREBASE_APP_ID ||
    process.env.VITE_FIREBASE_APP_ID ||
    fileConfig.appId ||
    '',
  apiKey:
    process.env.FIREBASE_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    fileConfig.apiKey ||
    '',
  authDomain:
    process.env.FIREBASE_AUTH_DOMAIN ||
    process.env.VITE_FIREBASE_AUTH_DOMAIN ||
    fileConfig.authDomain ||
    '',
  firestoreDatabaseId:
    process.env.FIREBASE_DATABASE_ID ||
    process.env.FIRESTORE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    fileConfig.firestoreDatabaseId ||
    '(default)',
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    fileConfig.storageBucket ||
    '',
  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    fileConfig.messagingSenderId ||
    '',
  measurementId:
    process.env.FIREBASE_MEASUREMENT_ID ||
    process.env.VITE_FIREBASE_MEASUREMENT_ID ||
    fileConfig.measurementId ||
    '',
  oAuthClientId: fileConfig.oAuthClientId || '',
  recaptchaSiteKey: fileConfig.recaptchaSiteKey || '',
};

if (!firebaseConfig.projectId) {
  throw new Error(
    'Missing Firebase project ID. Set FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) in your runtime environment.'
  );
}

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId: firebaseConfig.projectId,
      ...(serviceAccount ? { credential: cert(serviceAccount) } : {}),
    });

export const adminAuth = getAuth(adminApp);
