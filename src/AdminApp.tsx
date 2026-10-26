import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import {
  AccountStatus,
  ProductFormInput,
  PubgAccountProduct,
} from './types/store';
import { NEO_EMPIRE_LOGO_SRC, handleLogoImageError } from './utils/brandAssets';
import {
  auth,
  completeRedirectSignIn,
  formatAuthErrorMessage,
  subscribeToAuthState,
  User,
} from './services/firebase';
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

declare global {
  interface Window {
    __NEO_ADMIN_AUTH_CONTROLLER__?: {
      getState: () => {
        authInitialized: boolean;
        adminState: AdminUiState;
        hasUser: boolean;
      };
      handleAuthenticatedUser: (user: User) => void;
      showAdminDashboard: (user: User) => void;
      hideLoginScreen: () => void;
      showLoginScreen: () => void;
      hideAdminDashboard: () => void;
      showLoginError: (error: unknown) => void;
      simulateFirestoreLoadError: () => void;
    };
  }
}

function hideAuthLoadingElement(): void {
  if (typeof document === 'undefined') return;
  const authLoading = document.getElementById('admin-auth-loading');
  if (authLoading) {
    authLoading.style.display = 'none';
    authLoading.hidden = true;
  }
}

function showAuthLoadingElement(): void {
  if (typeof document === 'undefined') return;
  const authLoading = document.getElementById('admin-auth-loading');
  if (authLoading) {
    authLoading.style.display = 'block';
    authLoading.hidden = false;
  }
}

function hideLoginScreenDom(): void {
  if (typeof document === 'undefined') return;
  const loginScreen = document.getElementById('admin-login-screen');
  if (loginScreen) {
    loginScreen.style.display = 'none';
    loginScreen.hidden = true;
  }
}

function showLoginScreenDom(): void {
  if (typeof document === 'undefined') return;
  const loginScreen = document.getElementById('admin-login-screen');
  if (loginScreen) {
    loginScreen.style.display = 'block';
    loginScreen.hidden = false;
  }
}

function hideAdminDashboardDom(): void {
  if (typeof document === 'undefined') return;
  const adminDashboard = document.getElementById('admin-dashboard');
  if (adminDashboard) {
    adminDashboard.style.display = 'none';
    adminDashboard.hidden = true;
  }
}

function showAdminDashboardDom(): void {
  if (typeof document === 'undefined') return;
  const adminDashboard = document.getElementById('admin-dashboard');
  if (adminDashboard) {
    adminDashboard.style.display = 'block';
    adminDashboard.hidden = false;
  }
}

