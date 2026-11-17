import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
  measurementId?: string;
}

declare global {
  interface Window {
    __FIREBASE_CONFIG__?: Partial<FirebaseWebConfig>;
  }
}

declare const __FIREBASE_APPLET_FALLBACK__: Partial<FirebaseWebConfig> | null | undefined;

function resolveFirebaseConfig(): FirebaseWebConfig {
  const runtime =
    typeof window !== 'undefined' && window.__FIREBASE_CONFIG__
      ? window.__FIREBASE_CONFIG__
      : undefined;

  const fallback =
    typeof __FIREBASE_APPLET_FALLBACK__ !== 'undefined' && __FIREBASE_APPLET_FALLBACK__
      ? __FIREBASE_APPLET_FALLBACK__
      : undefined;

  const envConfig: Partial<FirebaseWebConfig> = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  const config: FirebaseWebConfig = {
    apiKey: runtime?.apiKey || envConfig.apiKey || fallback?.apiKey || '',
    authDomain: runtime?.authDomain || envConfig.authDomain || fallback?.authDomain || '',
    projectId: runtime?.projectId || envConfig.projectId || fallback?.projectId || '',
    storageBucket:
      runtime?.storageBucket || envConfig.storageBucket || fallback?.storageBucket || '',
    messagingSenderId:
      runtime?.messagingSenderId ||
      envConfig.messagingSenderId ||
      fallback?.messagingSenderId ||
      '',
    appId: runtime?.appId || envConfig.appId || fallback?.appId || '',
    firestoreDatabaseId:
      runtime?.firestoreDatabaseId ||
      envConfig.firestoreDatabaseId ||
      fallback?.firestoreDatabaseId ||
      '(default)',
    ...(runtime?.measurementId || envConfig.measurementId || fallback?.measurementId
      ? {
          measurementId:
            runtime?.measurementId || envConfig.measurementId || fallback?.measurementId,
        }
      : {}),
  };

  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error(
      'Missing Firebase Web configuration. Configure VITE_FIREBASE_* variables in .env before starting the container.'
    );
  }

  return config;
}

const firebaseConfig = resolveFirebaseConfig();

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
