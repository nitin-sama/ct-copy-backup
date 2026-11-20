/* ===== Copy Backup home (get the button + paste fallback) ===== */
(function () {
  'use strict';
  var R = React;
  var useState = R.useState, useEffect = R.useEffect, useMemo = R.useMemo, useRef = R.useRef;
  var html = htm.bind(R.createElement);

  var BOOKMARK_HREF = __BOOKMARK__;
  var IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
  var downloadsReady = IN_CLAUDE ? Promise.resolve().then(function () { return window.claude.use('downloads'); }).catch(function () { return null; }) : Promise.resolve(null);
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var BAR_KEY = IS_MAC ? '⌘⇧B' : 'Ctrl+Shift+B';
  var PASTE_KEY = IS_MAC ? '⌘V' : 'Ctrl+V';
  var OPTS = Object.assign({}, CB.DEFAULT_OPTS, { metaExtras: false });

  function clen(s) { return Array.from(s || '').length; }
  function hostPath(u) { try { var x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname === '/' ? '' : x.pathname.replace(/\/$/, '')); } catch (e) { return u || ''; } }
  function inField(t) { return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')); }
  function extractBest(text, env) {
    var tries = [OPTS, Object.assign({}, OPTS, { area: 'main' }), Object.assign({}, OPTS, { area: 'custom', customRoot: 'body' })], first = null;
    for (var i = 0; i < tries.length; i++) { var r = CB.extract(text, tries[i], env); if (!first) first = r; if (r.blocks.length) return r; }
    return first;
  }
  function saveFile(filename, data) {
    return downloadsReady.then(function (d) {
      if (d) return d.save({ filename: filename, data: data }).then(function () { return true; }, function () { return false; });
      if (IN_CLAUDE) return false;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' })); a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return true;
    });
  }
  function copyText(text) {
    var api = (navigator.clipboard && window.isSecureContext) ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; }) : Promise.resolve(false);
    return api.then(function (ok) {
      if (ok) return true;
      try { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;'; document.body.appendChild(ta); ta.select(); var d = document.execCommand('copy'); ta.remove(); return !!d; } catch (e) { return false; }
    });
  }

  function BookmarkButton(props) {
    var ref = useRef(null);
    useEffect(function () { if (ref.current) ref.current.setAttribute('href', BOOKMARK_HREF); }, []);
    return html`<a ref=${ref} className="bm" draggable="true" title="Drag me to your bookmarks bar"
      onClick=${function (e) { e.preventDefault(); props.onClickInstead(); }}><span className="bm-grip" aria-hidden="true">⠿</span><span className="bm-logo" aria-hidden="true"></span>Copy Backup</a>`;
  }

  function Thumb(props) {
    var st = useState(!props.src || props.local), bad = st[0], setBad = st[1];
    if (bad) return html`<div className="thumb ph" aria-hidden="true">img</div>`;
    return html`<img className="thumb" src=${props.src} alt="" loading="lazy" referrerPolicy="no-referrer" onError=${function () { setBad(true); }} />`;
  }
  function MetaRow(props) {
    var n = clen(props.value), over = !!props.value && n > props.max;
    return html`<li className="prow meta"><div className="gutter"><span className="tag">${props.tag}</span></div>
      <div className="copy"><p className="meta-label">${props.label}</p>
        ${props.value ? html`<p className=${'meta-value ' + props.kind}>${props.value}</p>` : html`<p className="meta-value missing">Missing</p>`}
        ${props.value ? html`<p className=${'meta-count' + (over ? ' over' : '')}>${n} characters${over ? ' · may be cut off in Google' : ''}</p>` : null}</div><span></span></li>`;
  }
  function escHtml(t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // Clean HTML: meta title and description first, then the copy in page order.
  function snippetOf(r, exp) { return '<title>' + escHtml(r.meta.title) + '</title>\n<meta name="description" content="' + escHtml(r.meta.description) + '">\n\n' + exp.contentHtml + '\n'; }
  function Result(props) {
    var r = props.r, excluded = props.excluded;
    var vs = useState('preview'), view = vs[0], setView = vs[1];
    var imgs = useMemo(function () { var m = {}; r.images.forEach(function (i) { m[i.seq] = i; }); return m; }, [r]);
    var missingAlt = r.images.filter(function (i) { return i.status === 'missing'; }).length;
    var warn = r.checks.filter(function (c) { return c.level === 'error'; })[0];
    return html`<section className="doc">
      <div className="doc-bar">
        <div className="doc-src">${r.pageUrl ? html`<a href=${r.pageUrl} target="_blank" rel="noopener noreferrer">${hostPath(r.pageUrl)}</a>` : html`<span>Pasted page</span>`}
          <span className="doc-stats">${r.words} words · ${r.images.length} ${r.images.length === 1 ? 'image' : 'images'}${missingAlt ? ' · ' + missingAlt + ' without alt text' : ''}</span></div>
        <div className="seg" role="radiogroup" aria-label="View">
          <button role="radio" aria-checked=${view === 'preview' ? 'true' : 'false'} className=${view === 'preview' ? 'on' : ''} onClick=${function () { setView('preview'); }}>Preview</button>
          <button role="radio" aria-checked=${view === 'html' ? 'true' : 'false'} className=${view === 'html' ? 'on' : ''} onClick=${function () { setView('html'); }}>HTML</button>
        </div>
        <button className="btn" onClick=${props.onCopy}>Copy HTML</button>
        <button className="btn primary" onClick=${props.onDownload}>Download</button>
      </div>
      ${view === 'html' ? html`<div className="doc-scroll"><pre className="code">${props.snippet}</pre></div>` : null}
      <div className="doc-scroll" hidden=${view === 'html'}>
        ${warn ? html`<p className="notice">${warn.text}</p>` : null}
        <ol className="proof">
          <${MetaRow} tag="title" label="Meta title" value=${r.meta.title} kind="t" max=${60} />
          <${MetaRow} tag="meta" label="Meta description" value=${r.meta.description} kind="d" max=${160} />
          ${r.blocks.filter(function (b) { return !excluded.has(b.idx); }).map(function (b) {
            return html`<li key=${b.idx} className=${'prow' + (b.level ? ' lv' + b.level : '')}><div className="gutter"><span className="tag">${b.kind === 'media' ? 'img' : b.label}</span></div>
              <div className="copy">${b.kind === 'media' ? html`<div className="media-list">${b.imgs.map(function (s) {
                var im = imgs[s]; if (!im) return null;
                return html`<figure key=${s} className="imgcard"><${Thumb} src=${im.src} local=${im.local} /><figcaption>${im.kind === 'bg' ? html`<span className="alt quiet">Background image</span>` : im.alt === null ? html`<span className="alt bad">No alt text</span>` : !im.alt.trim() ? html`<span className="alt quiet">Empty alt (decorative)</span>` : html`<span className="alt">“${im.alt}”</span>`}<span className="file">${im.file}</span></figcaption></figure>`;
              })}</div>` : html`<div className="rich" dangerouslySetInnerHTML=${{ __html: b.html }}></div>`}</div>
              <button className="x" title="Leave out of the backup" aria-label="Leave this block out of the backup" onClick=${function () { props.onRemove(b.idx); }}>×</button></li>`;
          })}
          ${r.blocks.length === 0 ? html`<li className="prow"><div className="gutter"><span className="tag">copy</span></div><div className="copy"><p className="meta-value missing">No page copy could be read</p></div><span></span></li>` : null}
        </ol>
      </div>
    </section>`;
  }

  function Home(props) {
    return html`<main className="home">
      <div className="hero">
        <span className="logo big" aria-hidden="true"></span>
        <h1>Copy Backup</h1>
        <p className="tagline">Back up any page’s meta title, description and copy in one click, right on the page.</p>
      </div>
      <ol className="steps">
        <li className="step">
          <span className="num" aria-hidden="true">1</span>
          <div className="step-body">
            <h2>Add the button <span className="once">one time</span></h2>
            <p>Drag this button up to your bookmarks bar.</p>
            <div className="demo" aria-hidden="true">
              <div className="demo-browser"><span className="dots"><i></i><i></i><i></i></span><span className="demo-url"></span></div>
              <div className="demo-bar"><span className="demo-mark"></span><span className="demo-mark short"></span><span className="demo-drop"><span className="bm-logo"></span>Copy Backup</span></div>
            </div>
            <div className="bm-row"><${BookmarkButton} onClickInstead=${props.onClickInstead} /><span className="arrow" aria-hidden="true">↑ drag up</span></div>
            <p className="small">No bookmarks bar? Press ${BAR_KEY}. Can’t drag? <button className="link" onClick=${props.onCopyCode}>Copy the button</button>, then add a bookmark and paste it as the address.</p>
          </div>
        </li>
        <li className="step">
          <span className="num" aria-hidden="true">2</span>
          <div className="step-body">
            <h2>Click it on any page</h2>
            <p>Open the page you want to back up and click <b>Copy Backup</b> in your bookmarks bar. A panel opens on that page with the meta title, description and all the copy. Click <b>Download</b>.</p>
            <div className="mini" aria-hidden="true">
              <div className="mini-page"><i></i><i></i><i className="short"></i><i></i><i className="short"></i></div>
              <div className="mini-panel"><span className="mini-btn"></span><b>title</b><b>meta</b><b>h1</b><b>p</b><b>img</b></div>
            </div>
          </div>
        </li>
      </ol>
      <p className="fallback">If a site says the page was copied instead, press ${PASTE_KEY} here to see the backup.</p>
    </main>`;
  }

  function App() {
    var es = useState(null), entry = es[0], setEntry = es[1];
    var xs = useState(function () { return new Set(); }), excluded = xs[0], setExcluded = xs[1];
    var ts = useState(null), toast = ts[0], setToast = ts[1];
    useEffect(function () { if (!toast) return; var t = setTimeout(function () { setToast(null); }, toast.undo !== undefined ? 6000 : 4000); return function () { clearTimeout(t); }; }, [toast]);

    function load(text, label) {
      if (!CB.looksLikeHtml(text)) { setToast({ text: 'That isn’t a copied page. Click the Copy Backup button on the page first.' }); return; }
      try { setEntry({ r: extractBest(text, { sourceType: 'paste' }), label: label }); setExcluded(new Set()); }
      catch (e) { setToast({ text: e.message }); }
    }
    useEffect(function () {
      function onPaste(e) { if (inField(e.target)) return; var t = e.clipboardData && e.clipboardData.getData('text/plain'); if (!t) return; e.preventDefault(); load(t); }
      function over(e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); }
      function drop(e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault();
        f.arrayBuffer().then(function (buf) { load(CB.decodeFile(buf, f.name).html, f.name); }).catch(function (er) { setToast({ text: er.message }); });
      }
      window.addEventListener('paste', onPaste); window.addEventListener('dragover', over); window.addEventListener('drop', drop);
      return function () { window.removeEventListener('paste', onPaste); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
    }, []);

    var exp = useMemo(function () { return entry ? CB.exportBackup(entry.r, excluded, OPTS) : null; }, [entry, excluded]);
    function copyCode() { copyText(BOOKMARK_HREF).then(function (ok) { setToast({ text: ok ? 'Button copied. Add a new bookmark and paste it as the address (URL).' : 'Copying was blocked. Drag the button instead.' }); }); }

    return html`<div className="app">
      ${entry ? html`<header className="top"><button className="brand" onClick=${function () { setEntry(null); }} aria-label="Back to Copy Backup home"><span className="logo" aria-hidden="true"></span><span>Copy Backup</span></button></header>
        <div className="stage"><${Result} r=${entry.r} excluded=${excluded} snippet=${exp ? snippetOf(entry.r, exp) : ''}
          onRemove=${function (idx) { setExcluded(function (s) { var n = new Set(s); n.add(idx); return n; }); setToast({ text: 'Left out of the backup.', undo: idx }); }}
          onDownload=${function () { saveFile(CB.buildFilename(entry.r, 'html'), exp.fullHtml).then(function (ok) { setToast({ text: ok ? 'Backup downloaded.' : 'Download isn’t available here. Use Copy instead.' }); }); }}
          onCopy=${function () { copyText(snippetOf(entry.r, exp)).then(function (ok) { setToast({ text: ok ? 'HTML copied.' : 'Copying was blocked. Use Download instead.' }); }); }} /></div>`
      : html`<${Home} onCopyCode=${copyCode} onClickInstead=${function () { setToast({ text: 'Drag this button to your bookmarks bar, then click it on the page you want to back up.' }); }} />`}
      <div className="toast-wrap" aria-live="polite">${toast ? html`<div className="toast">${toast.text}${toast.undo !== undefined ? html` <button onClick=${function () { setExcluded(function (s) { var n = new Set(s); n.delete(toast.undo); return n; }); setToast(null); }}>Undo</button>` : null}</div>` : null}</div>
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById('app')).render(html`<${App} />`);
})();
