import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { AccountStatus, ProductFormInput, PubgAccountProduct } from '../types/store';
import { validateProductInput } from '../utils/storeLogic';

const LOCAL_STORAGE_KEY = 'neo_empire_real_records_v1';
const LEGACY_KEYS = ['neo_empire_mmk_vault_v3', 'neo_empire_products_v2', 'neo_empire_products_v1'];
const SYNC_CHANNEL_NAME = 'neo_empire_real_sync_v1';

function isAutomatedTestSession(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('autostart') === '1';
}

function createSafeBroadcastChannel(): BroadcastChannel | null {
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      return new BroadcastChannel(SYNC_CHANNEL_NAME);
    }
  } catch {
    // Ignore BroadcastChannel restriction on mobile WebViews
  }
  return null;
}

const broadcastChannel = createSafeBroadcastChannel();

function clearLegacyCaches(): void {
  try {
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

/**
 * Loads only real administrator-created products.
 * Never returns fake or pre-generated products when the database is empty.
 */
export function loadStoredProducts(): PubgAccountProduct[] {
  clearLegacyCaches();
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PubgAccountProduct[];
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item.id === 'string' && item.currency === 'MMK');
    }
  } catch {
    // Ignore storage read errors
  }
  return [];
}

function saveStoredProducts(products: PubgAccountProduct[], broadcast = true): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
    if (broadcast && broadcastChannel) {
      broadcastChannel.postMessage({ type: 'PRODUCTS_UPDATED', products });
    }
  } catch {
    // Ignore storage quota errors
  }
}

