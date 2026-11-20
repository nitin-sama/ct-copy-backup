// Builds the bookmark: engine + in-page panel, minified, as a javascript: URL.
const fs = require('fs');
const { minify } = require('/tmp/terser/node_modules/terser');
const TOOL_URL = 'https://claude.ai/artifact/5sdD7waXKnnxUmCQaypV17';
(async () => {
  let engine = fs.readFileSync('/home/claude/cb/engine.js', 'utf8').replace(/if \(typeof module !== 'undefined' && module\.exports\) module\.exports = CB;\s*$/, '');
  // The panel only needs extraction and export: drop file decoding, zip and the old capture code.
  const cutFrom = engine.indexOf('  /* ---------- file decoding'), cutTo = engine.indexOf('  return {\n    DEFAULT_OPTS');
  if (cutFrom < 0 || cutTo < 0) throw new Error('markers not found');
  engine = engine.slice(0, cutFrom) + engine.slice(cutTo);
  engine = engine.replace('decodeFile: decodeFile, parseMHTML: parseMHTML, bookmarklet: bookmarklet, ', '').replace(', makeZip: makeZip', '');
  // Plain-text and CSV exports aren't offered in the panel.
  const t1 = engine.indexOf('  function toText(root) {'), t2 = engine.indexOf('  /* ---------- backup document');
  if (t1 < 0 || t2 < 0) throw new Error('export markers not found');
  engine = engine.slice(0, t1) + engine.slice(t2);
  engine = engine.replace('var text = toText(root);', "var text = '';").replace('var csv = imagesCsv(images, result.pageUrl);', "var csv = '';");
  if (/toText\(|imagesCsv\(/.test(engine)) throw new Error('export still referenced');
  // The downloaded file keeps its light styles; dark-mode tweaks are left out to save space.
  engine = engine.split('\n').filter(l => !/prefers-color-scheme:dark/.test(l)).join('\n');
  const overlay = fs.readFileSync('/home/claude/cb/overlay.js', 'utf8').replace('__TOOL_URL__', TOOL_URL);
  const bundle = '(function(){' + engine + '\n' + overlay + '\n})();';
  fs.writeFileSync('/home/claude/cb/bookmark.bundle.js', bundle);
  const out = await minify(bundle, { compress: { passes: 3 }, mangle: true, format: { ascii_only: true, comments: false } });
  const code = out.code + 'void 0';
  fs.writeFileSync('/home/claude/cb/bookmark.min.js', code);
  // Encode only what a javascript: URL needs, keeping it short.
  if (/[\n\r]/.test(code)) throw new Error('newline in minified code');
  const href = 'javascript:' + code.replace(/%/g, '%25').replace(/#/g, '%23');
  fs.writeFileSync('/home/claude/cb/bookmark.href.txt', href);
  console.log('bundle', Math.round(bundle.length / 1024) + 'KB', '| minified', Math.round(code.length / 1024) + 'KB', '| bookmark URL', href.length, 'chars');
  new Function(code); console.log('minified code parses');
  console.log('round-trip decode equals code:', decodeURIComponent(href.slice(11)) === code);
})();
