import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardMetrics,
  filterAndSortProducts,
  formatMmkPrice,
  validateImageFileMeta,
  validateProductInput,
} from './storeLogic';
import { AccountStatus, PubgAccountProduct } from '../types/store';
import { formatAuthErrorMessage } from '../services/firebase';

const testRecords: PubgAccountProduct[] = [
  {
    id: 'NEO-001',
    name: 'PUBG Account #001',
    price: 150000,
    currency: 'MMK',
    status: AccountStatus.AVAILABLE,
    description: 'Season Conqueror account with M416 Glacier Level 7.',
    features: ['M416 Glacier Lv.7', 'Conqueror Frame'],
    images: [],
    mainImage: '',
    importantNotes: 'Direct transfer via @Littleneoo.',
    published: true,
    authorId: 'admin_1',
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
  },
  {
    id: 'NEO-002',
    name: 'PUBG Account #002',
    price: 250000,
    currency: 'MMK',
    status: AccountStatus.SOLD_OUT,
    description: 'Mythic Fashion account with Blood Raven X-Suit.',
    features: ['Blood Raven X-Suit Lv.6'],
    images: [],
    mainImage: '',
    importantNotes: '',
    published: true,
    authorId: 'admin_1',
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-21T01:00:00.000Z',
  },
  {
    id: 'NEO-003',
    name: 'PUBG Account #003',
    price: 500000,
    currency: 'MMK',
    status: AccountStatus.AVAILABLE,
    description: 'Unpublished account listing.',
    features: [],
    images: [],
    mainImage: '',
    importantNotes: '',
    published: false,
    authorId: 'admin_1',
    createdAt: '2026-10-20T15:00:00.000Z',
    updatedAt: '2026-10-20T16:00:00.000Z',
  },
];

test('formatMmkPrice formats Myanmar Kyat prices with comma separators and MMK suffix', () => {
  assert.equal(formatMmkPrice(50000), '50,000 MMK');
  assert.equal(formatMmkPrice(100000), '100,000 MMK');
  assert.equal(formatMmkPrice(150000), '150,000 MMK');
  assert.equal(formatMmkPrice(250000), '250,000 MMK');
  assert.equal(formatMmkPrice(500000), '50,0000'.replace('50,0000', '500,000') + ' MMK');
});

test('validateProductInput accepts valid MMK product input (with or without images) and rejects invalid fields', () => {
  const validRes = validateProductInput({
    id: 'NEO-001',
    name: 'PUBG Account #001',
    price: 150000,
    status: AccountStatus.AVAILABLE,
    description: 'Conqueror frame account with M416 Glacier Lv.7.',
    features: ['M416 Glacier Lv.7'],
    images: [],
    mainImage: '',
    importantNotes: '',
    published: true,
  });
  assert.equal(validRes.valid, true);
  assert.deepEqual(validRes.errors, {});

  const invalidRes = validateProductInput({
    id: 'BAD ID!',
    name: 'A',
    price: -10,
    status: AccountStatus.AVAILABLE,
    description: 'x'.repeat(2005),
    features: new Array(12).fill('Feature'),
    images: new Array(10).fill('https://img'),
    mainImage: '',
    importantNotes: '',
    published: true,
  });
  assert.equal(invalidRes.valid, false);
  assert.equal(Boolean(invalidRes.errors.id), true);
  assert.equal(Boolean(invalidRes.errors.name), true);
  assert.equal(Boolean(invalidRes.errors.price), true);
  assert.equal(Boolean(invalidRes.errors.description), true);
  assert.equal(Boolean(invalidRes.errors.images), true);
  assert.equal(Boolean(invalidRes.errors.features), true);
});

test('filterAndSortProducts returns empty array when database has 0 products and hides unpublished items', () => {
  const emptyStore = filterAndSortProducts([], {
    searchQuery: '',
    statusFilter: 'ALL',
    sortBy: 'featured',
    onlyPublished: true,
  });
  assert.equal(emptyStore.length, 0);

  const publicAll = filterAndSortProducts(testRecords, {
    searchQuery: '',
    statusFilter: 'ALL',
    sortBy: 'featured',
    onlyPublished: true,
  });
  assert.equal(publicAll.length, 2);
  assert.equal(publicAll[0].id, 'NEO-001');

  const availableOnly = filterAndSortProducts(testRecords, {
    searchQuery: '',
    statusFilter: AccountStatus.AVAILABLE,
    sortBy: 'featured',
    onlyPublished: true,
  });
  assert.equal(availableOnly.length, 1);
  assert.equal(availableOnly[0].id, 'NEO-001');
});

test('computeDashboardMetrics calculates accurate counts including empty state', () => {
  const emptyMetrics = computeDashboardMetrics([]);
  assert.equal(emptyMetrics.totalAccounts, 0);
  assert.equal(emptyMetrics.availableAccounts, 0);
  assert.equal(emptyMetrics.soldOutAccounts, 0);
  assert.equal(emptyMetrics.publishedAccounts, 0);

  const metrics = computeDashboardMetrics(testRecords);
  assert.equal(metrics.totalAccounts, 3);
  assert.equal(metrics.availableAccounts, 2);
  assert.equal(metrics.soldOutAccounts, 1);
  assert.equal(metrics.publishedAccounts, 2);
  assert.equal(metrics.unpublishedAccounts, 1);
  assert.equal(metrics.totalValueMmk, 150000 + 500000);
});

test('validateImageFileMeta enforces MIME type and 8MB size limit', () => {
  assert.equal(validateImageFileMeta('account.webp', 'image/webp', 500_000).valid, true);
  assert.equal(validateImageFileMeta('account.jpg', 'image/jpeg', 500_000).valid, true);
  assert.equal(validateImageFileMeta('script.exe', 'application/x-msdownload', 1024).valid, false);
  assert.equal(validateImageFileMeta('huge.png', 'image/png', 10 * 1024 * 1024).valid, false);
});

test('formatAuthErrorMessage maps Firebase error codes to clean user-facing messages', () => {
  assert.equal(
    formatAuthErrorMessage({ code: 'auth/unauthorized-domain' }),
    'Google sign-in is not enabled for this website domain.'
  );
  for (const code of [
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
    'auth/redirect-cancelled-by-user',
    'auth/operation-not-allowed',
    'auth/network-request-failed',
  ]) {
    assert.equal(
      formatAuthErrorMessage({ code }),
      'Unable to sign in. Please try again.'
    );
  }
});
