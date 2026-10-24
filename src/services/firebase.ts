import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  Auth,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const PRODUCTION_PAGES_DOMAIN = 'neo-boii-store.pages.dev';

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;
let persistenceReadyPromise: Promise<void> = Promise.resolve();
let redirectResultPromise: Promise<{ user: User | null; error: string | null }> | null = null;

try {
  appInstance = initializeApp(firebaseConfig);
  dbInstance = getFirestore(appInstance, firebaseConfig.firestoreDatabaseId);
  authInstance = getAuth(appInstance);
  if (firebaseConfig.storageBucket) {
    storageInstance = getStorage(appInstance, `gs://${firebaseConfig.storageBucket}`);
  } else {
    storageInstance = getStorage(appInstance);
  }
  googleProviderInstance = new GoogleAuthProvider();
  googleProviderInstance.setCustomParameters({ prompt: 'select_account' });

  if (typeof window !== 'undefined' && authInstance) {
    const activeAuth = authInstance;
    persistenceReadyPromise = setPersistence(activeAuth, browserLocalPersistence).catch(async () => {
      try {
        await setPersistence(activeAuth, inMemoryPersistence);
      } catch {
        // Ignore persistence fallback errors on restricted mobile browsers
      }
    });
  }
} catch (err) {
  console.error('Initialization warning:', err);
}

export const app = appInstance as FirebaseApp;
export const db = dbInstance as Firestore;
export const auth = authInstance as Auth;
export const storage = storageInstance as FirebaseStorage;
export const googleProvider = googleProviderInstance as GoogleAuthProvider;

export function isFirebaseReady(): boolean {
  return Boolean(appInstance && dbInstance);
}

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
  const currentUser = authInstance?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
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

async function testConnection(): Promise<void> {
  if (!dbInstance) return;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  testConnection().catch(() => {
    // Never allow connection test to cause unhandled promise rejection
  });
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  if (!authInstance) {
    callback(null);
    return () => {};
  }
  try {
    return onAuthStateChanged(
      authInstance,
      (user) => callback(user),
      (err) => {
        console.warn('Auth state listener warning:', err);
        callback(null);
      }
    );
  } catch {
    callback(null);
    return () => {};
  }
}

/**
 * Verifies whether a signed-in User is authenticated for the Admin Panel.
 * Any valid signed-in user is permitted to access the Admin Panel.
 */
export async function verifyAdminAuthorization(user: User | null): Promise<boolean> {
  if (!user) return false;
  if (user.uid) return true;

  if (!dbInstance) return false;

  try {
    const adminDocRef = doc(dbInstance, 'admins', user.uid);
    const adminSnap = await getDoc(adminDocRef);
    return adminSnap.exists();
  } catch {
    return true;
  }
}

export function formatAuthErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  if (code.includes('auth/unauthorized-domain') || rawMessage.includes('auth/unauthorized-domain')) {
    return 'Google sign-in is not enabled for this website domain.';
  }

  if (
    code.includes('auth/popup-closed-by-user') ||
    rawMessage.includes('auth/popup-closed-by-user') ||
    code.includes('auth/cancelled-popup-request') ||
    rawMessage.includes('auth/cancelled-popup-request') ||
    code.includes('auth/redirect-cancelled-by-user') ||
    rawMessage.includes('auth/redirect-cancelled-by-user') ||
    code.includes('auth/operation-not-allowed') ||
    rawMessage.includes('auth/operation-not-allowed') ||
    code.includes('auth/network-request-failed') ||
    rawMessage.includes('auth/network-request-failed')
  ) {
    return 'Google sign-in could not be completed. Please try again.';
  }

  return 'Google sign-in could not be completed. Please try again.';
}

export function completeRedirectSignIn(): Promise<{ user: User | null; error: string | null }> {
  if (typeof window === 'undefined' || !authInstance) {
    return Promise.resolve({ user: null, error: null });
  }
  if (!redirectResultPromise) {
    const activeAuth = authInstance;
    redirectResultPromise = persistenceReadyPromise
      .then(() => getRedirectResult(activeAuth))
      .then((result) => ({
        user: result?.user ?? activeAuth.currentUser ?? null,
        error: null,
      }))
      .catch((error) => ({
        user: activeAuth.currentUser ?? null,
        error: formatAuthErrorMessage(error),
      }));
  }
  return redirectResultPromise;
}

export async function signInAdminWithGoogle(): Promise<User | null> {
  if (!authInstance || !googleProviderInstance) {
    throw new Error('Google sign-in could not be completed. Please try again.');
  }
  if (authInstance.currentUser) {
    return authInstance.currentUser;
  }
  await persistenceReadyPromise;
  await signInWithRedirect(authInstance, googleProviderInstance);
  return null;
}

export async function signOutAdmin(): Promise<void> {
  if (!authInstance) return;
  try {
    await firebaseSignOut(authInstance);
  } catch {
    // Ignore sign-out errors
  }
}

export { onAuthStateChanged, signInWithRedirect, getRedirectResult };
export type { User };
