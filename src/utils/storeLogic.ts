import {
  AccountStatus,
  AdminDashboardMetrics,
  ProductFormInput,
  PubgAccountProduct,
  StoreFilterState,
  ValidationResult,
} from '../types/store';

export const PRODUCT_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Formats a numeric price in Myanmar Kyat (MMK) with comma separators.
 * Example: 150000 -> "150,000 MMK"
 */
export function formatMmkPrice(price: number): string {
  const numeric = typeof price === 'number' && !Number.isNaN(price) ? Math.round(price) : 0;
  return `${numeric.toLocaleString('en-US')} MMK`;
}

/**
 * Validates product input strictly against firebase-blueprint.json & firestore.rules.
 * Never substitutes fake images or fallback values for invalid required fields.
 */
export function validateProductInput(input: ProductFormInput): ValidationResult {
  const errors: Record<string, string> = {};

  const trimmedId = (input.id ?? '').trim();
  if (trimmedId.length < 2 || trimmedId.length > 64) {
    errors.id = 'Product ID must be between 2 and 64 characters (e.g. NEO-001).';
  } else if (!PRODUCT_ID_REGEX.test(trimmedId)) {
    errors.id = 'Product ID may only contain letters, numbers, hyphens, and underscores.';
  }

  const trimmedName = (input.name ?? '').trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    errors.name = 'Account Name must be between 2 and 120 characters.';
  }

  if (
    typeof input.price !== 'number' ||
    Number.isNaN(input.price) ||
    input.price < 0 ||
    input.price > 100000000
  ) {
    errors.price = 'Price must be a valid amount between 0 and 100,000,000 MMK.';
  }

  if (input.status !== AccountStatus.AVAILABLE && input.status !== AccountStatus.SOLD_OUT) {
    errors.status = 'Status must be AVAILABLE or SOLD OUT.';
  }

  const trimmedDesc = (input.description ?? '').trim();
  if (trimmedDesc.length > 2000) {
    errors.description = 'Description must be 2,000 characters or fewer.';
  }

  const cleanFeatures = Array.isArray(input.features)
    ? input.features.map((f) => f.trim()).filter(Boolean)
    : [];
  if (cleanFeatures.length > 10) {
    errors.features = 'Maximum 10 features allowed per account.';
  } else if (cleanFeatures.some((f) => f.length < 1 || f.length > 120)) {
    errors.features = 'Each feature must be between 1 and 120 characters.';
  }

  if (!Array.isArray(input.images) || input.images.length > 8) {
    errors.images = 'Maximum 8 images allowed per account.';
  } else if (
    input.images.some(
      (img) => typeof img !== 'string' || img.trim().length < 1 || img.length > 500000
    )
  ) {
    errors.images = 'Each uploaded image must be valid and under 500 KB.';
  }

  const trimmedMain = (input.mainImage ?? '').trim();
  if (trimmedMain.length > 500000) {
    errors.mainImage = 'Main image size exceeds the 500 KB limit.';
  }

  const trimmedNotes = (input.importantNotes ?? '').trim();
  if (trimmedNotes.length > 1000) {
    errors.importantNotes = 'Notes must be 1,000 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates uploaded image metadata before compression / upload.
 */
export function validateImageFileMeta(
  fileName: string,
  mimeType: string,
  sizeBytes: number
): { valid: boolean; error?: string } {
  if (!fileName || fileName.trim().length === 0) {
    return { valid: false, error: 'Invalid file name.' };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return {
      valid: false,
      error: 'Unsupported image format. Allowed formats: JPG, JPEG, PNG, WEBP.',
    };
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_IMAGE_FILE_BYTES) {
    return {
      valid: false,
      error: 'Image file size exceeds the 8 MB maximum limit.',
    };
  }
  return { valid: true };
}

/**
 * Pure filtering and sorting for the Public Storefront (index.html) and Admin Catalog (admin.html).
 */
export function filterAndSortProducts(
  products: PubgAccountProduct[],
  filters: StoreFilterState
): PubgAccountProduct[] {
  const query = (filters.searchQuery ?? '').trim().toLowerCase();
  const onlyPublished = filters.onlyPublished ?? true;

  const filtered = products.filter((item) => {
    if (onlyPublished && !item.published) {
      return false;
    }

    if (filters.statusFilter !== 'ALL' && item.status !== filters.statusFilter) {
      return false;
    }

    if (query.length > 0) {
      const inId = item.id.toLowerCase().includes(query);
      const inName = item.name.toLowerCase().includes(query);
      const inDesc = item.description.toLowerCase().includes(query);
      const inFeatures = item.features.some((f) => f.toLowerCase().includes(query));
      return inId || inName || inDesc || inFeatures;
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    if (filters.sortBy === 'price-asc') {
      return a.price - b.price;
    }
    if (filters.sortBy === 'price-desc') {
      return b.price - a.price;
    }
    if (filters.sortBy === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    // Default 'featured': AVAILABLE accounts first, then by ID ascending
    if (a.status !== b.status) {
      return a.status === AccountStatus.AVAILABLE ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Computes Admin Dashboard KPI metrics from the current product list.
 */
export function computeDashboardMetrics(products: PubgAccountProduct[]): AdminDashboardMetrics {
  const totalAccounts = products.length;
  let availableAccounts = 0;
  let soldOutAccounts = 0;
  let publishedAccounts = 0;
  let unpublishedAccounts = 0;
  let totalValueMmk = 0;

  for (const p of products) {
    if (p.status === AccountStatus.AVAILABLE) {
      availableAccounts += 1;
      totalValueMmk += p.price;
    } else {
      soldOutAccounts += 1;
    }

    if (p.published) {
      publishedAccounts += 1;
    } else {
      unpublishedAccounts += 1;
    }
  }

  const recentProducts = [...products]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  return {
    totalAccounts,
    availableAccounts,
    soldOutAccounts,
    publishedAccounts,
    unpublishedAccounts,
    totalValueMmk,
    recentProducts,
  };
}
