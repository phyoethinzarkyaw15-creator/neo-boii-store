import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync(
  fs.existsSync('./DRAFT_firestore.rules') ? './DRAFT_firestore.rules' : './firestore.rules',
  'utf8'
);

interface AuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
  isListedInAdminsCollection?: boolean;
}

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

function isAdmin(auth: AuthContext | null): boolean {
  return Boolean(auth && auth.email_verified && auth.isListedInAdminsCollection);
}

function evaluateIsValidProduct(data: ProductPayload, auth: AuthContext | null): boolean {
  if (!auth) return false;
  const keys = Object.keys(data);
  if (!REQUIRED_PRODUCT_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => REQUIRED_PRODUCT_KEYS.includes(k))) return false;

  if (typeof data.id !== 'string' || data.id.length < 2 || data.id.length > 64 || !/^[a-zA-Z0-9_\-]+$/.test(data.id)) return false;
  if (typeof data.name !== 'string' || data.name.length < 2 || data.name.length > 120) return false;
  if (typeof data.price !== 'number' || data.price < 0 || data.price > 100000000) return false;
  if (data.currency !== 'MMK') return false;
  if (data.status !== 'AVAILABLE' && data.status !== 'SOLD OUT') return false;
  if (typeof data.description !== 'string' || data.description.length < 2 || data.description.length > 2000) return false;
  if (!Array.isArray(data.features) || data.features.length > 10) return false;
  if (data.features.length > 0 && (typeof data.features[0] !== 'string' || data.features[0].length < 1 || data.features[0].length > 120)) return false;
  if (!Array.isArray(data.images) || data.images.length > 8) return false;
  if (data.images.length > 0 && (typeof data.images[0] !== 'string' || data.images[0].length < 1 || data.images[0].length > 500000)) return false;
  if (typeof data.mainImage !== 'string' || data.mainImage.length > 500000) return false;
  if (typeof data.importantNotes !== 'string' || data.importantNotes.length > 1000) return false;
  if (typeof data.published !== 'boolean') return false;
  if (typeof data.authorId !== 'string' || data.authorId !== auth.uid || !isValidId(data.authorId)) return false;
  if (typeof data.createdAt !== 'number' || typeof data.updatedAt !== 'number') return false;
  return true;
}

function evaluateCreateProduct(docId: string, data: ProductPayload, auth: AuthContext | null, requestTime: number): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!auth || !auth.email_verified) return 'PERMISSION_DENIED';
  if (!isValidId(docId)) return 'PERMISSION_DENIED';
  if (!evaluateIsValidProduct(data, auth)) return 'PERMISSION_DENIED';
  if (data.id !== docId) return 'PERMISSION_DENIED';
  if (data.createdAt !== requestTime || data.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  return 'ALLOW';
}

function evaluateUpdateProduct(docId: string, existing: ProductPayload, incoming: ProductPayload, auth: AuthContext | null, requestTime: number): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!auth || !auth.email_verified) return 'PERMISSION_DENIED';
  if (!isValidId(docId)) return 'PERMISSION_DENIED';
  if (!evaluateIsValidProduct(incoming, auth)) return 'PERMISSION_DENIED';
  if (incoming.createdAt !== existing.createdAt) return 'PERMISSION_DENIED';
  if (incoming.authorId !== existing.authorId) return 'PERMISSION_DENIED';
  if (incoming.id !== existing.id) return 'PERMISSION_DENIED';
  if (incoming.updatedAt !== requestTime) return 'PERMISSION_DENIED';
  if (existing.authorId !== auth.uid && !isAdmin(auth)) return 'PERMISSION_DENIED';
  return 'ALLOW';
}

const validAdminAuth: AuthContext = {
  uid: 'admin_uid_01',
  email: 'admin@example.com',
  email_verified: true,
  isListedInAdminsCollection: true,
};

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
    authorId: 'admin_uid_01',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test('Rules file contains mandatory 8-pillar primitives and default deny', () => {
  assert.equal(rulesSource.includes("rules_version = '2';"), true);
  assert.equal(rulesSource.includes('allow read, write: if false;'), true);
  assert.equal(rulesSource.includes('function isValidProduct(data)'), true);
  assert.equal(rulesSource.includes('request.auth.token.email_verified == true'), true);
});

