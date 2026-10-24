# Neo Empire — Free Cloudflare Pages Deployment Guide (`*.pages.dev`)

**Neo Empire** is configured for **FREE Cloudflare Pages deployment** using the automatic `*.pages.dev` URL provided by Cloudflare (no custom domain, no domain purchase, and no DNS setup required).

- **Public Store**: `https://<project-name>.pages.dev/` (and `https://<project-name>.pages.dev/index.html`)
- **Admin Panel**: `https://<project-name>.pages.dev/admin.html`

---

## 1. Deploy to Free Cloudflare Pages (`*.pages.dev`)

You can deploy using either **Direct Upload** of the built `dist` folder or **Git Integration** in the free Cloudflare Pages dashboard.

### Method A — Upload the `dist` Folder in Cloudflare Dashboard (No CLI or Git Required)
1. Build the production static files locally (already built in `/dist`):
   ```bash
   npm install
   npm run build
   ```
2. Log in to the free **Cloudflare Dashboard** → **Workers & Pages** → **Create application** → **Pages** → **Upload assets**.
3. Enter your project name (for example, `neo-empire-store` if available, or another Neo Empire project name).
4. Upload the **`dist`** folder and click **Deploy site**.
5. Cloudflare will automatically generate your free `https://<project-name>.pages.dev` URL.

### Method B — Connect Git Repository in Cloudflare Pages
1. In **Cloudflare Dashboard** → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Choose your repository and set the build configuration:
   - **Project name**: `neo-empire-store` (or another available name)
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Click **Save and Deploy** to receive your free `https://<project-name>.pages.dev` URL.

### Method C — Deploy via Wrangler CLI
```bash
npm run build
npx wrangler pages deploy dist --project-name=neo-empire-store
```

---

## 2. Authorize Your Free `.pages.dev` URL in Firebase Authentication

So that Google Sign-In works on `https://<project-name>.pages.dev/admin.html`:
1. Open the **Firebase Console** (`earnest-condition-4c70r`) → **Authentication** → **Settings** → **Authorized domains**.
2. Click **Add domain** and paste your Cloudflare-generated `<project-name>.pages.dev` hostname (for example, `neo-empire-store.pages.dev`).

---

## 3. Verifying Your Deployment

1. **Public Store (`/index.html` or `/`)**:
   - Displays the official uploaded **Neo Empire** logo, Hero section, and Store section.
   - Displays `NOT AVAILABLE` (`There are currently no accounts available.`) when no products are published.
   - Displays published accounts with Myanmar Kyat (`MMK`) pricing, `AVAILABLE` / `SOLD OUT` status, 3D image viewer, and the `BUY ACCOUNT` button linking to Telegram `@Littleneoo` (`https://t.me/Littleneoo`).
2. **Admin Panel (`/admin.html`)**:
   - Sign in as administrator (`phyoethinzarkyaw15@gmail.com`).
   - Add, edit, or delete products, upload account images (`JPG`, `PNG`, `WEBP`), set MMK prices, toggle `AVAILABLE` / `SOLD OUT`, and toggle `Publish` / `Unpublish`.
   - All changes sync in real time with the public store via Firestore.
