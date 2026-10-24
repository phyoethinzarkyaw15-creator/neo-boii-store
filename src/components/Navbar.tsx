import React from 'react';
import { Search } from 'lucide-react';
import { NEO_EMPIRE_LOGO_SRC, handleLogoImageError } from '../utils/brandAssets';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onNavigateHome: () => void;
  onNavigateStore: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  onNavigateHome,
  onNavigateStore,
}) => {
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigateStore();
  };

  return (
    <header className="sticky top-0 z-40 h-16 w-full bg-[#08080A]/95 backdrop-blur-md border-b border-[#C5A059]/20">
      <div className="max-w-[1240px] mx-auto h-full px-3 sm:px-8 flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Brand Title with Original Uploaded Neo Empire Logo */}
        <button
          type="button"
          onClick={onNavigateHome}
          className="min-h-[44px] flex items-center gap-2 sm:gap-3 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A059] rounded-md cursor-pointer"
        >
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
            }}
          />
          <span className="font-display text-xs sm:text-lg font-bold tracking-[0.1em] sm:tracking-[0.14em] gold-embossed-heading whitespace-nowrap shrink-0">
            NEO EMPIRE
          </span>
        </button>

        {/* Zone 2: Simple Public Navigation Link */}
        <nav
          aria-label="Main Navigation"
          className="flex items-center gap-2 sm:gap-6 text-xs sm:text-sm font-medium shrink-0"
        >
          <button
            type="button"
            onClick={onNavigateStore}
            className="min-h-[44px] px-2 flex items-center text-[#F4F2ED] hover:text-[#E5C878] border-b-2 border-transparent hover:border-[#C5A059] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Store
          </button>
        </nav>

        {/* Zone 3: Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-28 sm:w-64 md:w-72 min-w-0 shrink">
          <Search className="w-3.5 h-3.5 text-[#C5A059] absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search store"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
            }}
            placeholder="Search..."
            className="w-full min-h-[40px] pl-8 sm:pl-9 pr-2.5 sm:pr-3 py-1.5 rounded-lg bg-[#0E0F13] border border-white/10 text-xs sm:text-sm text-[#F4F2ED] placeholder:text-zinc-500 focus:outline-none focus:border-[#C5A059]/60 transition-colors"
          />
        </form>
      </div>
    </header>
  );
};
