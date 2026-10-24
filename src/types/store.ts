export enum AccountStatus {
  AVAILABLE = 'AVAILABLE',
  SOLD_OUT = 'SOLD OUT',
}

export const TELEGRAM_BUY_URL = 'https://t.me/Littleneoo';
export const TELEGRAM_HANDLE = '@Littleneoo';

export interface PubgAccountProduct {
  id: string;
  name: string;
  price: number;
  currency: 'MMK';
  status: AccountStatus;
  description: string;
  features: string[];
  images: string[];
  mainImage: string;
  importantNotes: string;
  published: boolean;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductFormInput {
  id: string;
  name: string;
  price: number;
  status: AccountStatus;
  description: string;
  features: string[];
  images: string[];
  mainImage: string;
  importantNotes: string;
  published: boolean;
}

export interface StoreFilterState {
  searchQuery: string;
  statusFilter: 'ALL' | AccountStatus;
  sortBy: 'featured' | 'price-asc' | 'price-desc' | 'newest';
  onlyPublished?: boolean;
}

export interface AdminDashboardMetrics {
  totalAccounts: number;
  availableAccounts: number;
  soldOutAccounts: number;
  publishedAccounts: number;
  unpublishedAccounts: number;
  totalValueMmk: number;
  recentProducts: PubgAccountProduct[];
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}