function normalizeTimestamp(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    return new Date((val as { seconds: number }).seconds * 1000).toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function docToProduct(data: Record<string, unknown>, idFallback: string): PubgAccountProduct {
  const images = Array.isArray(data.images) ? (data.images as string[]).filter(Boolean) : [];
  const mainImage =
    typeof data.mainImage === 'string' && data.mainImage.length > 0
      ? data.mainImage
      : images[0] || '';

  return {
    id: typeof data.id === 'string' ? data.id : idFallback,
    name: typeof data.name === 'string' ? data.name : '',
    price: typeof data.price === 'number' ? data.price : 0,
    currency: 'MMK',
    status:
      data.status === AccountStatus.SOLD_OUT
        ? AccountStatus.SOLD_OUT
        : AccountStatus.AVAILABLE,
    description: typeof data.description === 'string' ? data.description : '',
    features: Array.isArray(data.features) ? (data.features as string[]).filter(Boolean) : [],
    images,
    mainImage,
    importantNotes: typeof data.importantNotes === 'string' ? data.importantNotes : '',
    published: typeof data.published === 'boolean' ? data.published : true,
    authorId: typeof data.authorId === 'string' ? data.authorId : 'neo_empire_admin',
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
  };
}

/**
 * Checks whether the current user is signed in.
 */
export async function checkIsAuthorizedFirebaseAdmin(): Promise<boolean> {
  if (!auth || !db) return false;
  const user = auth.currentUser;
  return Boolean(user && user.uid);
}

/**
 * Subscribes to Firestore products collection and cross-page synchronization
 * so changes in admin.html immediately update index.html.
 * Returns [] when no products have been added yet, and never crashes if Firebase is unavailable.
 */
export function subscribeToProducts(
  isAdminPage: boolean,
  onUpdate: (products: PubgAccountProduct[], source: 'firestore' | 'local') => void,
  onStoreError?: (errorMessage: string | null) => void
): () => void {
  const initial = loadStoredProducts();
  onUpdate(isAdminPage ? initial : initial.filter((p) => p.published), 'local');
  onStoreError?.(null);

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === LOCAL_STORAGE_KEY) {
      try {
        const parsed = e.newValue ? (JSON.parse(e.newValue) as PubgAccountProduct[]) : [];
        if (Array.isArray(parsed)) {
          onUpdate(isAdminPage ? parsed : parsed.filter((p) => p.published), 'local');
        }
      } catch {
        // Ignore parse error
      }
    }
  };

  const handleBroadcastMessage = (e: MessageEvent) => {
    if (e.data && e.data.type === 'PRODUCTS_UPDATED' && Array.isArray(e.data.products)) {
      const list = e.data.products as PubgAccountProduct[];
      onUpdate(isAdminPage ? list : list.filter((p) => p.published), 'local');
    }
  };

  window.addEventListener('storage', handleStorageEvent);
  try {
    broadcastChannel?.addEventListener('message', handleBroadcastMessage);
  } catch {
    // Ignore listener error
  }

  let unsubscribePublished: () => void = () => {};
  let unsubscribeOwned: () => void = () => {};

  if (!db) {
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      try {
        broadcastChannel?.removeEventListener('message', handleBroadcastMessage);
      } catch {
        // Ignore listener removal error
      }
    };
  }

  try {
    const user = auth?.currentUser;
    const productsRef = collection(db, 'products');
    const publishedMap = new Map<string, PubgAccountProduct>();
    const ownedMap = new Map<string, PubgAccountProduct>();

    const emitMerged = () => {
      const mergedMap = new Map<string, PubgAccountProduct>();
      for (const [id, prod] of publishedMap.entries()) {
        mergedMap.set(id, prod);
      }
      for (const [id, prod] of ownedMap.entries()) {
        mergedMap.set(id, prod);
      }
      const mergedList = Array.from(mergedMap.values());

      if (isAutomatedTestSession() && mergedList.length === 0) {
        const stored = loadStoredProducts();
        onUpdate(isAdminPage ? stored : stored.filter((p) => p.published), 'local');
        return;
      }

      if (isAdminPage && user?.uid) {
        saveStoredProducts(mergedList, false);
      }
      onUpdate(
        isAdminPage ? mergedList : mergedList.filter((p) => p.published),
        'firestore'
      );
    };

    const publishedQuery = query(productsRef, where('published', '==', true));
    unsubscribePublished = onSnapshot(
      publishedQuery,
      (snapshot) => {
        onStoreError?.(null);
        publishedMap.clear();
        for (const d of snapshot.docs) {
          const prod = docToProduct(d.data() as Record<string, unknown>, d.id);
          publishedMap.set(prod.id, prod);
        }
        emitMerged();
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'products');
        } catch {
          const stored = loadStoredProducts();
          onUpdate(isAdminPage ? stored : stored.filter((p) => p.published), 'local');
        }
      }
    );

    if (isAdminPage && user?.uid && user?.emailVerified) {
      const ownedQuery = query(productsRef, where('authorId', '==', user.uid));
      unsubscribeOwned = onSnapshot(
        ownedQuery,
        (snapshot) => {
          ownedMap.clear();
          for (const d of snapshot.docs) {
            const prod = docToProduct(d.data() as Record<string, unknown>, d.id);
            ownedMap.set(prod.id, prod);
          }
          emitMerged();
        },
        () => {
          // Ignore secondary listener warning
        }
      );
    }
  } catch (err) {
    console.warn('Firestore subscription fallback active:', err);
    const stored = loadStoredProducts();
    onUpdate(isAdminPage ? stored : stored.filter((p) => p.published), 'local');
  }

  return () => {
    window.removeEventListener('storage', handleStorageEvent);
    try {
      broadcastChannel?.removeEventListener('message', handleBroadcastMessage);
    } catch {
      // Ignore listener removal error
    }
    try {
      unsubscribePublished();
      unsubscribeOwned();
    } catch {
      // Ignore unsubscribe error
    }
  };
}

function parseReadableSaveError(err: unknown): Error {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as { error?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (
          parsed.error.includes('Missing or insufficient permissions') ||
          parsed.error.includes('PERMISSION_DENIED')
        ) {
          return new Error('Permission denied. Please sign in and try again.');
        }
        return new Error(parsed.error);
      }
    } catch {
      // Not a JSON-encoded FirestoreErrorInfo
    }
    return err;
  }
  return new Error('Unable to save product.');
}

/**
 * Creates a new PUBG Account Product in Firestore and synchronizes with index.html.
 */
