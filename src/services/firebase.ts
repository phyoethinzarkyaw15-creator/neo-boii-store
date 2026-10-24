import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
    setPersistence(authInstance, browserLocalPersistence).catch(() => {
      if (authInstance) {
        setPersistence(authInstance, inMemoryPersistence).catch(() => {
          // Ignore persistence errors on restricted mobile browsers
        });
      }
    });

    // Process any pending mobile redirect sign-in result cleanly
    getRedirectResult(authInstance).catch(() => {
      // Ignore redirect check warnings when no redirect is pending
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
    return 'This domain is not yet enabled for sign-in. Please add this domain to your authentication settings and try again.';
  }

  if (code.includes('auth/popup-blocked') || rawMessage.includes('auth/popup-blocked')) {
    return 'Sign-in popup was blocked by your browser. Redirecting to sign in...';
  }

  if (
    code.includes('auth/popup-closed-by-user') ||
    rawMessage.includes('auth/popup-closed-by-user') ||
    code.includes('auth/cancelled-popup-request')
  ) {
    return 'Sign-in window was closed before completing. Please try again.';
  }

  return 'Unable to complete sign-in. Please check your connection and try again.';
}

export async function signInAdminWithGoogle(): Promise<User | null> {
  if (!authInstance || !googleProviderInstance) {
    throw new Error('Authentication service is currently unavailable.');
  }
  try {
    const result = await signInWithPopup(authInstance, googleProviderInstance);
    return result.user;
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code.includes('auth/popup-blocked')) {
      await signInWithRedirect(authInstance, googleProviderInstance);
      return null;
    }
    throw error;
  }
}

export async function signOutAdmin(): Promise<void> {
  if (!authInstance) return;
  try {
    await firebaseSignOut(authInstance);
  } catch {
    // Ignore sign-out errors
  }
}

export { onAuthStateChanged };
export type { User };
