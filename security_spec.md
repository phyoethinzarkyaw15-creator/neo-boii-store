# Neo Empire Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Any path not explicitly matched under `/products/{productId}` or `/admins/{adminId}` is unconditionally denied (`allow read, write: if false;`).
2. **Product Schema Integrity**: Every create and update operation on `/products/{productId}` must pass `isValidProduct(incoming())`, enforcing exact key allowlists (`hasAll` + `hasOnly`), strict string `.size()` bounds, numeric range bounds, bounded arrays (`images` 1..8, `highlights` 1..10), and regex validation on `productId` and `authorId`.
3. **Identity & Role Integrity**:
   - `authorId` on `/products/{productId}` must strictly match `request.auth.uid` on creation and remain immutable on updates (`incoming().authorId == existing().authorId`).
   - Only verified product owners (`existing().authorId == request.auth.uid`) or registered administrators (`isAdmin()`) can update or delete products.
   - `isAdmin()` checks `isVerifiedUser() && exists(/databases/$(database)/documents/admins/$(request.auth.uid))`.
   - Users cannot self-assign admin privileges in `/admins/{adminId}`.
4. **Temporal & Immortal Field Integrity**:
   - On `create`: `incoming().createdAt == request.time && incoming().updatedAt == request.time`.
   - On `update`: `incoming().createdAt == existing().createdAt && incoming().updatedAt == request.time`.
5. **Query Enforcer & Cost Guard**:
   - `allow list` on `/products/{productId}` never calls `get()` or `exists()`. It enforces `resource.data.published == true || (isSignedIn() && isVerifiedUser() && resource.data.authorId == request.auth.uid)`.
   - Unpublished products (`published == false`) cannot be read or listed by unauthenticated or non-owner users.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing)**: Authenticated user creates `/products/NE-101` with `authorId: "spoofed_uid_999"` instead of `request.auth.uid`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Spoofing)**: User with `email_verified: false` attempts to create a product. -> `PERMISSION_DENIED`
3. **Payload 3 (Shadow Field Injection on Create)**: Admin creates `/products/NE-101` with an extra undeclared field `secretPassword: "admin123"`. -> `PERMISSION_DENIED`
4. **Payload 4 (Shadow Field Injection on Update)**: Admin updates `/products/NE-101` adding `isFeatured: true` not in `hasOnly`. -> `PERMISSION_DENIED`
5. **Payload 5 (Value Poisoning on Status)**: Admin updates `status` to `"PENDING_HACK"` (not in `['AVAILABLE', 'SOLD OUT']`). -> `PERMISSION_DENIED`
6. **Payload 6 (Resource Exhaustion / 1MB String)**: Admin attempts to set `description` to a 5,000-character string (`> 2000`). -> `PERMISSION_DENIED`
7. **Payload 7 (ID Poisoning Attack)**: Admin attempts to create a document with path ID `NE-101$%#@!` failing `isValidId()`. -> `PERMISSION_DENIED`
8. **Payload 8 (Immortal Field Mutation)**: Admin updates `createdAt` or `authorId` on an existing product. -> `PERMISSION_DENIED`
9. **Payload 9 (Client Timestamp Forgery)**: Admin creates or updates a product with a past or future `updatedAt` instead of `request.time`. -> `PERMISSION_DENIED`
10. **Payload 10 (Unbounded Array Overflow)**: Admin attempts to write 15 items to `highlights` (limit is 10) or empty `images` array (min is 1). -> `PERMISSION_DENIED`
11. **Payload 11 (Self-Assigned Admin Escalation)**: Regular signed-in user attempts to create `/admins/{theirUid}` with `role: "admin"`. -> `PERMISSION_DENIED`
12. **Payload 12 (Unpublished Draft Scraping)**: Unauthenticated user attempts `get` or unrestricted `list` on `/products/NE-DRAFT` where `published == false`. -> `PERMISSION_DENIED`
