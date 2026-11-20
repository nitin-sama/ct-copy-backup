/* ===== Copy Backup in-page panel (runs from the bookmark) ===== */
(function () {
  'use strict';
  var TOOL_URL = '__TOOL_URL__';
  var ROOT_ID = 'copy-backup-panel-root';
  var existing = document.getElementById(ROOT_ID);
  if (existing) { existing.remove(); return; }

  var OPTS = Object.assign({}, CB.DEFAULT_OPTS, { metaExtras: false });
  var tt = null;
  try { if (window.trustedTypes && window.trustedTypes.createPolicy) tt = window.trustedTypes.createPolicy('copy-backup-' + Date.now(), { createHTML: function (s) { return s; } }); } catch (e) { tt = null; }
  function asHTML(s) { return tt ? tt.createHTML(s) : s; }
  function Parser() { }
  Parser.prototype.parseFromString = function (s, type) { return new DOMParser().parseFromString(asHTML(s), type); };

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.scrim{position:fixed;inset:0;background:rgba(12,18,32,.42);z-index:2147483646}',
    '.panel{position:fixed;top:12px;right:12px;bottom:12px;width:min(780px,calc(100vw - 24px));z-index:2147483647;background:#fff;color:#16213a;border-radius:16px;box-shadow:0 18px 60px rgba(12,18,32,.35);display:flex;flex-direction:column;overflow:hidden;font:400 15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;border-bottom:1px solid #dce1ea}',
    '.logo{width:26px;height:26px;border-radius:7px;background:#2550c8;position:relative;flex:none}',
    '.logo:before{content:"";position:absolute;left:24%;top:18%;width:46%;height:60%;background:#fff;border-radius:2px}',
    '.logo:after{content:"";position:absolute;right:12%;bottom:12%;width:36%;height:36%;background:#ffe36e;border-radius:3px;box-shadow:0 0 0 1.5px #2550c8}',
    '.who{flex:1;min-width:0;display:grid}',
    '.name{font-weight:800;font-size:15px;letter-spacing:-.01em}',
    '.src{font-size:12.5px;color:#6b7590;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    'button{font:inherit;color:inherit;cursor:pointer}',
    '.btn{display:inline-flex;align-items:center;justify-content:center;padding:9px 16px;border-radius:9px;border:1px solid #c5ccda;background:#fff;font-weight:650;font-size:14px;white-space:nowrap}',
    '.btn:hover{border-color:#6b7590}',
    '.btn.primary{background:#2550c8;border-color:#2550c8;color:#fff}',
    '.btn.primary:hover{filter:brightness(1.08)}',
    '.close{width:34px;height:34px;border:0;border-radius:9px;background:none;font-size:22px;line-height:1;color:#6b7590}',
    '.close:hover{background:#f2f4f8;color:#16213a}',
    '.stats{padding:8px 16px;font-size:12.5px;color:#6b7590;border-bottom:1px solid #dce1ea;background:#f7f8fb}',
    '.body{flex:1;overflow:auto;overscroll-behavior:contain}',
    '.state{height:100%;display:grid;place-content:center;justify-items:center;gap:12px;text-align:center;color:#4a5571;padding:24px}',
    '.spin{width:28px;height:28px;border:3px solid #c5ccda;border-top-color:#2550c8;border-radius:50%;animation:spin .8s linear infinite}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '.bar{height:4px;width:220px;border-radius:2px;background:#dce1ea;overflow:hidden}',
    '.bar i{display:block;height:100%;width:0;background:#2550c8;transition:width .15s}',
    '.notice{margin:12px 16px 0;padding:10px 12px;background:#fff3cc;color:#8a5a00;border-radius:8px;font-size:13.5px;font-weight:550}',
    'ol{list-style:none;margin:0;padding:0;min-height:100%;background:linear-gradient(to right,#f7f8fb 0,#f7f8fb 78px,#a9bdf3 78px,#a9bdf3 80px,#fff 80px)}',
    'li.row{display:grid;grid-template-columns:80px minmax(0,1fr) 40px;align-items:start;border-bottom:1px solid #dce1ea}',
    'li.meta{background:rgba(231,237,252,.55)}',
    'li.meta+li.row:not(.meta){border-top:2px solid #c5ccda}',
    '.tag{padding:13px 10px 8px 4px;text-align:right;font:500 11.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#2550c8}',
    '.copy{padding:10px 12px 11px 16px;min-width:0}',
    '.x{margin:8px 6px 0 0;width:28px;height:28px;border:0;border-radius:7px;background:none;color:#6b7590;font-size:18px;line-height:1;opacity:0}',
    'li.row:hover .x,.x:focus-visible{opacity:1}',
    '.x:hover{background:#fcebe9;color:#b42318}',
    '.label{font-size:11.5px;font-weight:650;color:#6b7590}',
    '.mv{font-family:Georgia,"Times New Roman",serif;overflow-wrap:anywhere;margin-top:2px}',
    '.mv.t{font-size:19px;font-weight:600;line-height:1.3}',
    '.mv.d{font-size:16px;line-height:1.5}',
    '.missing{color:#b42318;font-weight:650;font-family:inherit;font-size:14px}',
    '.count{font-size:12px;color:#6b7590;margin-top:3px}',
    '.count.over{color:#8a5a00;font-weight:650}',
    '.rich{font:400 16.5px/1.6 Georgia,"Times New Roman",serif;overflow-wrap:anywhere;color:#16213a}',
    '.rich h1,.rich h2,.rich h3,.rich h4,.rich h5,.rich h6{margin:0;font-weight:600;line-height:1.25;color:#16213a}',
    '.rich h1{font-size:27px}.rich h2{font-size:22px}.rich h3{font-size:19px}.rich h4,.rich h5,.rich h6{font-size:16.5px}',
    '.rich p,.rich ul,.rich ol,.rich dl,.rich table,.rich blockquote,.rich figure,.rich pre,.rich details{margin:0}',
    '.rich *+p,.rich *+ul,.rich *+ol,.rich *+table,.rich *+details{margin-top:7px}',
    '.rich ul,.rich ol{padding-left:22px;background:none;min-height:0}.rich ul{list-style:disc}.rich ol{list-style:decimal}',
    '.rich table{border-collapse:collapse;font:13.5px/1.45 system-ui,sans-serif;display:block;overflow-x:auto;max-width:100%}',
    '.rich th,.rich td{border:1px solid #c5ccda;padding:5px 8px;text-align:left;vertical-align:top}',
    '.rich blockquote{border-left:3px solid #c5ccda;padding-left:14px;font-style:italic}',
    '.rich a{color:#2550c8}',
    '.rich img,.rich .chip{display:none}',
    '.media{display:flex;flex-wrap:wrap;gap:12px 22px}',
    'figure{display:flex;gap:12px;align-items:center;margin:0;min-width:0}',
    '.thumb{flex:none;width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #dce1ea;background:#f7f8fb}',
    'figcaption{display:grid;gap:2px;min-width:0}',
    '.thumb.ph{display:grid;place-items:center;font:500 11px ui-monospace,Menlo,monospace;color:#6b7590;background:repeating-linear-gradient(135deg,#f7f8fb 0 6px,#f2f4f8 6px 12px)}',
    '.alt{font:italic 16px/1.4 Georgia,serif}',
    '.alt.bad{font:650 13.5px/1.4 system-ui,sans-serif;color:#b42318}',
    '.alt.quiet{font:13.5px/1.4 system-ui,sans-serif;color:#4a5571}',
    '.file{font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#6b7590;overflow-wrap:anywhere}',
    '.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:12px;align-items:center;background:#16213a;color:#fff;padding:11px 16px;border-radius:10px;font:650 14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)}',
    '.toast button{background:none;border:0;color:#ffe36e;font-weight:700;padding:0}',
    '.seg{display:inline-flex;padding:3px;gap:2px;border-radius:9px;background:#f2f4f8;border:1px solid #dce1ea}',
    '.seg button{border:0;background:none;padding:6px 12px;border-radius:7px;font-weight:600;font-size:13.5px;color:#4a5571}',
    '.seg button.on{background:#fff;color:#16213a;box-shadow:0 0 0 1px #c5ccda}',
    'pre{margin:0;min-height:100%;padding:16px 18px;background:#101a33;color:#dce4f5;font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;user-select:text}',
    '@media (max-width:640px){.panel{top:0;right:0;bottom:0;width:100vw;border-radius:0}ol{background:linear-gradient(to right,#f7f8fb 0,#f7f8fb 58px,#a9bdf3 58px,#a9bdf3 60px,#fff 60px)}li.row{grid-template-columns:60px minmax(0,1fr) 34px}.tag{font-size:10.5px}.x{opacity:.5}}',
  ].join('\n');

  function h(tag, cls, kids) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    (kids || []).forEach(function (k) { if (k == null) return; el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return el;
  }
  function clen(s) { return Array.from(s || '').length; }
  function hostPath(u) { try { var x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname === '/' ? '' : x.pathname.replace(/\/$/, '')); } catch (e) { return u; } }

  // shell
  // A custom element plus !important inline styles, so site rules (like Shopify's "div:empty { display: none }") can't hide it.
  var host = document.createElement('copy-backup-panel');
  host.id = ROOT_ID;
  ['all:initial', 'display:block', 'visibility:visible', 'opacity:1'].forEach(function (d) { var i = d.indexOf(':'); host.style.setProperty(d.slice(0, i), d.slice(i + 1), 'important'); });
  var shadow = host.attachShadow({ mode: 'open' });
  try { var sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); shadow.adoptedStyleSheets = [sheet]; }
  catch (e) { var st = document.createElement('style'); st.textContent = CSS; shadow.appendChild(st); }
  var scrim = h('div', 'scrim');
  var panel = h('div', 'panel');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Copy Backup');
  var closeBtn = h('button', 'close', ['×']); closeBtn.setAttribute('aria-label', 'Close Copy Backup'); closeBtn.title = 'Close (Esc)';
  var actions = h('div', null, []);
  actions.style.display = 'flex'; actions.style.gap = '8px';
  var head = h('div', 'head', [h('span', 'logo'), h('div', 'who', [h('span', 'name', ['Copy Backup']), h('span', 'src', [hostPath(location.href)])]), actions, closeBtn]);
  var body = h('div', 'body');
  var progress = h('i');
  var stateText = h('p', null, ['Loading the whole page…']);
  body.appendChild(h('div', 'state', [h('div', 'spin'), stateText, h('div', 'bar', [progress])]));
  panel.appendChild(head); panel.appendChild(body);
  shadow.appendChild(scrim); shadow.appendChild(panel);
  (document.body || document.documentElement).appendChild(host);

  var toastEl = null, toastTimer = null;
  function toast(text, undo) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    toastEl = h('div', 'toast', [text]);
    if (undo) { var u = h('button', null, ['Undo']); u.onclick = function () { undo(); toastEl.remove(); }; toastEl.appendChild(u); }
    shadow.appendChild(toastEl);
    toastTimer = setTimeout(function () { if (toastEl) toastEl.remove(); }, undo ? 6000 : 3500);
  }
  function close() { document.removeEventListener('keydown', onKey, true); host.remove(); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  document.addEventListener('keydown', onKey, true);
  closeBtn.onclick = close; scrim.onclick = close;

  function copyText(text) {
    var done = function () { toast('HTML copied.'); };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      shadow.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { }
      ta.remove(); toast(ok ? 'HTML copied.' : 'Your browser blocked copying. Use Download instead.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
    a.download = name; a.rel = 'noopener';
    shadow.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    toast('Backup downloaded.');
  }

  // 1. scroll through the page so lazy-loaded copy and images appear
  function loadWholePage() {
    var startY = window.scrollY, startX = window.scrollX;
    var max = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (max <= window.innerHeight * 1.4) return Promise.resolve();
    var y = 0, t0 = Date.now();
    return new Promise(function (resolve) {
      (function step() {
        max = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
        y += Math.round(window.innerHeight * 0.9);
        window.scrollTo(startX, Math.min(y, max));
        progress.style.width = Math.min(100, Math.round(y / max * 100)) + '%';
        if (y >= max || Date.now() - t0 > 6000) { setTimeout(function () { window.scrollTo(startX, startY); resolve(); }, 350); return; }
        setTimeout(step, 110);
      })();
    });
  }
  // 2. capture the rendered page, marking what is hidden on screen
  function capture() {
    var marked = [], all = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < all.length; i++) {
      if (host.contains(all[i])) continue;
      var cs = window.getComputedStyle(all[i]);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) { all[i].setAttribute('data-cb-hidden', '1'); marked.push(all[i]); }
    }
    host.remove();
    var src = '\x3c!-- copy-backup-capture url="' + encodeURI(location.href) + '" captured="' + new Date().toISOString() + '" hidden="1" --\x3e\n<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    (document.body || document.documentElement).appendChild(host);
    for (var j = 0; j < marked.length; j++) marked[j].removeAttribute('data-cb-hidden');
    return src;
  }
  function extractBest(src) {
    var env = { DOMParser: Parser, url: location.href, sourceType: 'capture' };
    var tries = [OPTS, Object.assign({}, OPTS, { area: 'main' }), Object.assign({}, OPTS, { area: 'custom', customRoot: 'body' })], first = null;
    for (var i = 0; i < tries.length; i++) { var r = CB.extract(src, tries[i], env); if (!first) first = r; if (r.blocks.length) return r; }
    return first;
  }

  // 3. show the backup
  function render(r, src) {
    var excluded = new Set();
    var imgs = {}; r.images.forEach(function (im) { imgs[im.seq] = im; });
    var missingAlt = r.images.filter(function (i) { return i.status === 'missing'; }).length;
    var dl = h('button', 'btn primary', ['Download']), cp = h('button', 'btn', ['Copy HTML']);
    var vPrev = h('button', 'on', ['Preview']), vHtml = h('button', null, ['HTML']);
    actions.appendChild(h('div', 'seg', [vPrev, vHtml])); actions.appendChild(cp); actions.appendChild(dl);
    var esc = function (t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    // Clean HTML: meta title and description first, then the copy in page order.
    var snippet = function () {
      return '<title>' + esc(r.meta.title) + '</title>\n<meta name="description" content="' + esc(r.meta.description) + '">\n\n' + CB.exportBackup(r, excluded, OPTS).contentHtml + '\n';
    };
    var pre = h('pre');
    var show = function (which) {
      vPrev.className = which === 'html' ? '' : 'on'; vHtml.className = which === 'html' ? 'on' : '';
      if (which === 'html') { pre.textContent = snippet(); list.style.display = 'none'; pre.style.display = ''; }
      else { list.style.display = ''; pre.style.display = 'none'; }
      body.scrollTop = 0;
    };
    vPrev.onclick = function () { show('preview'); }; vHtml.onclick = function () { show('html'); };
    dl.onclick = function () { download(CB.buildFilename(r, 'html'), CB.exportBackup(r, excluded, OPTS).fullHtml); };
    cp.onclick = function () { copyText(snippet()); };
    var stats = h('div', 'stats', [r.words + ' words · ' + r.images.length + (r.images.length === 1 ? ' image' : ' images') + (missingAlt ? ' · ' + missingAlt + ' without alt text' : '')]);
    panel.insertBefore(stats, body);
    body.textContent = '';
    var warn = r.checks.filter(function (c) { return c.level === 'error'; })[0];
    if (warn) body.appendChild(h('p', 'notice', [warn.text]));
    var list = h('ol');
    function metaRow(tag, label, value, kind, max) {
      var n = clen(value), over = value && n > max;
      return h('li', 'row meta', [h('div', 'tag', [tag]), h('div', 'copy', [h('p', 'label', [label]),
        value ? h('p', 'mv ' + kind, [value]) : h('p', 'mv missing', ['Missing']),
        value ? h('p', 'count' + (over ? ' over' : ''), [n + ' characters' + (over ? ' · may be cut off in Google' : '')]) : null]), h('span')]);
    }
    list.appendChild(metaRow('title', 'Meta title', r.meta.title, 't', 60));
    list.appendChild(metaRow('meta', 'Meta description', r.meta.description, 'd', 160));
    r.blocks.forEach(function (b) {
      var content;
      if (b.kind === 'media') {
        content = h('div', 'media', b.imgs.map(function (s) {
          var im = imgs[s]; if (!im) return null;
          var t = document.createElement('img'); t.className = 'thumb'; t.alt = ''; t.loading = 'lazy'; t.src = im.src;
          t.onerror = function () { t.replaceWith(h('div', 'thumb ph', ['img'])); };
          var alt = im.kind === 'bg' ? h('span', 'alt quiet', ['Background image']) : im.alt === null ? h('span', 'alt bad', ['No alt text']) : !im.alt.trim() ? h('span', 'alt quiet', ['Empty alt (decorative)']) : h('span', 'alt', ['“' + im.alt + '”']);
          return h('figure', null, [t, h('figcaption', null, [alt, h('span', 'file', [im.file])])]);
        }));
      } else {
        content = h('div', 'rich');
        try { content.innerHTML = asHTML(b.html); } catch (e) { content.textContent = b.text; }
      }
      var x = h('button', 'x', ['×']); x.title = 'Leave out of the backup'; x.setAttribute('aria-label', 'Leave this block out of the backup');
      var row = h('li', 'row', [h('div', 'tag', [b.kind === 'media' ? 'img' : b.label]), h('div', 'copy', [content]), x]);
      x.onclick = function () { excluded.add(b.idx); row.style.display = 'none'; toast('Left out of the backup.', function () { excluded.delete(b.idx); row.style.display = ''; }); };
      content.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) e.preventDefault(); });
      list.appendChild(row);
    });
    if (!r.blocks.length) list.appendChild(h('li', 'row', [h('div', 'tag', ['copy']), h('div', 'copy', [h('p', 'mv missing', ['No page copy could be read'])]), h('span')]));
    body.appendChild(list);
    pre.style.display = 'none'; body.appendChild(pre);
    dl.focus();
  }

  // if anything above fails (very strict sites), copy the page for the Copy Backup site instead
  function fallback(src, err) {
    body.textContent = '';
    var copied = false;
    var finish = function (ok) {
      copied = ok;
      body.appendChild(h('div', 'state', [h('p', null, [ok ? 'This site doesn’t allow the backup to open here, so the page was copied instead.' : 'This site doesn’t allow the backup to open here.']),
        h('p', null, [ok ? 'Open Copy Backup and press Ctrl+V (⌘V on Mac).' : 'Open Copy Backup to try another way.']),
        (function () { var a = h('a', 'btn primary', ['Open Copy Backup']); a.href = TOOL_URL; a.target = '_blank'; a.rel = 'noopener'; return a; })()]));
    };
    if (src && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(src).then(function () { finish(true); }, function () { finish(false); });
    else finish(false);
    if (window.console) console.warn('Copy Backup:', err);
  }

  var source = '';
  setTimeout(function () {
    loadWholePage().then(function () {
      stateText.textContent = 'Reading the copy…';
      return new Promise(function (r) { setTimeout(r, 30); });
    }).then(function () {
      source = capture();
      render(extractBest(source), source);
    }).catch(function (e) { fallback(source || (function () { try { return capture(); } catch (x) { return ''; } })(), e); });
  }, 60);
})();
