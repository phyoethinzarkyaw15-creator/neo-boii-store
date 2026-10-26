import React, { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import {
  AccountStatus,
  ProductFormInput,
  PubgAccountProduct,
} from './types/store';
import { NEO_EMPIRE_LOGO_SRC, handleLogoImageError } from './utils/brandAssets';
import {
  createOrSaveProduct,
  deleteProductById,
  loadStoredProducts,
  subscribeToProducts,
  toggleProductPublished,
  updateExistingProduct,
  updateProductPrice,
  updateProductStatus,
} from './services/productService';
import { AdminPanel, AdminTab, AdminUiState } from './components/AdminPanel';
import { AccountDetailModal } from './components/AccountDetailModal';

export default function AdminApp() {
  const [products, setProducts] = useState<PubgAccountProduct[]>(() => loadStoredProducts());
  const [adminState, setAdminState] = useState<AdminUiState>('READY');
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<PubgAccountProduct | null>(null);

  useEffect(() => {
    setProductLoadError(null);
    setProducts(loadStoredProducts());

    const unsubscribe = subscribeToProducts(
      true,
      (updatedProducts) => {
        setProducts(updatedProducts);
        setAdminState('READY');
      },
      (storeError) => {
        if (storeError) {
          setProductLoadError('Unable to load remote store data. Displaying saved products.');
          setAdminState('ERROR');
        } else {
          setProductLoadError(null);
          setAdminState('READY');
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const handleCreateProduct = async (input: ProductFormInput) => {
    const next = await createOrSaveProduct(input, products);
    setProducts(next);
  };

  const handleUpdateProduct = async (originalId: string, input: ProductFormInput) => {
    const next = await updateExistingProduct(originalId, input, products);
    setProducts(next);
  };

  const handleDeleteProduct = async (productId: string) => {
    const next = await deleteProductById(productId, products);
    setProducts(next);
  };

  const handleStatusChange = async (productId: string, status: AccountStatus) => {
    const next = await updateProductStatus(productId, status, products);
    setProducts(next);
  };

  const handlePriceChange = async (productId: string, price: number) => {
    const next = await updateProductPrice(productId, price, products);
    setProducts(next);
  };

  const handleTogglePublished = async (productId: string, published: boolean) => {
    const next = await toggleProductPublished(productId, published, products);
    setProducts(next);
  };

  const navItems: Array<{ id: AdminTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'products', label: 'Products' },
    { id: 'add-product', label: 'Add PUBG Account' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div
      data-admin-state={adminState}
      className="min-h-screen flex flex-col bg-[#08080A] text-[#F4F2ED]"
      style={{ minHeight: '100vh', backgroundColor: '#08080A', color: '#F4F2ED' }}
    >
      {/* Admin Header — Single Official Neo Empire Brand Logo */}
      <header className="sticky top-0 z-40 w-full bg-[#08080A]/95 backdrop-blur-md border-b border-[#C5A059]/25">
        <div className="max-w-[1240px] mx-auto px-3.5 sm:px-8 py-2.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={NEO_EMPIRE_LOGO_SRC}
              alt="Neo Empire Logo"
              width={36}
              height={36}
              onError={handleLogoImageError}
              className="neo-brand-logo-icon"
              style={{
                width: '36px',
                height: '36px',
                minWidth: '36px',
                maxWidth: '36px',
                maxHeight: '36px',
                objectFit: 'contain',
                borderRadius: '8px',
                border: '1px solid rgba(197, 160, 89, 0.45)',
              }}
            />
            <div className="min-w-0">
              <div className="font-display text-xs sm:text-base font-bold tracking-[0.12em] gold-embossed-heading truncate">
                NEO EMPIRE
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 truncate">
                <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate text-emerald-400">Admin Panel</span>
              </div>
            </div>
          </div>

          <nav
            aria-label="Admin Navigation"
            className="hidden md:flex items-center gap-5 text-xs font-medium"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                  activeTab === item.id
                    ? 'border-[#C5A059] text-[#F4F2ED] font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-[#F4F2ED]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/index.html"
              className="neo-dark-button min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Public Store</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        </div>

        {/* Mobile Admin Navigation Bar */}
        <div className="md:hidden border-t border-white/[0.08] bg-[#0B0C10] px-2 py-2 grid grid-cols-4 gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[38px] px-1 py-1.5 rounded-md text-[10px] sm:text-xs font-medium text-center whitespace-nowrap cursor-pointer ${
                activeTab === item.id
                  ? 'gold-metallic-button font-bold'
                  : 'bg-[#14161D] text-zinc-300 border border-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1">
        <AdminPanel
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          products={products}
          adminState={adminState}
          productLoadError={productLoadError}
          onCreateProduct={handleCreateProduct}
          onUpdateProduct={handleUpdateProduct}
          onDeleteProduct={handleDeleteProduct}
          onStatusChange={handleStatusChange}
          onPriceChange={handlePriceChange}
          onTogglePublished={handleTogglePublished}
          onInspectProduct={(prod) => setSelectedProduct(prod)}
        />
      </main>

      <footer className="mt-12 border-t border-white/[0.07] bg-[#060608] py-6">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <span>NEO EMPIRE · Admin Panel</span>
          <a href="/index.html" className="text-[#E5C878] hover:underline font-medium">
            Public Store
          </a>
        </div>
      </footer>

      <AccountDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}