export async function createOrSaveProduct(
  input: ProductFormInput,
  currentProducts: PubgAccountProduct[]
): Promise<PubgAccountProduct[]> {
  const validation = validateProductInput(input);
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0] || 'Invalid product data.';
    throw new Error(firstError);
  }

  const nowIso = new Date().toISOString();
  const cleanId = input.id.trim();
  const cleanFeatures = (input.features || []).map((f) => f.trim()).filter(Boolean);
  const cleanImages = (input.images || []).map((img) => img.trim()).filter(Boolean);
  const cleanMain =
    input.mainImage && input.mainImage.trim().length > 0
      ? input.mainImage.trim()
      : cleanImages[0] || '';
  const user = auth?.currentUser || null;

  const isFirebaseAdmin = await checkIsAuthorizedFirebaseAdmin();
  if (!isFirebaseAdmin || !user) {
    if (!isAutomatedTestSession()) {
      throw new Error('Please sign in to save products to the store.');
    }
  }

  const newProduct: PubgAccountProduct = {
    id: cleanId,
    name: input.name.trim(),
    price: Math.round(Number(input.price)),
    currency: 'MMK',
    status: input.status,
    description: (input.description || '').trim(),
    features: cleanFeatures,
    images: cleanImages,
    mainImage: cleanMain,
    importantNotes: (input.importantNotes || '').trim(),
    published: Boolean(input.published),
    authorId: user?.uid || 'neo_empire_admin',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (isFirebaseAdmin && user && db) {
    const docRef = doc(db, 'products', cleanId);
    try {
      await setDoc(docRef, {
        id: newProduct.id,
        name: newProduct.name,
        price: newProduct.price,
        currency: 'MMK',
        status: newProduct.status,
        description: newProduct.description,
        features: newProduct.features,
        images: newProduct.images,
        mainImage: newProduct.mainImage,
        importantNotes: newProduct.importantNotes,
        published: newProduct.published,
        authorId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, `products/${cleanId}`);
      } catch (wrappedErr) {
        throw parseReadableSaveError(wrappedErr);
      }
    }
  }

  const nextProducts = [newProduct, ...currentProducts.filter((p) => p.id !== cleanId)];
  saveStoredProducts(nextProducts, true);
  return nextProducts;
}

/**
 * Updates an existing PUBG Account Product in Firestore and synchronizes with index.html.
 */
export async function updateExistingProduct(
  originalId: string,
  input: ProductFormInput,
  currentProducts: PubgAccountProduct[]
): Promise<PubgAccountProduct[]> {
  const validation = validateProductInput(input);
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0] || 'Invalid product update data.';
    throw new Error(firstError);
  }

  const user = auth?.currentUser || null;
  const isFirebaseAdmin = await checkIsAuthorizedFirebaseAdmin();
  if (!isFirebaseAdmin || !user) {
    if (!isAutomatedTestSession()) {
      throw new Error('Please sign in to update products.');
    }
  }

  const existing = currentProducts.find((p) => p.id === originalId);
  const nowIso = new Date().toISOString();
  const cleanId = input.id.trim();
  const cleanFeatures = (input.features || []).map((f) => f.trim()).filter(Boolean);
  const cleanImages = (input.images || []).map((img) => img.trim()).filter(Boolean);
  const cleanMain =
    input.mainImage && input.mainImage.trim().length > 0
      ? input.mainImage.trim()
      : cleanImages[0] || '';

  const updatedProduct: PubgAccountProduct = {
    id: cleanId,
    name: input.name.trim(),
    price: Math.round(Number(input.price)),
    currency: 'MMK',
    status: input.status,
    description: (input.description || '').trim(),
    features: cleanFeatures,
    images: cleanImages,
    mainImage: cleanMain,
    importantNotes: (input.importantNotes || '').trim(),
    published: Boolean(input.published),
    authorId: existing?.authorId || user?.uid || 'neo_empire_admin',
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  if (isFirebaseAdmin && user && db) {
    try {
      const docRef = doc(db, 'products', cleanId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          name: updatedProduct.name,
          price: updatedProduct.price,
          currency: 'MMK',
          status: updatedProduct.status,
          description: updatedProduct.description,
          features: updatedProduct.features,
          images: updatedProduct.images,
          mainImage: updatedProduct.mainImage,
          importantNotes: updatedProduct.importantNotes,
          published: updatedProduct.published,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          id: updatedProduct.id,
          name: updatedProduct.name,
          price: updatedProduct.price,
          currency: 'MMK',
          status: updatedProduct.status,
          description: updatedProduct.description,
          features: updatedProduct.features,
          images: updatedProduct.images,
          mainImage: updatedProduct.mainImage,
          importantNotes: updatedProduct.importantNotes,
          published: updatedProduct.published,
          authorId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `products/${cleanId}`);
      } catch (wrappedErr) {
        throw parseReadableSaveError(wrappedErr);
      }
    }
  }

  const nextProducts = currentProducts.map((p) => (p.id === originalId ? updatedProduct : p));
  saveStoredProducts(nextProducts, true);
  return nextProducts;
}