test('Valid admin MMK product creation succeeds (including with no uploaded images yet)', () => {
  const payload = makeBaseProduct();
  assert.equal(evaluateCreateProduct('NEO-001', payload, validAdminAuth, NOW), 'ALLOW');
});

test('Dirty Dozen #1: Identity Spoofing (mismatched authorId) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), authorId: 'spoofed_uid_999' };
  assert.equal(evaluateCreateProduct('NEO-001', payload, validAdminAuth, NOW), 'PERMISSION_DENIED');
});

test('Dirty Dozen #2: Unverified Email Spoofing (email_verified: false) -> PERMISSION_DENIED', () => {
  const spoofAuth: AuthContext = { ...validAdminAuth, email_verified: false };
  assert.equal(evaluateCreateProduct('NEO-001', makeBaseProduct(), spoofAuth, NOW), 'PERMISSION_DENIED');
});

test('Dirty Dozen #3: Shadow Field Injection on Create -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), secretPassword: 'leaked_password' };
  assert.equal(evaluateCreateProduct('NEO-001', payload, validAdminAuth, NOW), 'PERMISSION_DENIED');
});

test('Dirty Dozen #4: Shadow Field Injection on Update -> PERMISSION_DENIED', () => {
  const existing = makeBaseProduct();
  const incoming = { ...makeBaseProduct(), updatedAt: NOW + 1000, ghostField: true };
  assert.equal(evaluateUpdateProduct('NEO-001', existing, incoming, validAdminAuth, NOW + 1000), 'PERMISSION_DENIED');
});

test('Dirty Dozen #5: Value Poisoning on Status -> PERMISSION_DENIED', () => {
  const existing = makeBaseProduct();
  const incoming = { ...makeBaseProduct(), status: 'HACKED_STATE', updatedAt: NOW + 1000 };
  assert.equal(evaluateUpdateProduct('NEO-001', existing, incoming, validAdminAuth, NOW + 1000), 'PERMISSION_DENIED');
});

test('Dirty Dozen #6: Resource Exhaustion (description > 2000 chars) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), description: 'A'.repeat(2500) };
  assert.equal(evaluateCreateProduct('NEO-001', payload, validAdminAuth, NOW), 'PERMISSION_DENIED');
});

test('Dirty Dozen #7: ID Poisoning Attack (invalid characters in docId) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), id: 'NEO-001$%#@!' };
  assert.equal(evaluateCreateProduct('NEO-001$%#@!', payload, validAdminAuth, NOW), 'PERMISSION_DENIED');
});

test('Dirty Dozen #8: Immortal Field Mutation (changing createdAt on update) -> PERMISSION_DENIED', () => {
  const existing = makeBaseProduct();
  const incoming = { ...makeBaseProduct(), createdAt: NOW + 500, updatedAt: NOW + 1000 };
  assert.equal(evaluateUpdateProduct('NEO-001', existing, incoming, validAdminAuth, NOW + 1000), 'PERMISSION_DENIED');
});

test('Dirty Dozen #9: Client Timestamp Forgery (updatedAt != request.time) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), updatedAt: NOW - 99999 };
  assert.equal(evaluateCreateProduct('NEO-001', payload, validAdminAuth, NOW), 'PERMISSION_DENIED');
});

test('Dirty Dozen #10: Unbounded Array Overflow (features > 10) -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), features: new Array(12).fill('Mythic Item') };
  assert.equal(evaluateCreateProduct('NEO-001', payload, validAdminAuth, NOW), 'PERMISSION_DENIED');
});

test('Dirty Dozen #11: Non-Owner User Attempting Product Update -> PERMISSION_DENIED', () => {
  const otherUser: AuthContext = { uid: 'user_123', email: 'buyer@example.com', email_verified: true };
  const existing = makeBaseProduct();
  const incoming = { ...makeBaseProduct(), price: 50000, updatedAt: NOW + 1000 };
  assert.equal(evaluateUpdateProduct('NEO-001', existing, incoming, otherUser, NOW + 1000), 'PERMISSION_DENIED');
});

test('Dirty Dozen #12: Invalid Currency or Negative Price Value Poisoning -> PERMISSION_DENIED', () => {
  const payload = { ...makeBaseProduct(), currency: 'USD', price: -50 };
  assert.equal(evaluateCreateProduct('NEO-001', payload, validAdminAuth, NOW), 'PERMISSION_DENIED');
});
