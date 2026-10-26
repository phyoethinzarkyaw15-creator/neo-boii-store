import React, { useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Upload,
  Eye,
  EyeOff,
  LogOut,
  Check,
  AlertCircle,
  RefreshCw,
  Star,
} from 'lucide-react';
import {
  AccountStatus,
  AdminDashboardMetrics,
  ProductFormInput,
  PubgAccountProduct,
  TELEGRAM_BUY_URL,
  TELEGRAM_HANDLE,
} from '../types/store';
import {
  computeDashboardMetrics,
  formatMmkPrice,
  validateProductInput,
} from '../utils/storeLogic';
import { ImageUploadProgress, uploadAccountImage } from '../services/imageService';
import { ProductCard3D } from './ProductCard3D';

export type AdminTab =
  | 'dashboard'
  | 'products'
  | 'add-product'
  | 'edit-product'
  | 'image-upload'
  | 'settings';

export type AdminUiState =
  | 'LOADING_PRODUCTS'
  | 'READY'
  | 'ERROR';

interface AdminPanelProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  products: PubgAccountProduct[];
  adminState?: AdminUiState;
  productLoadError?: string | null;
  onCreateProduct: (input: ProductFormInput) => Promise<void>;
  onUpdateProduct: (originalId: string, input: ProductFormInput) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onStatusChange: (productId: string, status: AccountStatus) => Promise<void>;
  onPriceChange: (productId: string, price: number) => Promise<void>;
  onTogglePublished: (productId: string, published: boolean) => Promise<void>;
  onInspectProduct: (product: PubgAccountProduct) => void;
}

const createEmptyFormState = (nextIndex: number): ProductFormInput => {
  const nextNum = String(nextIndex).padStart(3, '0');
  return {
    id: `NEO-${nextNum}`,
    name: '',
    price: 150000,
    status: AccountStatus.AVAILABLE,
    description: '',
    features: [],
    images: [],
    mainImage: '',
    importantNotes: '',
    published: true,
  };
};

