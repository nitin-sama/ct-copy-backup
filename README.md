# Copy Backup

Save a page's meta title, meta description and all copy between the site header and footer as clean, semantic HTML, with every image and its alt text in page order. Take a backup before you change a page's copy.

These files run the same tool in three places:

| File | What it does |
| --- | --- |
| `index.html` | The whole tool (Capture, Paste HTML, Upload files, and Fetch when a fetch service is present) |
| `_worker.js` | The fetch service for Cloudflare (Workers or Pages). Ignored by GitHub Pages |
| `wrangler.jsonc` | Cloudflare Workers settings: Worker name, which file is the server code, and which files are public |
| `.assetsignore` | Keeps the server files private on Cloudflare Workers. Hidden on Mac and Linux because it starts with a dot |
| `server.js` | The fetch service for running on your own computer |
| `favicon.ico` | Browser tab icon for tools that look for /favicon.ico (the icon is also built into index.html) |
| `README.md` | This file |

**Fetch automatically** (type a URL, get the backup) appears only when a fetch service answers. On GitHub Pages the tab hides itself and everything else works.

## Option 1: Cloudflare Workers connected to GitHub (free, includes Fetch)

This is what Cloudflare's dashboard sets up by default when you import a GitHub repository.

1. Put all seven files in the root of a GitHub repository. On Mac, `.assetsignore` is hidden after unzipping: in GitHub choose **Add file** → **Create new file**, name it `.assetsignore`, and paste its contents (listed below).
2. In Cloudflare go to **Workers & Pages** → **Create application** → import your GitHub repository. Leave the build command empty, the deploy command as `npx wrangler deploy`, and the root directory as `/`.
3. Make sure the Worker name you choose matches `"name"` in `wrangler.jsonc` (it's `copy-backup` in this download). If they differ, the build stops with a name error: edit that one line in GitHub.
4. Deploy. Your tool is at `https://copy-backup.<your-subdomain>.workers.dev`. Every commit to GitHub redeploys it.

Contents of `.assetsignore`:

```
_worker.js
wrangler.jsonc
server.js
README.md
.assetsignore
.git
.github
.wrangler
node_modules
```

Without `wrangler.jsonc` and `.assetsignore`, the deploy fails with "Uploading a Pages _worker.js file as an asset". That's Cloudflare refusing to publish server code as a public file.

Free plan limits: 100,000 fetches a day across your account. Viewing the page itself is free.

### Keep Fetch for your own sites only (recommended)

Anyone with the link can use Fetch. To limit it to your company's domains:

1. Open the Worker → **Settings** → **Variables and Secrets** → **Add**.
2. Type **Text**, name `ALLOWED_HOSTS`, value for example `acme.in, acme.com` (subdomains are included). Select **Deploy**.

`wrangler.jsonc` sets `keep_vars`, so this setting survives every redeploy from GitHub. Capture, Paste and Upload still work for every site.

### Cloudflare Pages by drag and drop (no GitHub)

In **Workers & Pages** → **Create application**, look for the Pages option to drag and drop your files, then drag in the unzipped folder. Pages runs `_worker.js` itself, so Fetch works there too, at `https://<project>.pages.dev`. Set `ALLOWED_HOSTS` under the project's **Settings** → **Variables and Secrets**, then create a new deployment.

## Option 2: GitHub Pages (free, no Fetch)

1. On github.com select **New repository**, name it `copy-backup`, set it to **Public**, and create it. (Free GitHub Pages needs a public repository.)
2. Select **uploading an existing file**, drag in all the files and select **Commit changes**.
3. Go to **Settings** → **Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two, the address appears at the top of that page: `https://<your-username>.github.io/copy-backup/`.

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
