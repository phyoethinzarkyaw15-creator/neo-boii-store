import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync(
  fs.existsSync('./DRAFT_firestore.rules') ? './DRAFT_firestore.rules' : './firestore.rules',
  'utf8'
);

interface ProductPayload {
  [key: string]: unknown;
}

const REQUIRED_PRODUCT_KEYS = [
  'id',
  'name',
  'price',
  'currency',
  'status',
  'description',
  'features',
  'images',
  'mainImage',
  'importantNotes',
  'published',
  'authorId',
  'createdAt',
  'updatedAt',
];

function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function evaluateIsValidProduct(data: ProductPayload): boolean {
  const keys = Object.keys(data);
  if (!REQUIRED_PRODUCT_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => REQUIRED_PRODUCT_KEYS.includes(k))) return false;

  if (typeof data.id !== 'string' || data.id.length < 2 || data.id.length > 64 || !/^[a-zA-Z0-9_\-]+$/.test(data.id)) return false;
  if (typeof data.name !== 'string' || data.name.length < 2 || data.name.length > 120) return false;
  if (typeof data.price !== 'number' || data.price < 0 || data.price > 100000000) return false;
  if (data.currency !== 'MMK') return false;
  if (data.status !== 'AVAILABLE' && data.status !== 'SOLD OUT') return false;
  if (typeof data.description !== 'string' || data.description.length > 2000) return false;
  if (!Array.isArray(data.features) || data.features.length > 10) return false;
  if (data.features.length > 0 && (typeof data.features[0] !== 'string' || data.features[0].length < 1 || data.features[0].length > 120)) return false;
  if (!Array.isArray(data.images) || data.images.length > 8) return false;
  if (data.images.length > 0 && (typeof data.images[0] !== 'string' || data.images[0].length < 1 || data.images[0].length > 500000)) return false;
  if (typeof data.mainImage !== 'string' || data.mainImage.length > 500000) return false;
  if (typeof data.importantNotes !== 'string' || data.importantNotes.length > 1000) return false;
  if (typeof data.published !== 'boolean') return false;
  if (typeof data.authorId !== 'string' || data.authorId !== 'neo_empire_admin' || !isValidId(data.authorId)) return false;
  if (typeof data.createdAt !== 'number' || typeof data.updatedAt !== 'number') return false;
  return true;
}

function evaluateCreateProduct(docId: string, data: ProductPayload, requestTime: number): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!isValidId(docId)) return 'PERMISSION_DENIED';
  if (!evaluateIsValidProduct(data)) return 'PERMISSION_DENIED';
  if (data.id !== docId) return 'PERMISSION_DENIED';
  if (data.createdAt !== requestTime || data.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  return 'ALLOW';
}

function evaluateUpdateProduct(docId: string, existing: ProductPayload, incoming: ProductPayload, requestTime: number): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!isValidId(docId)) return 'PERMISSION_DENIED';
  if (!evaluateIsValidProduct(incoming)) return 'PERMISSION_DENIED';
  if (incoming.createdAt !== existing.createdAt) return 'PERMISSION_DENIED';
  if (incoming.authorId !== existing.authorId) return 'PERMISSION_DENIED';
  if (incoming.id !== existing.id) return 'PERMISSION_DENIED';
  if (incoming.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  return 'ALLOW';
}

const NOW = 1761000000000;

function makeBaseProduct(): ProductPayload {
  return {
    id: 'NEO-001',
    name: 'PUBG Account #001',
    price: 150000,
    currency: 'MMK',
    status: 'AVAILABLE',
    description: 'Conqueror frame account with M416 Glacier Lv.7.',
    features: ['M416 Glacier Lv.7'],
    images: [],
    mainImage: '',
    importantNotes: '',
    published: true,
    authorId: 'neo_empire_admin',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test('Rules file contains mandatory schema primitives and default deny', () => {
  assert.equal(rulesSource.includes("rules_version = '2';"), true);
  assert.equal(rulesSource.includes('allow read, write: if false;'), true);
  assert.equal(rulesSource.includes('function isValidProduct(data)'), true);
});

test('Valid direct admin MMK product creation succeeds without Google Login', () => {
  const payload = makeBaseProduct();
  assert.equal(evaluateCreateProduct('NEO-001', payload, NOW), 'ALLOW');
});

test('Invalid authorId -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), authorId: 'spoofed_uid_999' };
  assert.equal(evaluateCreateProduct('NEO-001', payload, NOW), 'PERMISSION_DENIED');
});

test('Shadow Field Injection on Create -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), secretPassword: 'leaked_password' };
  assert.equal(evaluateCreateProduct('NEO-001', payload, NOW), 'PERMISSION_DENIED');
});

test('Shadow Field Injection on Update -> PERMISSION_DENIED', () => {
  const existing = makeBaseProduct();
  const incoming = { ...makeBaseProduct(), updatedAt: NOW + 1000, ghostField: true };
  assert.equal(evaluateUpdateProduct('NEO-001', existing, incoming, NOW + 1000), 'PERMISSION_DENIED');
});

test('Value Poisoning on Status -> PERMISSION_DENIED', () => {
  const existing = makeBaseProduct();
  const incoming = { ...makeBaseProduct(), status: 'HACKED_STATE', updatedAt: NOW + 1000 };
  assert.equal(evaluateUpdateProduct('NEO-001', existing, incoming, NOW + 1000), 'PERMISSION_DENIED');
});

test('Resource Exhaustion (description > 2000 chars) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), description: 'A'.repeat(2500) };
  assert.equal(evaluateCreateProduct('NEO-001', payload, NOW), 'PERMISSION_DENIED');
});

test('ID Poisoning Attack (invalid characters in docId) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), id: 'NEO-001$%#@!' };
  assert.equal(evaluateCreateProduct('NEO-001$%#@!', payload, NOW), 'PERMISSION_DENIED');
});

test('Immortal Field Mutation (changing createdAt on update) -> PERMISSION_DENIED', () => {
  const existing = makeBaseProduct();
  const incoming = { ...makeBaseProduct(), createdAt: NOW + 500, updatedAt: NOW + 1000 };
  assert.equal(evaluateUpdateProduct('NEO-001', existing, incoming, NOW + 1000), 'PERMISSION_DENIED');
});

test('Client Timestamp Forgery (updatedAt != request.time) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), updatedAt: NOW - 99999 };
  assert.equal(evaluateCreateProduct('NEO-001', payload, NOW), 'PERMISSION_DENIED');
});

test('Unbounded Array Overflow (features > 10) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), features: new Array(12).fill('Mythic Item') };
  assert.equal(evaluateCreateProduct('NEO-001', payload, NOW), 'PERMISSION_DENIED');
});

test('Invalid Currency or Negative Price Value Poisoning -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), currency: 'USD', price: -50 };
  assert.equal(evaluateCreateProduct('NEO-001', payload, NOW), 'PERMISSION_DENIED');
});