export const AdminPanel: React.FC<AdminPanelProps> = ({
  activeTab,
  onSelectTab,
  products,
  adminState = 'READY',
  productLoadError = null,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onStatusChange,
  onPriceChange,
  onTogglePublished,
  onInspectProduct,
}) => {
  // Form State for Add / Edit Account
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ProductFormInput>(() =>
    createEmptyFormState(products.length + 1)
  );
  const [featuresText, setFeaturesText] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline Price Editing & Delete Confirmation State
  const [inlinePrices, setInlinePrices] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Image Upload State
  const [uploadProgressList, setUploadProgressList] = useState<ImageUploadProgress[]>([]);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const mainImageInputRef = useRef<HTMLInputElement | null>(null);
  const additionalImagesInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const metrics: AdminDashboardMetrics = computeDashboardMetrics(products);

  const startAddAccount = () => {
    const freshForm = createEmptyFormState(products.length + 1);
    setEditingOriginalId(null);
    setFormState(freshForm);
    setFeaturesText('');
    setFormErrors({});
    setActionBanner(null);
    onSelectTab('add-product');
  };

  const startEditProduct = (product: PubgAccountProduct) => {
    const editForm: ProductFormInput = {
      id: product.id,
      name: product.name,
      price: product.price,
      status: product.status,
      description: product.description,
      features: [...product.features],
      images: [...product.images],
      mainImage: product.mainImage || product.images[0] || '',
      importantNotes: product.importantNotes,
      published: product.published,
    };
    setEditingOriginalId(product.id);
    setFormState(editForm);
    setFeaturesText(product.features.join('\n'));
    setFormErrors({});
    setActionBanner(null);
    onSelectTab('edit-product');
  };

  const handleFilesUpload = async (
    files: FileList | null,
    replaceIdx: number | null = null,
    setAsMain = false
  ) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    if (replaceIdx === null && formState.images.length + fileArray.length > 8) {
      setFormErrors((prev) => ({
        ...prev,
        images: 'Maximum 8 images allowed per account.',
      }));
      return;
    }

    const uploadedUrls: string[] = [];
    for (const file of fileArray) {
      try {
        const url = await uploadAccountImage(file, formState.id, (prog) => {
          setUploadProgressList((prev) => {
            const others = prev.filter((item) => item.fileName !== prog.fileName);
            return [...others, prog];
          });
        });
        uploadedUrls.push(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to upload image.';
        setFormErrors((prev) => ({
          ...prev,
          images: msg,
        }));
        setActionBanner({
          type: 'error',
          message: msg,
        });
      }
    }

    if (uploadedUrls.length > 0) {
      setFormState((prev) => {
        if (replaceIdx !== null && replaceIdx >= 0 && replaceIdx < prev.images.length) {
          const nextImages = [...prev.images];
          const oldUrl = nextImages[replaceIdx];
          nextImages[replaceIdx] = uploadedUrls[0];
          const nextMain = prev.mainImage === oldUrl ? uploadedUrls[0] : prev.mainImage;
          return { ...prev, images: nextImages, mainImage: nextMain || nextImages[0] };
        }
        if (setAsMain) {
          const primary = uploadedUrls[0];
          const restNew = uploadedUrls.slice(1);
          const merged = [primary, ...prev.images.filter((u) => u !== primary), ...restNew].slice(
            0,
            8
          );
          return {
            ...prev,
            images: merged,
            mainImage: primary,
          };
        }
        const merged = [...prev.images, ...uploadedUrls].slice(0, 8);
        return {
          ...prev,
          images: merged,
          mainImage: prev.mainImage || merged[0],
        };
      });
      setFormErrors((prev) => {
        const copy = { ...prev };
        delete copy.images;
        return copy;
      });
    }

    setReplacingIndex(null);
    setTimeout(() => setUploadProgressList([]), 2000);
  };

  const handleRemoveImage = (index: number) => {
    setFormState((prev) => {
      const removedUrl = prev.images[index];
      const nextImages = prev.images.filter((_, i) => i !== index);
      const nextMain = prev.mainImage === removedUrl ? nextImages[0] || '' : prev.mainImage;
      return {
        ...prev,
        images: nextImages,
        mainImage: nextMain,
      };
    });
  };

  const handleSetMainImage = (imgUrl: string) => {
    setFormState((prev) => {
      const rest = prev.images.filter((u) => u !== imgUrl);
      return {
        ...prev,
        images: [imgUrl, ...rest],
        mainImage: imgUrl,
      };
    });
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBanner(null);

    const parsedFeatures = featuresText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const candidate: ProductFormInput = {
      ...formState,
      id: formState.id.trim(),
      name: formState.name.trim(),
      description: formState.description.trim(),
      importantNotes: formState.importantNotes.trim(),
      features: parsedFeatures,
      mainImage: formState.mainImage || formState.images[0] || '',
    };

    const validation = validateProductInput(candidate);
    if (!validation.valid) {
      setFormErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      if (firstError) {
        setActionBanner({
          type: 'error',
          message: firstError,
        });
      }
      return;
    }

    setIsSubmitting(true);
    setFormErrors({});
    try {
      if (editingOriginalId) {
        await onUpdateProduct(editingOriginalId, candidate);
        setActionBanner({
          type: 'success',
          message: `Account ${candidate.id} (${formatMmkPrice(candidate.price)}) saved.`,
        });
      } else {
        await onCreateProduct(candidate);
        setActionBanner({
          type: 'success',
          message: `Account ${candidate.id} (${formatMmkPrice(candidate.price)}) saved and published to the Store.`,
        });
      }
      onSelectTab('products');
    } catch (err) {
      setActionBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to save account.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInlinePriceCommit = async (product: PubgAccountProduct) => {
    const rawVal = inlinePrices[product.id];
    if (rawVal === undefined) return;
    const parsed = Number(rawVal);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100000000) {
      setActionBanner({
        type: 'error',
        message: 'Price must be between 0 and 100,000,000 MMK.',
      });
      return;
    }
    const rounded = Math.round(parsed);
    try {
      await onPriceChange(product.id, rounded);
      setActionBanner({
        type: 'success',
        message: `Updated price for ${product.id} to ${formatMmkPrice(rounded)}.`,
      });
    } catch (err) {
      setActionBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to update price.',
      });
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/index.html';
    }
  };

  const previewProduct: PubgAccountProduct = {
    ...formState,
    name: formState.name || 'Account Name',
    currency: 'MMK',
    features: featuresText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    mainImage: formState.mainImage || formState.images[0] || '',
    authorId: 'neo_empire_admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const renderProductManagementList = () => (
    <div className="rounded-xl neo-surface-card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-[#F4F2ED]">
            Product Management ({products.length})
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage account availability, Myanmar Kyat (MMK) price, and store publication status.
          </p>
        </div>
        <button
          type="button"
          onClick={startAddAccount}
          className="gold-metallic-button min-h-[42px] px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Add PUBG Account</span>
        </button>
      </div>

      {products.length === 0 ? (
        <div className="py-12 px-5 text-center space-y-4">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#C5A059]">
            STORE INVENTORY
          </div>
          <h3 className="font-display text-xl font-bold tracking-[0.14em] uppercase text-[#F4F2ED]">
            NOT AVAILABLE
          </h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            No accounts have been added yet. Tap Add PUBG Account to create your first PUBG account
            listing.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={startAddAccount}
              className="gold-metallic-button min-h-[48px] px-5 py-3 rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add PUBG Account</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.07]">
          {products.map((item) => {
            const currentPriceVal =
              inlinePrices[item.id] !== undefined ? inlinePrices[item.id] : String(item.price);
            const thumb = (item.mainImage || item.images[0] || '').trim();

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors"
              >
                {/* Product Summary */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={item.name}
                      width={80}
                      height={60}
                      referrerPolicy="no-referrer"
                      className="w-20 h-15 rounded-lg object-cover border border-[#C5A059]/30 shrink-0"
                      style={{
                        width: '80px',
                        height: '60px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                      }}
                    />
                  ) : (
                    <div
                      className="w-20 h-15 rounded-lg neo-frame-3d flex items-center justify-center text-[10px] font-mono text-[#C5A059] shrink-0 text-center px-1"
                      style={{ width: '80px', height: '60px' }}
                    >
                      NOT AVAILABLE
                    </div>
                  )}

                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono">
                      <span className="text-[#E5C878] font-semibold">{item.id}</span>
                      <span aria-hidden="true" className="text-zinc-600">
                        ·
                      </span>
                      <span className="text-[#F4F2ED] font-bold tabular-nums">
                        {formatMmkPrice(item.price)}
                      </span>
                      <span aria-hidden="true" className="text-zinc-600">
                        ·
                      </span>
                      <span
                        className={
                          item.status === AccountStatus.AVAILABLE
                            ? 'text-emerald-400 font-semibold'
                            : 'text-zinc-400'
                        }
                      >
                        {item.status}
                      </span>
                      <span aria-hidden="true" className="text-zinc-600">
                        ·
                      </span>
                      <span className={item.published ? 'text-[#E5C878]' : 'text-zinc-500'}>
                        {item.published ? 'Published' : 'Unpublished'}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#F4F2ED] break-words">
                      {item.name}
                    </h3>
                  </div>
                </div>

                {/* Mobile-Friendly Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Status Toggle: AVAILABLE / SOLD OUT */}
                  <div
                    role="group"
                    aria-label={`Status control for ${item.id}`}
                    className="flex items-center p-1 rounded-lg bg-[#090A0D] border border-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => onStatusChange(item.id, AccountStatus.AVAILABLE)}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded text-xs font-mono font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        item.status === AccountStatus.AVAILABLE
                          ? 'bg-[#C5A059] text-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      AVAILABLE
                    </button>
                    <button
                      type="button"
                      onClick={() => onStatusChange(item.id, AccountStatus.SOLD_OUT)}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded text-xs font-mono font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        item.status === AccountStatus.SOLD_OUT
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      SOLD OUT
                    </button>
                  </div>

                  {/* Inline MMK Price Editor */}
                  <div className="flex items-center gap-1.5 bg-[#090A0D] border border-white/10 rounded-lg px-2.5 py-1 min-h-[44px]">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100000000}
                      step={1000}
                      aria-label={`Price in MMK for ${item.id}`}
                      value={currentPriceVal}
                      onChange={(e) =>
                        setInlinePrices((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleInlinePriceCommit(item);
                        }
                      }}
                      className="w-24 bg-transparent font-mono text-xs font-bold text-[#F4F2ED] focus:outline-none tabular-nums"
                    />
                    <span className="text-[11px] font-mono text-[#C5A059]">MMK</span>
                    <button
                      type="button"
                      onClick={() => handleInlinePriceCommit(item)}
                      aria-label={`Save MMK price for ${item.id}`}
                      className="p-2 rounded bg-[#C5A059]/20 hover:bg-[#C5A059] text-[#E5C878] hover:text-black transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* PUBLISH / UNPUBLISH */}
                  <button
                    type="button"
                    onClick={() => onTogglePublished(item.id, !item.published)}
                    aria-label={item.published ? `Unpublish ${item.id}` : `Publish ${item.id}`}
                    className="min-h-[44px] px-3 py-2 rounded-lg bg-[#14161D] hover:bg-[#1C1F29] border border-white/10 text-xs font-mono font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {item.published ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                        <span>UNPUBLISH</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>PUBLISH</span>
                      </>
                    )}
                  </button>

                  {/* EDIT */}
                  <button
                    type="button"
                    onClick={() => startEditProduct(item)}
                    aria-label={`Edit ${item.id}`}
                    className="min-h-[44px] px-3 py-2 rounded-lg bg-[#C5A059]/15 hover:bg-[#C5A059]/25 border border-[#C5A059]/35 text-xs font-mono font-bold text-[#E5C878] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>EDIT</span>
                  </button>

                  {/* DELETE */}
                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteProduct(item.id);
                          setConfirmDeleteId(null);
                          setActionBanner({
                            type: 'success',
                            message: `Deleted account ${item.id}.`,
                          });
                        }}
                        className="min-h-[44px] px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[44px] px-2.5 py-2 rounded-lg bg-zinc-800 text-xs text-zinc-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      aria-label={`Delete ${item.id}`}
                      className="min-h-[44px] px-3 py-2 rounded-lg bg-[#14161D] hover:bg-red-950/60 border border-white/10 hover:border-red-500/40 text-xs font-mono font-bold text-zinc-300 hover:text-red-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>DELETE</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <section
      id="admin-dashboard"
      data-testid="admin-dashboard"
      style={{ display: 'block' }}
      className="max-w-[1240px] mx-auto px-3.5 sm:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8"
    >
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs font-mono uppercase tracking-[0.18em] text-[#C5A059] truncate">
            NEO EMPIRE · PRODUCT MANAGEMENT
          </div>
          <h1 className="font-display text-xl sm:text-3xl font-bold text-[#F4F2ED] mt-0.5 truncate">
            {activeTab === 'dashboard' && 'Admin Dashboard'}
            {activeTab === 'products' && 'Product Management'}
            {activeTab === 'add-product' && 'Add PUBG Account'}
            {activeTab === 'edit-product' &&
              (editingOriginalId ? `Edit Account (${editingOriginalId})` : 'Edit Account')}
            {activeTab === 'image-upload' && 'Account Image Upload'}
            {activeTab === 'settings' && 'Store Settings'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={startAddAccount}
            className="gold-metallic-button min-h-[46px] px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add PUBG Account</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="neo-dark-button min-h-[46px] px-3.5 py-2.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>LOGOUT</span>
          </button>
        </div>
      </div>

      {/* Firestore Product Load Error Banner */}
      {productLoadError && (
        <div
          role="alert"
          data-testid="admin-product-load-error"
          className="p-4 rounded-lg border bg-amber-950/40 border-amber-500/40 text-amber-200 flex items-center gap-3 text-xs sm:text-sm"
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="break-words">{productLoadError}</span>
        </div>
      )}

      {/* Loading Products Indicator */}
      {adminState === 'LOADING_PRODUCTS' && (
        <div
          role="status"
          className="p-4 rounded-lg border border-white/10 bg-[#101116] text-xs font-mono text-[#E5C878] flex items-center gap-2.5"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>Loading store products...</span>
        </div>
      )}

      {/* Status Notification Banner */}
      {actionBanner && (
        <div
          role="status"
          className={`p-4 rounded-lg border flex items-center justify-between gap-3 text-xs sm:text-sm ${
            actionBanner.type === 'success'
              ? 'bg-[#111512] border-[#C5A059]/40 text-[#E5C878]'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}
        >
          <span className="break-words">{actionBanner.message}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="min-h-[36px] px-2 text-xs underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: DASHBOARD (Includes KPI Summary + Product Management List) */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 sm:space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 sm:p-5 rounded-xl neo-surface-card">
              <div className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-zinc-400">
                Total Accounts
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-bold text-[#F4F2ED] tabular-nums mt-1.5">
                {metrics.totalAccounts}
              </div>
              <div className="text-[11px] sm:text-xs text-zinc-500 mt-1 truncate">
                {formatMmkPrice(metrics.totalValueMmk)} total value
              </div>
            </div>

            <div className="p-4 sm:p-5 rounded-xl neo-surface-card">
              <div className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-[#C5A059]">
                Available
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-bold text-[#F4F2ED] tabular-nums mt-1.5">
                {metrics.availableAccounts}
              </div>
              <div className="text-[11px] sm:text-xs text-zinc-500 mt-1">Active for purchase</div>
            </div>

            <div className="p-4 sm:p-5 rounded-xl neo-surface-card">
              <div className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-zinc-400">
                Sold Out
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-bold text-zinc-300 tabular-nums mt-1.5">
                {metrics.soldOutAccounts}
              </div>
              <div className="text-[11px] sm:text-xs text-zinc-500 mt-1">Marked sold out</div>
            </div>

            <div className="p-4 sm:p-5 rounded-xl neo-surface-card">
              <div className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-zinc-400">
                Published
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-bold text-[#E5C878] tabular-nums mt-1.5">
                {metrics.publishedAccounts}
              </div>
              <div className="text-[11px] sm:text-xs text-zinc-500 mt-1">
                {metrics.unpublishedAccounts} unpublished
              </div>
            </div>
          </div>

          {renderProductManagementList()}
        </div>
      )}

      {/* TAB 2: PRODUCTS LIST & MANAGEMENT */}
      {activeTab === 'products' && <div className="space-y-6">{renderProductManagementList()}</div>}

      {/* TAB 3 & 4: ADD ACCOUNT / EDIT ACCOUNT (MOBILE-FIRST FORM) */}
      {(activeTab === 'add-product' || activeTab === 'edit-product' || activeTab === 'image-upload') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          <form
            onSubmit={handleSubmitForm}
            className="lg:col-span-7 p-4 sm:p-6 rounded-xl neo-surface-card space-y-5"
          >
            {/* Account Name */}
            <div>
              <label
                htmlFor="field-name"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Account Name *
              </label>
              <input
                id="field-name"
                type="text"
                value={formState.name}
                onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="PUBG Account #001"
                className="w-full min-h-[48px] px-3.5 py-3 rounded-lg bg-[#090A0D] border border-white/15 text-base sm:text-sm text-[#F4F2ED] focus:outline-none focus:border-[#C5A059]"
              />
              {formErrors.name && (
                <p className="text-xs text-amber-400 mt-1.5">{formErrors.name}</p>
              )}
            </div>

            {/* MMK Price & Product ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="field-price"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  MMK Price * ({formatMmkPrice(formState.price || 0)})
                </label>
                <input
                  id="field-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100000000}
                  step={1000}
                  value={formState.price}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, price: Number(e.target.value) }))
                  }
                  placeholder="150000"
                  className="w-full min-h-[48px] px-3.5 py-3 rounded-lg bg-[#090A0D] border border-white/15 font-mono text-base sm:text-sm text-[#F4F2ED] focus:outline-none focus:border-[#C5A059]"
                />
                {formErrors.price && (
                  <p className="text-xs text-amber-400 mt-1.5">{formErrors.price}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="field-product-id"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Product ID *
                </label>
                <input
                  id="field-product-id"
                  type="text"
                  value={formState.id}
                  onChange={(e) => setFormState((prev) => ({ ...prev, id: e.target.value }))}
                  placeholder="NEO-001"
                  className="w-full min-h-[48px] px-3.5 py-3 rounded-lg bg-[#090A0D] border border-white/15 font-mono text-base sm:text-sm text-[#F4F2ED] focus:outline-none focus:border-[#C5A059]"
                />
                {formErrors.id && (
                  <p className="text-xs text-amber-400 mt-1.5">{formErrors.id}</p>
                )}
              </div>
            </div>

            {/* Availability & Published Status Touch Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Availability *
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#090A0D] border border-white/15">
                  <button
                    type="button"
                    onClick={() =>
                      setFormState((prev) => ({ ...prev, status: AccountStatus.AVAILABLE }))
                    }
                    className={`min-h-[44px] py-2 rounded-md text-xs font-mono font-bold cursor-pointer transition-colors ${
                      formState.status === AccountStatus.AVAILABLE
                        ? 'bg-[#C5A059] text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    AVAILABLE
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormState((prev) => ({ ...prev, status: AccountStatus.SOLD_OUT }))
                    }
                    className={`min-h-[44px] py-2 rounded-md text-xs font-mono font-bold cursor-pointer transition-colors ${
                      formState.status === AccountStatus.SOLD_OUT
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    SOLD OUT
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Publication Status *
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#090A0D] border border-white/15">
                  <button
                    type="button"
                    onClick={() => setFormState((prev) => ({ ...prev, published: true }))}
                    className={`min-h-[44px] py-2 rounded-md text-xs font-mono font-bold cursor-pointer transition-colors ${
                      formState.published
                        ? 'bg-[#C5A059] text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    PUBLISH
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormState((prev) => ({ ...prev, published: false }))}
                    className={`min-h-[44px] py-2 rounded-md text-xs font-mono font-bold cursor-pointer transition-colors ${
                      !formState.published
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    UNPUBLISH
                  </button>
                </div>
              </div>
            </div>

            {/* Account Image Upload & Additional Images */}
            <div className="p-4 rounded-lg bg-[#090A0D] border border-white/15 space-y-3.5">
              <div className="space-y-1">
                <div className="text-xs font-mono uppercase tracking-wider text-[#C5A059]">
                  Account Image Upload ({formState.images.length}/8)
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Select account images from your device (JPG, PNG, WEBP).
                </p>
              </div>

              <input
                ref={mainImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFilesUpload(e.target.files, null, true)}
                className="hidden"
              />
              <input
                ref={additionalImagesInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFilesUpload(e.target.files, null, false)}
                className="hidden"
              />
              <input
                ref={replaceFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFilesUpload(e.target.files, replacingIndex, false)}
                className="hidden"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => mainImageInputRef.current?.click()}
                  className="min-h-[46px] px-4 py-2.5 rounded-lg gold-metallic-button text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>Account Image Upload</span>
                </button>

                <button
                  type="button"
                  onClick={() => additionalImagesInputRef.current?.click()}
                  className="neo-dark-button min-h-[46px] px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Additional Images</span>
                </button>
              </div>

              {uploadProgressList.length > 0 && (
                <div className="space-y-1.5">
                  {uploadProgressList.map((prog) => (
                    <div
                      key={prog.fileName}
                      className="text-xs font-mono flex items-center justify-between bg-black/60 px-3 py-2 rounded border border-white/10"
                    >
                      <span className="text-zinc-300 truncate">{prog.fileName}</span>
                      <span className="text-[#C5A059]">{prog.progress}%</span>
                    </div>
                  ))}
                </div>
              )}

              {formState.images.length === 0 ? (
                <div className="py-6 text-center rounded-lg neo-frame-3d">
                  <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-[#C5A059]">
                    NOT AVAILABLE
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">No account image selected yet</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  {formState.images.map((imgUrl, idx) => {
                    const isMain =
                      (formState.mainImage && formState.mainImage === imgUrl) ||
                      (!formState.mainImage && idx === 0);

                    return (
                      <div
                        key={idx}
                        className={`relative rounded-lg overflow-hidden border bg-[#08080A] aspect-[4/3] ${
                          isMain ? 'border-[#C5A059]' : 'border-white/10'
                        }`}
                      >
                        <img
                          src={imgUrl}
                          alt={`Account image ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-[#E5C878]">
                          {isMain ? 'MAIN' : `#${idx + 1}`}
                        </div>
                        <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
                          {!isMain && (
                            <button
                              type="button"
                              onClick={() => handleSetMainImage(imgUrl)}
                              className="px-2 py-1 rounded bg-[#C5A059] text-[10px] font-mono font-bold text-black flex items-center gap-0.5 cursor-pointer"
                            >
                              <Star className="w-2.5 h-2.5" />
                              <span>Main</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setReplacingIndex(idx);
                              replaceFileInputRef.current?.click();
                            }}
                            className="px-2 py-1 rounded bg-black/85 hover:bg-[#C5A059] text-[10px] font-mono text-white hover:text-black flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>Replace</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            aria-label={`Remove image ${idx + 1}`}
                            className="p-1.5 rounded bg-red-950/90 hover:bg-red-600 text-red-200 hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {formErrors.images && (
                <p className="text-xs text-amber-400">{formErrors.images}</p>
              )}
            </div>

            {/* Optional Description */}
            <div>
              <label
                htmlFor="field-description"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Description (Optional)
              </label>
              <textarea
                id="field-description"
                rows={3}
                value={formState.description}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Enter account details..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#090A0D] border border-white/15 text-base sm:text-sm text-[#F4F2ED] focus:outline-none focus:border-[#C5A059]"
              />
              {formErrors.description && (
                <p className="text-xs text-amber-400 mt-1.5">{formErrors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="field-features"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Account Highlights (Optional, one per line)
                </label>
                <textarea
                  id="field-features"
                  rows={3}
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  placeholder="Optional highlights, one per line"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090A0D] border border-white/15 text-xs font-mono text-[#F4F2ED] focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label
                  htmlFor="field-notes"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Important Notes (Optional)
                </label>
                <textarea
                  id="field-notes"
                  rows={3}
                  value={formState.importantNotes}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, importantNotes: e.target.value }))
                  }
                  placeholder="Optional handover or purchase notes"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090A0D] border border-white/15 text-xs text-[#F4F2ED] focus:outline-none focus:border-[#C5A059]"
                />
              </div>
            </div>

            {Object.keys(formErrors).length > 0 && (
              <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>Please check the highlighted fields above before saving.</span>
              </div>
            )}

            <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onSelectTab('products')}
                className="neo-dark-button min-h-[48px] px-5 py-3 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="gold-metallic-button min-h-[48px] px-6 py-3 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider cursor-pointer"
              >
                {isSubmitting ? 'SAVING...' : 'SAVE'}
              </button>
            </div>
          </form>

          {/* Right 5 Cols: Live Store Card Preview */}
          <div className="lg:col-span-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-[#C5A059]">
              Store Card Preview
            </div>
            <ProductCard3D
              product={previewProduct}
              onViewDetails={(prod) => onInspectProduct(prod)}
            />
          </div>
        </div>
      )}

      {/* TAB 6: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="rounded-xl neo-surface-card p-5 sm:p-6 space-y-6 max-w-2xl">
          <div>
            <h2 className="font-display text-lg font-bold text-[#F4F2ED]">Store Settings</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Storefront currency and direct purchase channel.
            </p>
          </div>

          <div className="divide-y divide-white/[0.08] text-xs sm:text-sm">
            <div className="py-3.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-zinc-400">Store Name</span>
              <span className="font-display font-semibold text-[#F4F2ED]">Neo Empire</span>
            </div>
            <div className="py-3.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-zinc-400">Default Currency</span>
              <span className="font-mono text-[#E5C878]">MMK (Myanmar Kyat)</span>
            </div>
            <div className="py-3.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-zinc-400">Direct Purchase Contact</span>
              <a
                href={TELEGRAM_BUY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[#E5C878] hover:underline break-all"
              >
                {TELEGRAM_HANDLE} ({TELEGRAM_BUY_URL})
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
