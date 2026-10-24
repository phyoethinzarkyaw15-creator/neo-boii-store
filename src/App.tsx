import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import {
  AccountStatus,
  PubgAccountProduct,
  StoreFilterState,
  TELEGRAM_BUY_URL,
  TELEGRAM_HANDLE,
} from './types/store';
import { filterAndSortProducts } from './utils/storeLogic';
import { NEO_EMPIRE_LOGO_SRC, handleLogoImageError } from './utils/brandAssets';
import { loadStoredProducts, subscribeToProducts } from './services/productService';
import { Navbar } from './components/Navbar';
import { Hero3D } from './components/Hero3D';
import { ProductCard3D } from './components/ProductCard3D';
import { AccountDetailModal } from './components/AccountDetailModal';

export default function App() {
  const storeSectionRef = useRef<HTMLElement | null>(null);

  const [products, setProducts] = useState<PubgAccountProduct[]>(() =>
    loadStoredProducts().filter((p) => p.published)
  );
  const [storeLoadError, setStoreLoadError] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('simulateStoreError') === '1') {
        return 'Unable to load store data.';
      }
    }
    return null;
  });
  const [reloadTick, setReloadTick] = useState<number>(0);

  const [filters, setFilters] = useState<StoreFilterState>({
    searchQuery: '',
    statusFilter: 'ALL',
    sortBy: 'featured',
    onlyPublished: true,
  });

  const [selectedProduct, setSelectedProduct] = useState<PubgAccountProduct | null>(null);

  useEffect(() => {
    const unsubProducts = subscribeToProducts(
      false,
      (updatedProducts) => {
        setProducts(updatedProducts);
      },
      (errMessage) => {
        if (errMessage) {
          setStoreLoadError(errMessage);
        }
      }
    );
    return () => unsubProducts();
  }, [reloadTick]);

  useEffect(() => {
    if (!selectedProduct) return;
    const latest = products.find((p) => p.id === selectedProduct.id);
    if (latest && latest.published) {
      setSelectedProduct(latest);
    } else {
      setSelectedProduct(null);
    }
  }, [products, selectedProduct]);

  const publishedProducts = useMemo(
    () => products.filter((p) => p.published),
    [products]
  );

  const filteredStoreProducts = useMemo(
    () => filterAndSortProducts(products, { ...filters, onlyPublished: true }),
    [products, filters]
  );

  const handleScrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleScrollToStore = useCallback(() => {
    if (storeSectionRef.current) {
      storeSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleRetryLoad = () => {
    setStoreLoadError(null);
    setReloadTick((prev) => prev + 1);
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-[#08080A] text-[#F4F2ED]"
      style={{ minHeight: '100vh', backgroundColor: '#08080A', color: '#F4F2ED' }}
    >
      {/* Simple Public Header: Original Uploaded Logo, Store, Search */}
      <Navbar
        searchQuery={filters.searchQuery}
        onSearchChange={(value) => setFilters((prev) => ({ ...prev, searchQuery: value }))}
        onNavigateHome={handleScrollToTop}
        onNavigateStore={handleScrollToStore}
      />

      {/* Main Public Store Layout */}
      <main className="flex-1">
        {/* 1. Hero / Store Introduction */}
        <Hero3D onEnterStore={handleScrollToStore} />

        {/* 2. Product Store Section */}
        <section
          id="store"
          ref={storeSectionRef}
          className="max-w-[1240px] mx-auto px-4 sm:px-8 py-12 sm:py-14 space-y-8"
        >
          {/* Store Entrance Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/[0.08]">
            <div>
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#C5A059]">
                NEO EMPIRE · OFFICIAL CATALOG
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-[0.08em] uppercase text-[#F4F2ED] mt-0.5">
                STORE
              </h2>
            </div>

            {/* Filter & Sort Controls (Shown when store has published products) */}
            {publishedProducts.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div
                  role="group"
                  aria-label="Filter by availability"
                  className="flex items-center p-1 rounded-lg bg-[#0E0F13] border border-white/10"
                >
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, statusFilter: 'ALL' }))}
                    className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      filters.statusFilter === 'ALL'
                        ? 'bg-[#C5A059] text-black font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, statusFilter: AccountStatus.AVAILABLE }))
                    }
                    className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      filters.statusFilter === AccountStatus.AVAILABLE
                        ? 'bg-[#C5A059] text-black font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Available
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, statusFilter: AccountStatus.SOLD_OUT }))
                    }
                    className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      filters.statusFilter === AccountStatus.SOLD_OUT
                        ? 'bg-zinc-700 text-white font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Sold Out
                  </button>
                </div>

                <select
                  aria-label="Sort products"
                  value={filters.sortBy}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      sortBy: e.target.value as StoreFilterState['sortBy'],
                    }))
                  }
                  className="min-h-[40px] px-3 py-2 rounded-lg bg-[#0E0F13] border border-white/10 text-xs font-medium text-[#F4F2ED] focus:outline-none focus:border-[#C5A059]"
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            )}
          </div>

          {/* Store Content: Error Recovery, Empty "NOT AVAILABLE" State, or Real Product Grid */}
          {storeLoadError ? (
            <div
              data-testid="store-error-state"
              className="rounded-xl py-14 px-6 text-center neo-surface-card max-w-2xl mx-auto space-y-4"
            >
              <div className="text-xs font-mono uppercase tracking-[0.22em] text-[#C5A059]">
                NEO EMPIRE · STORE
              </div>
              <h3 className="font-display text-xl font-bold tracking-[0.08em] text-[#F4F2ED]">
                Unable to load store data.
              </h3>
              <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                Try again.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRetryLoad}
                  className="gold-metallic-button min-h-[44px] px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try again</span>
                </button>
              </div>
            </div>
          ) : publishedProducts.length === 0 ? (
            /* Empty Store State when 0 products exist */
            <div
              data-testid="empty-store-state"
              className="rounded-xl py-14 px-6 text-center neo-surface-card max-w-2xl mx-auto space-y-3"
            >
              <div className="text-xs font-mono uppercase tracking-[0.22em] text-[#C5A059]">
                NEO EMPIRE · STORE
              </div>
              <h3 className="font-display text-2xl font-bold tracking-[0.14em] uppercase text-[#F4F2ED]">
                NOT AVAILABLE
              </h3>
              <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                No accounts are currently available.
              </p>
            </div>
          ) : filteredStoreProducts.length === 0 ? (
            /* Search/Filter Empty State when products exist but none match query */
            <div className="rounded-xl py-14 px-6 text-center neo-surface-card max-w-xl mx-auto space-y-4">
              <h3 className="font-display text-lg font-bold uppercase tracking-wider text-[#F4F2ED]">
                NOT AVAILABLE
              </h3>
              <p className="text-sm text-zinc-400">
                No accounts match your current search or filter selection.
              </p>
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    searchQuery: '',
                    statusFilter: 'ALL',
                    sortBy: 'featured',
                    onlyPublished: true,
                  })
                }
                className="gold-metallic-button min-h-[44px] px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
              {filteredStoreProducts.map((product) => (
                <ProductCard3D
                  key={product.id}
                  product={product}
                  onViewDetails={(prod) => setSelectedProduct(prod)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 3. Clean Footer with Original Uploaded Neo Empire Logo */}
      <footer className="mt-16 border-t border-white/[0.07] bg-[#060608] py-10">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img
              src={NEO_EMPIRE_LOGO_SRC}
              alt="Neo Empire Logo"
              width={32}
              height={32}
              onError={handleLogoImageError}
              className="neo-brand-logo-icon"
              style={{
                width: '32px',
                height: '32px',
                minWidth: '32px',
                maxWidth: '32px',
                maxHeight: '32px',
                objectFit: 'contain',
                borderRadius: '6px',
              }}
            />
            <span className="font-display text-sm font-bold tracking-[0.14em] gold-embossed-heading">
              NEO EMPIRE
            </span>
            <span className="text-xs text-zinc-500">
              © {new Date().getFullYear()} Neo Empire. All prices in MMK.
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-zinc-400">
            <button
              type="button"
              onClick={handleScrollToStore}
              className="hover:text-[#F4F2ED] transition-colors cursor-pointer"
            >
              Store
            </button>
            <a
              href={TELEGRAM_BUY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#E5C878] hover:text-[#F4F2ED] font-medium inline-flex items-center gap-1 transition-colors"
            >
              <span>Telegram {TELEGRAM_HANDLE}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </footer>

      {/* Account Detail Modal */}
      <AccountDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}
