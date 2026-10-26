import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
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

let persistenceConfiguredPromise: Promise<void> | null = null;
let redirectResultPromise: Promise<{ user: User | null; error: string | null }> | null = null;
let cachedRedirectUser: User | null = null;

try {
  // 1. Initialize Firebase exactly once
  appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  dbInstance = getFirestore(appInstance, firebaseConfig.firestoreDatabaseId);

  // 2. Create Firebase Auth once with browserLocalPersistence & browserPopupRedirectResolver
  if (typeof window !== 'undefined') {
    try {
      authInstance = initializeAuth(appInstance, {
        persistence: [browserLocalPersistence, indexedDBLocalPersistence],
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      authInstance = getAuth(appInstance);
    }
  } else {
    authInstance = getAuth(appInstance);
  }

  if (firebaseConfig.storageBucket) {
    storageInstance = getStorage(appInstance, `gs://${firebaseConfig.storageBucket}`);
  } else {
    storageInstance = getStorage(appInstance);
  }

  // 4. Create GoogleAuthProvider once
  googleProviderInstance = new GoogleAuthProvider();
  googleProviderInstance.setCustomParameters({ prompt: 'select_account' });
} catch (err) {
  console.error('Initialization warning:', err);
}

export const app = appInstance as FirebaseApp;
export const db = dbInstance as Firestore;
export const auth = authInstance as Auth;
export const storage = storageInstance as FirebaseStorage;
export const googleProvider = googleProviderInstance as GoogleAuthProvider;
export const provider = googleProviderInstance as GoogleAuthProvider;

export function isFirebaseReady(): boolean {
  return Boolean(appInstance && dbInstance);
}

/**
 * 3. Configure browserLocalPersistence once using Firebase's supported persistence API.
 */
export function ensureBrowserLocalPersistence(): Promise<void> {
  if (typeof window === 'undefined' || !authInstance) {
    return Promise.resolve();
  }
  if (!persistenceConfiguredPromise) {
    const activeAuth = authInstance;
    persistenceConfiguredPromise = setPersistence(activeAuth, browserLocalPersistence).catch(
      (err) => {
        console.warn('Persistence configuration warning:', err);
      }
    );
  }
  return persistenceConfiguredPromise;
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
  const currentUser = authInstance?.currentUser ?? cachedRedirectUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
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

export function formatAuthErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    if (error.includes('auth/unauthorized-domain')) {
      return 'This website is not authorized in Firebase Authentication.';
    }
    if (!error.includes('auth/')) {
      return error;
    }
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  if (code.includes('auth/unauthorized-domain') || rawMessage.includes('auth/unauthorized-domain')) {
    return 'This website is not authorized in Firebase Authentication.';
  }

  return 'Unable to sign in. Please try again.';
}

/**
 * 5. Process getRedirectResult(auth) once per page load after configuring browserLocalPersistence.
 * If it returns a user, cache and return that user.
 * If it returns null, do NOT treat null as logout — wait for onAuthStateChanged(auth, user).
 */
export function completeRedirectSignIn(): Promise<{ user: User | null; error: string | null }> {
  if (typeof window === 'undefined' || !authInstance) {
    return Promise.resolve({ user: null, error: null });
  }
  if (!redirectResultPromise) {
    const activeAuth = authInstance;
    redirectResultPromise = (async () => {
      await ensureBrowserLocalPersistence();
      try {
        const result = await getRedirectResult(activeAuth, browserPopupRedirectResolver);
        if (result && result.user) {
          cachedRedirectUser = result.user;
          return { user: result.user, error: null };
        }
        const fallbackUser = activeAuth.currentUser ?? cachedRedirectUser ?? null;
        return { user: fallbackUser, error: null };
      } catch (error) {
        const fallbackUser = activeAuth.currentUser ?? cachedRedirectUser ?? null;
        return {
          user: fallbackUser,
          error: fallbackUser ? null : formatAuthErrorMessage(error),
        };
      }
    })();
  }
  return redirectResultPromise;
}

/**
 * 6. Register onAuthStateChanged(auth, user) after processing getRedirectResult(auth)
 * so the UI never flashes the Login Screen before Firebase finishes restoring the session.
 */
export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  if (!authInstance) {
    callback(null);
    return () => {};
  }
  const activeAuth = authInstance;
  let unsubscribed = false;
  let innerUnsubscribe: (() => void) | null = null;

  (async () => {
    // Process getRedirectResult(auth) first in strict initialization order
    const redirectOutcome = await completeRedirectSignIn();
    if (unsubscribed) return;

    if (redirectOutcome.user) {
      callback(redirectOutcome.user);
    }

    // Wait for Firebase Auth to finish restoring persisted state before emitting null
    if (typeof activeAuth.authStateReady === 'function') {
      try {
        await activeAuth.authStateReady();
      } catch {
        // Ignore readiness errors
      }
    }
    if (unsubscribed) return;

    try {
      innerUnsubscribe = onAuthStateChanged(
        activeAuth,
        (user) => {
          if (unsubscribed) return;
          if (user) {
            cachedRedirectUser = user;
            callback(user);
          } else if (cachedRedirectUser && activeAuth.currentUser) {
            callback(activeAuth.currentUser);
          } else if (cachedRedirectUser) {
            callback(cachedRedirectUser);
          } else {
            callback(null);
          }
        },
        (err) => {
          console.warn('Auth state listener warning:', err);
          if (!unsubscribed) {
            callback(activeAuth.currentUser ?? cachedRedirectUser ?? null);
          }
        }
      );
    } catch {
      if (!unsubscribed) {
        callback(activeAuth.currentUser ?? cachedRedirectUser ?? null);
      }
    }
  })();

  return () => {
    unsubscribed = true;
    if (innerUnsubscribe) {
      innerUnsubscribe();
      innerUnsubscribe = null;
    }
  };
}

/**
 * Verifies whether a signed-in User is authenticated for the Admin Panel.
 * Any valid Google authenticated user (user !== null) is permitted to enter the Admin Dashboard.
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

/**
 * Normalizes /admin to /admin.html via history.replaceState (without reloading)
 * so signInWithRedirect always returns to /admin.html.
 */
function ensureAdminHtmlRedirectTarget(): void {
  if (typeof window === 'undefined') return;
  try {
    const { pathname, search, hash } = window.location;
    if (pathname === '/admin' || pathname === '/admin/') {
      window.history.replaceState(null, '', `/admin.html${search}${hash}`);
    }
  } catch {
    // Ignore history state restriction
  }
}

export async function signInAdminWithGoogle(): Promise<User | null> {
  if (!authInstance || !googleProviderInstance) {
    throw new Error('Unable to sign in. Please try again.');
  }
  const existingUser = authInstance.currentUser ?? cachedRedirectUser;
  if (existingUser) {
    return existingUser;
  }
  ensureAdminHtmlRedirectTarget();
  await ensureBrowserLocalPersistence();
  await signInWithRedirect(authInstance, googleProviderInstance, browserPopupRedirectResolver);
  return null;
}

export async function signOutAdmin(): Promise<void> {
  cachedRedirectUser = null;
  redirectResultPromise = null;
  if (!authInstance) return;
  try {
    await firebaseSignOut(authInstance);
  } catch {
    // Ignore sign-out errors
  }
}

export {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
};
export type { User };
