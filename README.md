# Copy Backup

Save a page's meta title, meta description and all copy between the site header and footer as clean, semantic HTML, with every image and its alt text in page order. Take a backup before you change a page's copy.

These four files run the same tool in three places:

| File | What it does |
| --- | --- |
| `index.html` | The whole tool (Capture, Paste HTML, Upload files, and Fetch when a fetch service is present) |
| `_worker.js` | The fetch service for Cloudflare Pages. Ignored by GitHub Pages |
| `server.js` | The fetch service for running on your own computer |
| `favicon.ico` | Browser tab icon for tools that look for /favicon.ico (the icon is also built into index.html) |
| `README.md` | This file |

**Fetch automatically** (type a URL, get the backup) appears only when a fetch service answers. On GitHub Pages the tab hides itself and everything else works.

## Option 1: Cloudflare Pages (free, includes Fetch)

1. Sign up at dash.cloudflare.com (free plan, no card needed).
2. Go to **Workers & Pages** → **Create application** → **Get started** → **Drag and drop your files**.
3. Name the project, for example `copy-backup`. This becomes `copy-backup.pages.dev`.
4. Drag in the unzipped folder (or the zip itself) and select **Deploy site**.
5. Open `https://copy-backup.pages.dev`. The **Fetch automatically** tab is there.

To update later: open the project → **Create new deployment** → drag the folder in again.

Free plan limits: 100,000 fetches a day across your account. Viewing the page itself is unlimited.

### Keep Fetch for your own sites only (recommended)

Anyone with the link can use Fetch. To limit it to your company's domains:

1. Open the project → **Settings** → **Variables and Secrets** → **Add**.
2. Name `ALLOWED_HOSTS`, value for example `acme.in, acme.com` (subdomains are included).
3. Save, then redeploy (Create new deployment).

Capture, Paste and Upload still work for every site.

## Option 2: GitHub Pages (free, no Fetch)

1. On github.com select **New repository**, name it `copy-backup`, set it to **Public**, and create it. (Free GitHub Pages needs a public repository.)
2. Select **uploading an existing file**, drag in all four files and select **Commit changes**.
3. Go to **Settings** → **Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two, the address appears at the top of that page: `https://<your-username>.github.io/copy-backup/`.

### GitHub and Cloudflare together

Keep the files on GitHub and let Cloudflare publish them with Fetch switched on: in Cloudflare choose **Workers & Pages** → **Create application**, pick the Pages option to import an existing Git repository, select it, leave the build command empty and the output directory as `/`, then deploy. Every commit to GitHub then redeploys automatically.

## Option 3: your own computer

Install Node.js 18 or newer, open a terminal in this folder and run:

```
node server.js
```

Then open http://127.0.0.1:4173. See the comments at the top of `server.js` for sharing it on your office network.

## Notes

- Fetch gets raw HTML, like a crawler. Use **Capture from browser** for pages built by JavaScript, pages that block bots, or pages behind a login.
- Some sites block requests from Cloudflare's network or from fake Googlebot user agents. Capture always works.
- Password-protected staging: include the login in the URL, for example `https://user:password@staging.acme.in/page`. It's sent as HTTP Basic auth and not stored.
- Backups are made in each person's browser. The fetch service passes pages straight through and doesn't store them.