export default function AdminApp() {
  const [products, setProducts] = useState<PubgAccountProduct[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth?.currentUser ?? null);
  const [authInitialized, setAuthInitialized] = useState<boolean>(() => Boolean(auth?.currentUser));
  const [adminState, setAdminState] = useState<AdminUiState>(() =>
    auth?.currentUser ? 'AUTHENTICATED' : 'CHECKING_AUTH'
  );
  const [redirectAuthError, setRedirectAuthError] = useState<string | null>(null);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<PubgAccountProduct | null>(null);

  const dashboardInitializedRef = useRef<boolean>(false);
  const currentUserRef = useRef<User | null>(auth?.currentUser ?? null);
  const redirectAuthErrorRef = useRef<string | null>(null);
  const productsUnsubRef = useRef<(() => void) | null>(null);

  const initializeAdminDashboard = useCallback((user: User) => {
    if (!user) return;
    if (productsUnsubRef.current) {
      productsUnsubRef.current();
      productsUnsubRef.current = null;
    }

    setAdminState('LOADING_PRODUCTS');
    setProductLoadError(null);
    setProducts(loadStoredProducts());

    productsUnsubRef.current = subscribeToProducts(
      true,
      (updatedProducts) => {
        setProducts(updatedProducts);
        setAdminState((prev) => (prev === 'ERROR' ? 'ERROR' : 'READY'));
      },
      (storeError) => {
        if (storeError) {
          setProductLoadError('Signed in, but product data could not be loaded.');
          setAdminState('ERROR');
        } else {
          setProductLoadError(null);
          setAdminState('READY');
        }
      }
    );
  }, []);

  const hideLoginScreen = useCallback(() => {
    hideAuthLoadingElement();
    hideLoginScreenDom();
  }, []);

  const hideAdminDashboard = useCallback(() => {
    hideAdminDashboardDom();
  }, []);

  const showAdminDashboard = useCallback(
    (user: User) => {
      if (!user) return;
      currentUserRef.current = user;
      redirectAuthErrorRef.current = null;
      setCurrentUser(user);
      setAuthInitialized(true);
      setRedirectAuthError(null);
      hideAuthLoadingElement();
      hideLoginScreenDom();
      showAdminDashboardDom();

      if (dashboardInitializedRef.current) {
        return;
      }
      dashboardInitializedRef.current = true;
      setAdminState('AUTHENTICATED');
      initializeAdminDashboard(user);
    },
    [initializeAdminDashboard]
  );

  const handleAuthenticatedUser = useCallback(
    (user: User) => {
      showAdminDashboard(user);
      hideLoginScreen();
    },
    [hideLoginScreen, showAdminDashboard]
  );

  const showLoginScreen = useCallback(() => {
    if (auth?.currentUser) {
      showAdminDashboard(auth.currentUser);
      hideLoginScreen();
      return;
    }
    currentUserRef.current = null;
    dashboardInitializedRef.current = false;
    if (productsUnsubRef.current) {
      productsUnsubRef.current();
      productsUnsubRef.current = null;
    }
    setCurrentUser(null);
    setAuthInitialized(true);
    setProducts([]);
    setProductLoadError(null);
    setAdminState(redirectAuthErrorRef.current ? 'ERROR' : 'LOGIN');
    hideAuthLoadingElement();
    hideAdminDashboardDom();
    showLoginScreenDom();
  }, [hideLoginScreen, showAdminDashboard]);

  const showLoginError = useCallback((error: unknown) => {
    if (auth?.currentUser || currentUserRef.current) {
      return;
    }
    const message = formatAuthErrorMessage(error);
    redirectAuthErrorRef.current = message;
    setRedirectAuthError(message);
    setAuthInitialized(true);
    setAdminState('ERROR');
    hideAuthLoadingElement();
    hideAdminDashboardDom();
    showLoginScreenDom();
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (auth?.currentUser) {
      showAdminDashboard(auth.currentUser);
      hideLoginScreen();
    } else {
      showAuthLoadingElement();
    }

    // Step 5 — Safely process getRedirectResult(auth).
    // If it returns a user: keep that user -> show Admin Dashboard.
    // If it returns null: wait for onAuthStateChanged() (do NOT treat null as logout).
    completeRedirectSignIn()
      .then(({ user, error }) => {
        if (!isMounted) return;
        if (user) {
          showAdminDashboard(user);
          hideLoginScreen();
        } else if (error) {
          showLoginError(error);
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        showLoginError(error);
      });

    // Step 6 — Register onAuthStateChanged(auth, user) as the source of truth
    const unsubAuth = subscribeToAuthState((user) => {
      if (!isMounted) return;
      if (user) {
        showAdminDashboard(user);
        hideLoginScreen();
      } else {
        showLoginScreen();
        hideAdminDashboard();
      }
    });

    return () => {
      isMounted = false;
      dashboardInitializedRef.current = false;
      unsubAuth();
      if (productsUnsubRef.current) {
        productsUnsubRef.current();
        productsUnsubRef.current = null;
      }
    };
  }, [
    hideAdminDashboard,
    hideLoginScreen,
    showAdminDashboard,
    showLoginError,
    showLoginScreen,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__NEO_ADMIN_AUTH_CONTROLLER__ = {
      getState: () => ({
        authInitialized,
        adminState,
        hasUser: currentUser !== null,
      }),
      handleAuthenticatedUser,
      showAdminDashboard,
      hideLoginScreen,
      showLoginScreen,
      hideAdminDashboard,
      showLoginError,
      simulateFirestoreLoadError: () => {
        setProductLoadError('Signed in, but product data could not be loaded.');
        setAdminState('ERROR');
      },
    };
    return () => {
      delete window.__NEO_ADMIN_AUTH_CONTROLLER__;
    };
  }, [
    adminState,
    authInitialized,
    currentUser,
    handleAuthenticatedUser,
    hideAdminDashboard,
    hideLoginScreen,
    showAdminDashboard,
    showLoginError,
    showLoginScreen,
  ]);

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

  const isAuthenticated = currentUser !== null;

  const navItems: Array<{ id: AdminTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'products', label: 'Products' },
    { id: 'add-product', label: 'Add Account' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div
      data-admin-state={adminState}
      data-auth-initialized={String(authInitialized)}
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
                {isAuthenticated ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate text-emerald-400">Admin Panel</span>
                  </>
                ) : (
                  <span className="truncate text-[#C5A059]">Admin Panel</span>
                )}
              </div>
            </div>
          </div>

          {isAuthenticated && (
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
          )}

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

        {/* Mobile Admin Navigation Bar (No duplicate logo, fits 360px without clipping) */}
        {isAuthenticated && (
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
        )}
      </header>

      <main className="flex-1">
        <AdminPanel
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          products={products}
          firebaseUser={currentUser}
          authInitialized={authInitialized}
          adminState={adminState}
          onAdminStateChange={setAdminState}
          onUserAuthenticated={handleAuthenticatedUser}
          onUserSignedOut={() => {
            showLoginScreen();
            hideAdminDashboard();
          }}
          initialAuthError={redirectAuthError}
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