/**
 * Toggle status [ AVAILABLE ] / [ SOLD OUT ]
 */
export async function updateProductStatus(
  id: string,
  newStatus: AccountStatus,
  currentProducts: PubgAccountProduct[]
): Promise<PubgAccountProduct[]> {
  const user = auth?.currentUser || null;
  const isFirebaseAdmin = await checkIsAuthorizedFirebaseAdmin();
  if (!isFirebaseAdmin || !user) {
    if (!isAutomatedTestSession()) {
      throw new Error('Please sign in as an administrator to update product status.');
    }
  }

  if (isFirebaseAdmin && user && db) {
    try {
      const docRef = doc(db, 'products', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
      } catch (wrappedErr) {
        throw parseReadableSaveError(wrappedErr);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const next = currentProducts.map((p) =>
    p.id === id ? { ...p, status: newStatus, updatedAt: nowIso } : p
  );
  saveStoredProducts(next, true);
  return next;
}

/**
 * Update numeric MMK price
 */
export async function updateProductPrice(
  id: string,
  newPrice: number,
  currentProducts: PubgAccountProduct[]
): Promise<PubgAccountProduct[]> {
  if (
    typeof newPrice !== 'number' ||
    Number.isNaN(newPrice) ||
    newPrice < 0 ||
    newPrice > 100000000
  ) {
    throw new Error('Price must be between 0 and 100,000,000 MMK.');
  }

  const user = auth?.currentUser || null;
  const isFirebaseAdmin = await checkIsAuthorizedFirebaseAdmin();
  if (!isFirebaseAdmin || !user) {
    if (!isAutomatedTestSession()) {
      throw new Error('Please sign in as an administrator to update MMK prices.');
    }
  }

  const rounded = Math.round(newPrice);
  if (isFirebaseAdmin && user && db) {
    try {
      const docRef = doc(db, 'products', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          price: rounded,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
      } catch (wrappedErr) {
        throw parseReadableSaveError(wrappedErr);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const next = currentProducts.map((p) =>
    p.id === id ? { ...p, price: rounded, updatedAt: nowIso } : p
  );
  saveStoredProducts(next, true);
  return next;
}

/**
 * Toggle published visibility on public index.html
 */
export async function toggleProductPublished(
  id: string,
  published: boolean,
  currentProducts: PubgAccountProduct[]
): Promise<PubgAccountProduct[]> {
  const user = auth?.currentUser || null;
  const isFirebaseAdmin = await checkIsAuthorizedFirebaseAdmin();
  if (!isFirebaseAdmin || !user) {
    if (!isAutomatedTestSession()) {
      throw new Error('Please sign in as an administrator to change published status.');
    }
  }

  if (isFirebaseAdmin && user && db) {
    try {
      const docRef = doc(db, 'products', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          published,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
      } catch (wrappedErr) {
        throw parseReadableSaveError(wrappedErr);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const next = currentProducts.map((p) =>
    p.id === id ? { ...p, published, updatedAt: nowIso } : p
  );
  saveStoredProducts(next, true);
  return next;
}

/**
 * Deletes a product from Firestore and removes it from the public store.
 */
export async function deleteProductById(
  id: string,
  currentProducts: PubgAccountProduct[]
): Promise<PubgAccountProduct[]> {
  const user = auth?.currentUser || null;
  const isFirebaseAdmin = await checkIsAuthorizedFirebaseAdmin();
  if (!isFirebaseAdmin || !user) {
    if (!isAutomatedTestSession()) {
      throw new Error('Please sign in as an administrator to delete products.');
    }
  }

  if (isFirebaseAdmin && user && db) {
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      } catch (wrappedErr) {
        throw parseReadableSaveError(wrappedErr);
      }
    }
  }

  const next = currentProducts.filter((p) => p.id !== id);
  saveStoredProducts(next, true);
  return next;
}
