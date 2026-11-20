# Copy Backup

Back up any page's meta title, meta description and copy in one click, right on the page.

## Files

- `index.html` is the Copy Backup page. Open it in a browser, or put it on any web host, to get the button.
- `bookmark.txt` is the button itself, if you'd rather add the bookmark by hand.
- `source/` has the code, for developers who want to change it.

## Add the button (one time)

1. Open `index.html` (or your Copy Backup link) on a computer.
2. Drag the yellow **Copy Backup** button up to your bookmarks bar. If the bar is hidden, press Ctrl+Shift+B (⌘⇧B on Mac).

**To add it by hand:** create a new bookmark, name it Copy Backup, and paste the whole contents of `bookmark.txt` as its address (URL).

If you added the button before, add the new one and delete the old bookmark.

## Use it

1. Open the page you want to back up.
2. Click **Copy Backup** in your bookmarks bar. A panel opens on the page. The button scrolls through the page by itself first, so copy that loads as you scroll is included.
3. Pick a view and save:
   - **Preview** shows the meta title, meta description and all the copy in page order, with images and their alt text. Hover a block and click × to leave it out.
   - **HTML** shows clean HTML with the meta title and description on top. **Copy HTML** copies it.
   - **Download** saves the full backup as an HTML file.

Press Esc or click the bookmark again to close the panel.

Works in Chrome, Edge, Firefox and Safari on a computer. A few very locked-down sites don't allow the panel; there, the button copies the page instead and tells you to paste it into the Copy Backup page.

## For developers: rebuilding

`source/build_bm.js` bundles `engine.js` and `overlay.js` into the minified bookmark (needs Node.js and `terser`). `source/build.py` puts the engine, the app and the bookmark into `index.html`. Keep the bookmark under 65,536 characters, Firefox's limit for bookmark addresses.
