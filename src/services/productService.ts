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
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { AccountStatus, ProductFormInput, PubgAccountProduct } from '../types/store';
import { validateProductInput } from '../utils/storeLogic';

const LOCAL_STORAGE_KEY = 'neo_empire_real_records_v1';
const LEGACY_KEYS = ['neo_empire_mmk_vault_v3', 'neo_empire_products_v2', 'neo_empire_products_v1'];
const SYNC_CHANNEL_NAME = 'neo_empire_real_sync_v1';
const ADMIN_AUTHOR_ID = 'neo_empire_admin';

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
    authorId: typeof data.authorId === 'string' ? data.authorId : ADMIN_AUTHOR_ID,
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
  };
}

/**
 * Subscribes directly to Firestore products collection and cross-page synchronization
 * so changes in admin.html immediately update index.html without requiring Google Login.
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
  let unsubscribeAll: () => void = () => {};

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
    const productsRef = collection(db, 'products');
    const publishedMap = new Map<string, PubgAccountProduct>();
    const allMap = new Map<string, PubgAccountProduct>();

    const emitMerged = () => {
      const mergedMap = new Map<string, PubgAccountProduct>();
      for (const [id, prod] of publishedMap.entries()) {
        mergedMap.set(id, prod);
      }
      for (const [id, prod] of allMap.entries()) {
        mergedMap.set(id, prod);
      }
      const firestoreList = Array.from(mergedMap.values());

      if (firestoreList.length === 0) {
        const stored = loadStoredProducts();
        if (stored.length > 0) {
          onUpdate(isAdminPage ? stored : stored.filter((p) => p.published), 'local');
          return;
        }
      }

      if (isAdminPage && firestoreList.length > 0) {
        saveStoredProducts(firestoreList, false);
      }
      onUpdate(
        isAdminPage ? firestoreList : firestoreList.filter((p) => p.published),
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

    if (isAdminPage) {
      unsubscribeAll = onSnapshot(
        productsRef,
        (snapshot) => {
          allMap.clear();
          for (const d of snapshot.docs) {
            const prod = docToProduct(d.data() as Record<string, unknown>, d.id);
            allMap.set(prod.id, prod);
          }
          emitMerged();
        },
        () => {
          // If unpublished list query is restricted, keep publishedMap + local stored products
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
      unsubscribeAll();
    } catch {
      // Ignore unsubscribe error
    }
  };
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
    authorId: ADMIN_AUTHOR_ID,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextProducts = [newProduct, ...currentProducts.filter((p) => p.id !== cleanId)];
  saveStoredProducts(nextProducts, true);

  if (db) {
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
        authorId: ADMIN_AUTHOR_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, `products/${cleanId}`);
      } catch {
        // Product is preserved in synchronized local store even if Firestore write fails
      }
    }
  }

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
    authorId: existing?.authorId || ADMIN_AUTHOR_ID,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const nextProducts = currentProducts.map((p) => (p.id === originalId ? updatedProduct : p));
  saveStoredProducts(nextProducts, true);

  if (db) {
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
          authorId: ADMIN_AUTHOR_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `products/${cleanId}`);
      } catch {
        // Keep updated product in synchronized store
      }
    }
  }

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
  const nowIso = new Date().toISOString();
  const next = currentProducts.map((p) =>
    p.id === id ? { ...p, status: newStatus, updatedAt: nowIso } : p
  );
  saveStoredProducts(next, true);

  if (db) {
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
      } catch {
        // Keep status change in synchronized store
      }
    }
  }

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

  const rounded = Math.round(newPrice);
  const nowIso = new Date().toISOString();
  const next = currentProducts.map((p) =>
    p.id === id ? { ...p, price: rounded, updatedAt: nowIso } : p
  );
  saveStoredProducts(next, true);

  if (db) {
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
      } catch {
        // Keep price change in synchronized store
      }
    }
  }

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
  const nowIso = new Date().toISOString();
  const next = currentProducts.map((p) =>
    p.id === id ? { ...p, published, updatedAt: nowIso } : p
  );
  saveStoredProducts(next, true);

  if (db) {
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
      } catch {
        // Keep published toggle in synchronized store
      }
    }
  }

  return next;
}

/**
 * Deletes a product from Firestore and removes it from the public store.
 */
export async function deleteProductById(
  id: string,
  currentProducts: PubgAccountProduct[]
): Promise<PubgAccountProduct[]> {
  const next = currentProducts.filter((p) => p.id !== id);
  saveStoredProducts(next, true);

  if (db) {
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      } catch {
        // Keep deleted state in synchronized store
      }
    }
  }

  return next;
}
