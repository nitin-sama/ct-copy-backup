# Copy Backup

Back up a page's meta and copy as clean, semantic HTML before you change it, then compare what changed afterwards.

Paste a URL and press Enter. That's it. Pages built with JavaScript, or that block the quick fetch, are re-fetched in a real browser automatically.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The whole tool |
| `_worker.js` | The fetch service on Cloudflare: quick fetch plus browser rendering |
| `wrangler.jsonc` | Cloudflare settings: Worker name, browser binding, which files are public |
| `.assetsignore` | Keeps the server files private. Hidden on Mac because it starts with a dot |
| `.gitignore` | Stops Mac's `.DS_Store` files from being committed |
| `server.js` | Optional: run the tool on your own computer (`node server.js`) |
| `favicon.ico` | Browser tab icon |

## Update your GitHub repo

1. Replace every file in the repo with the files in this zip, and delete `.DS_Store` if it's there.
2. Check that `.assetsignore` and `.gitignore` are in the top level of the repo. GitHub shows files that start with a dot. If they're missing (Mac hides them when you upload), use **Add file** → **Create new file**, type the exact name, and paste the contents shown at the end of this file.
3. Check that `"name"` in `wrangler.jsonc` matches your Worker's name in Cloudflare (`ct-copy-backup`).
4. Commit to `main`. Cloudflare redeploys automatically in about a minute.

## Browser rendering (free)

`wrangler.jsonc` includes a `browser` binding for Cloudflare Browser Run. No API token or extra setup is needed. The free plan allows **10 minutes of browser time a day** and **one rendered page every 10 seconds**, which is roughly 60 to 100 pages a day.

The tool only uses it when needed: it tries a quick fetch first and renders in the browser only if the page looks empty or blocked. You can change this in the fetch options next to the **Back up** button (Desktop · JS auto ▾). When the free limit is reached, the tool waits or tells you, and the quick fetch keeps working.

Some sites block all automated browsers. For those, open the page yourself, press Ctrl+U (⌥⌘U on Mac), copy everything, and press Ctrl+V in Copy Backup.

If a deploy ever fails mentioning `browser`, delete the `"browser"` block from `wrangler.jsonc`. Everything except rendering keeps working.

## Limit fetching to your own sites (recommended)

Anyone with the link can use the fetch service. To limit it, open the Worker in Cloudflare → **Settings** → **Variables and Secrets** → add a Text variable `ALLOWED_HOSTS` with your domains, for example `acme.in, acme.com`. `keep_vars` in `wrangler.jsonc` keeps it across deploys.

## Using it

- **Back up:** paste a URL (or several, one per line) and press Enter.
- **Paste or drop:** paste page source with Ctrl+V anywhere, or drop `.html` / `.mhtml` files anywhere.
- **Copy tab:** every block in page order. Untick what isn't copy (click the tag or press X). Filter by headings, images or hidden copy, or search.
- **Meta & SERP:** a Google result preview with pixel-width meters. Try new titles and descriptions before you write them.
- **Outline:** the heading structure, with skipped levels flagged.
- **Images:** every image with its alt text and alt status.
- **Removed:** everything left out, and why. Restore anything.
- **Compare:** after you change the page, back it up again; Compare shows added, removed and reworded blocks plus meta and alt changes.
- **Code:** the backup file, content-only HTML or plain text.
- **History** stays in your browser (left rail). Nothing about the pages is stored on the server.

Keyboard: `/` URL bar · `1`–`7` tabs · `J`/`K` move · `X` keep or leave out · `F` find · `Ctrl+S` download · `?` help.

## `.assetsignore` contents

```
_worker.js
wrangler.jsonc
server.js
README.md
.assetsignore
.gitignore
.DS_Store
.git
.github
.wrangler
node_modules
```

## `.gitignore` contents

```
.DS_Store
node_modules
.wrangler
```
