/* ===== Copy Backup engine ===== */
var CB = (function () {
  'use strict';

  var DEFAULT_OPTS = {
    area: 'auto',            // auto | main | custom
    customRoot: '',
    customExclude: '',
    products: true,
    breadcrumbs: true,
    forms: true,
    sidebars: true,
    reviews: true,
    popups: true,
    dedupe: true,
    hidden: false,
    icons: true,
    links: true,
    embeds: true,
    bgImages: true,
    keepSections: true,
    ariaHeadings: true,
    inventory: true,
    metaExtras: true
  };

  /* ---------- small helpers ---------- */
  var WS = /[ \t\n\r\f]+/g;
  function normText(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function clen(s) { return Array.from(s || '').length; }
  function hasText(n) { return !!n && /\S/.test(n.textContent || ''); }
  function spacedText(el) {
    if (!el) return '';
    if (el.nodeType === 3) return normText(el.nodeValue);
    var parts = [];
    (function w(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) parts.push(c.nodeValue);
        else if (c.nodeType === 1) {
          var b = c.localName === 'br' || c.localName === 'img' || BLOCK_OUT.has(c.localName) || BLOCKISH_UNWRAP.has(c.localName) || c.localName.indexOf('-') > 0;
          if (b) parts.push(' ');
          w(c);
          if (b) parts.push(' ');
        }
      }
    })(el);
    return normText(parts.join(''));
  }
  function snip(s, n) { s = normText(s); n = n || 140; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function cls(el) { var c = el.getAttribute('class'); return c || ''; }
  function sigOf(el) { return (cls(el) + ' ' + (el.getAttribute('id') || '')).toLowerCase(); }
  function tokRe(list) { return new RegExp('(?:^|[\\s_-])(?:' + list.join('|') + ')(?:$|[\\s_-])', 'i'); }
  function arr(x) { return Array.prototype.slice.call(x || []); }
  function isHttp(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
  function safeDecode(u) { try { return decodeURI(u); } catch (e) { return u; } }
  function before(a, b) { return !!(a.compareDocumentPosition(b) & 4); } // b follows a
  function sortDoc(list) { return list.sort(function (a, b) { return a === b ? 0 : (before(a, b) ? -1 : 1); }); }
  function outermost(list) { return list.filter(function (c) { return !list.some(function (o) { return o !== c && o.contains(c); }); }); }

  function normalizeUrl(u) {
    u = (u || '').trim();
    if (!u) return '';
    if (/^\/\//.test(u)) u = 'https:' + u;
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    try { return new URL(u).href; } catch (e) { return ''; }
  }
  function urlKey(u) {
    try {
      var x = new URL(u);
      return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
    } catch (e) { return (u || '').toLowerCase(); }
  }
  function sameUrl(a, b) { return urlKey(a) === urlKey(b); }

  function looksLikeHtml(s) {
    if (typeof s !== 'string') return false;
    var h = s.slice(0, 5000).trim();
    return /<(!doctype|html|head|body|main|div|section|article|p|h[1-6]|meta|title|!--)[\s>]/i.test(h);
  }

  /* ---------- tag tables ---------- */
  var HEADING = /^h[1-6]$/;
  var BLOCK_OUT = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'caption',
    'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'blockquote', 'figure', 'figcaption', 'pre', 'hr', 'address', 'details',
    'summary', 'section', 'article', 'header', 'footer', 'aside']);
  var SECTIONING = new Set(['section', 'article', 'header', 'footer', 'aside']);
  var BLOCK_KEEP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'caption',
    'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'blockquote', 'figure', 'figcaption', 'pre', 'address', 'details', 'summary']);
  var INLINE_KEEP = new Set(['a', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup', 'abbr', 'cite', 'q',
    'code', 'time', 'dfn', 'kbd', 'samp', 'var', 'del', 'ins', 'bdi', 'bdo']);
  var TAG_MAP = { strike: 's', acronym: 'abbr' };
  var DROP_ALWAYS = new Set(['script', 'style', 'template', 'svg', 'canvas', 'object', 'param', 'source', 'track', 'map',
    'area', 'link', 'meta', 'base', 'title', 'head', 'input', 'select', 'textarea', 'option', 'optgroup', 'datalist',
    'progress', 'meter', 'noscript', 'frame', 'frameset', 'math', 'slot', 'portal']);
  var BLOCKISH_UNWRAP = new Set(['div', 'center', 'main', 'form', 'fieldset', 'legend', 'hgroup', 'search', 'menu', 'dir',
    'body', 'html', 'nav', 'dialog', 'listing', 'xmp', 'marquee']);
  var TABLE_PART = new Set(['thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption']);
  var MODE = {
    h1: 'inline', h2: 'inline', h3: 'inline', h4: 'inline', h5: 'inline', h6: 'inline', p: 'inline', dt: 'inline',
    summary: 'inline', caption: 'inline',
    li: 'item', dd: 'item', td: 'item', th: 'item', figcaption: 'item', address: 'item',
    blockquote: 'flow', figure: 'flow', details: 'flow', section: 'flow', article: 'flow', header: 'flow', footer: 'flow', aside: 'flow',
    ul: 'list', ol: 'list', dl: 'dl', table: 'table', thead: 'table', tbody: 'table', tfoot: 'table', tr: 'table', pre: 'pre'
  };
  var ATTRS = {
    a: ['href', 'title', 'rel', 'target', 'hreflang'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['colspan', 'rowspan', 'scope', 'abbr'], td: ['colspan', 'rowspan', 'headers'],
    ol: ['start', 'reversed', 'type'], li: ['value'], time: ['datetime'], q: ['cite'], blockquote: ['cite'],
    del: ['cite', 'datetime'], ins: ['cite', 'datetime'], abbr: ['title'], dfn: ['title'], bdo: ['dir']
  };
  var LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-lazy', 'data-original', 'data-original-src', 'data-echo', 'data-img-src', 'data-ll-src'];

  /* ---------- noise patterns ---------- */
  var OVERLAY_RE = tokRe(['cookies?', 'cookie-banner', 'cookie-consent', 'consent', 'gdpr', 'ccpa', 'onetrust', 'optanon\\w*',
    'cookiebot\\w*', 'cybotcookiebot\\w*', 'truste', 'didomi\\w*', 'usercentrics\\w*', 'osano\\w*', 'iubenda\\w*', 'termly\\w*',
    'modal', 'popup', 'pop-up', 'newsletter-popup', 'exit-intent', 'klaviyo-form\\w*', 'privy\\w*', 'justuno\\w*', 'wisepops',
    'optinmonster', 'intercom\\w*', 'drift-\\w+', 'zendesk\\w*', 'tawk\\w*', 'livechat\\w*', 'crisp-client', 'hubspot-messages\\w*',
    'chat-widget', 'chatbot', 'freshchat\\w*', 'tidio\\w*', 'gorgias\\w*', 'adsbygoogle', 'advert', 'advertisement', 'ad-slot',
    'ad-container', 'ad-wrapper', 'ad-unit', 'adunit', 'dfp', 'gpt-ad', 'google-ad', 'sponsored', 'announcement',
    'announcement-bar', 'promo-bar', 'topbar', 'top-bar', 'notification-bar', 'site-notice', 'back-to-top', 'scroll-to-top',
    'menu-drawer', 'cart-drawer', 'search-drawer', 'nav-drawer', 'filter-drawer', 'mobile-drawer', 'offcanvas', 'off-canvas',
    'mobile-menu', 'mobile-nav', 'mega-menu', 'megamenu', 'mini-cart', 'minicart', 'side-cart', 'search-overlay', 'search-modal',
    'predictive-search', 'quick-view', 'quickview', 'toast']);
  var REVIEW_RE = tokRe(['reviews', 'review-list', 'product-reviews', 'customer-reviews', 'ratings', 'rating-summary', 'star-rating',
    'rating', 'stars', 'product-rating', 'review-stars', 'rating-stars', 'yotpo\\w*', 'bv', 'bazaarvoice', 'trustpilot\\w*', 'okendo\\w*', 'okereviews\\w*', 'stamped\\w*', 'jdgm\\w*', 'judgeme\\w*',
    'loox\\w*', 'feefo\\w*', 'reevoo', 'comments', 'comment-list', 'comment-respond', 'disqus\\w*', 'share', 'share-buttons',
    'social-share', 'sharing', 'sharethis\\w*', 'addthis\\w*', 'a2a_kit', 'shariff', 'social-icons', 'social-links', 'social-media']);
  var REVIEW_ID_RE = /^(comments|respond|disqus_thread|reviews|shopify-product-reviews|judgeme_product_reviews|yotpo.*|bv.*)$/i;
  var SIDEBAR_RE = tokRe(['sidebar', 'side-bar', 'widget-area', 'widgetarea']);
  var SIDEBAR_ID_RE = /^(secondary|sidebar|side-bar|left-sidebar|right-sidebar)$/i;
  var FILTERS_RE = tokRe(['facets?', 'filters', 'filter-bar', 'filter-panel', 'filter-sidebar', 'refinements?', 'sort-by', 'sortby',
    'toolbar-sorter', 'toolbar-products', 'sort', 'sorting', 'sort-options', 'sorter', 'view-mode', 'limiter', 'results-count', 'product-count', 'collection-filters', 'plp-filters', 'faceted']);
  var PRODUCT_LIST_RE = tokRe(['products', 'product-grid', 'product-list', 'product-listing', 'product-tiles?', 'product-cards?',
    'product-carousel', 'product-slider', 'product-feed', 'product-recommendations?', 'productgrid', 'productlist', 'products-grid',
    'products-list', 'products-carousel', 'products-slider', 'plp-grid', 'grid-products', 'collection-grid', 'collection-products',
    'collection-list', 'search-results', 'recommendations?', 'recommended-products', 'recently-viewed', 'recentlyviewed',
    'upsells?', 'up-sells?', 'cross-sells?', 'crosssells?', 'related-products', 'you-may-also-like', 'ymal', 'shop-the-look',
    'complete-the-look', 'bestsellers?', 'best-sellers?', 'featured-products?', 'featured-collection', 'product-item',
    'product-tile', 'product-card']);
  var PRICE_CLS_RE = tokRe(['price', 'prices', 'price-box', 'price-wrapper', 'price-container', 'product-price', 'price-item',
    'sale-price', 'regular-price', 'compare-at-price', 'special-price', 'old-price', 'was-price', 'now-price', 'money']);
  var BUYBOX_RE = tokRe(['add-to-cart', 'addtocart', 'add-to-bag', 'buy-buttons', 'buy-box', 'buybox', 'product-form',
    'product__form', 'variant-picker', 'variant-selector', 'variant-selects', 'swatch', 'swatches', 'size-selector', 'quantity',
    'qty', 'quantity-selector', 'product-actions', 'wishlist', 'add-to-wishlist', 'stock-status', 'delivery-estimate', 'pincode',
    'pin-code', 'store-availability', 'product__policies', 'product-single__policies', 'product-policies', 'product__tax', 'tax-note', 'price-per-item', 'klarna\\w*', 'afterpay\\w*', 'affirm\\w*', 'shop-pay\\w*', 'payment-icons', 'installments?']);
  var CHROME_RE = tokRe(['noprint', 'no-print', 'd-print-none', 'print-hidden', 'hidden-print', 'mw-editsection', 'editsection', 'mw-jump-link',
    'toc', 'vector-toc', 'navbox', 'vertical-navbox', 'catlinks', 'printfooter', 'mw-indicators', 'ambox', 'mbox-small', 'navigation-not-searchable',
    'sistersitebox', 'mw-portlet-lang', 'vector-dropdown', 'interlanguage', 'interlanguage-link', 'language-switcher', 'lang-switcher', 'language-selector',
    'language-picker', 'locale-switcher', 'country-selector']);
  var CLONE_RE = /(^|\s)(slick-cloned|swiper-slide-duplicate|cloned|splide__slide--clone|glide__slide--clone|is-clone)(\s|$)/i;
  var BREAD_RE = /breadcrumb/i;
  var NAV_SIG_RE = tokRe(['pagination', 'pager', 'paginate', 'skip-link', 'skip-to-content', 'skiplink', 'skip-nav']);
  var ICON_FONT_RE = /(^|\s)(material-icons(-\w+)?|material-symbols(-\w+)?|fa|fas|far|fab|fal|fad|fa-solid|fa-regular|fa-brands|fa-light|glyphicon|bi|icofont|ti|lni|dashicons|ionicon|ion-[\w-]+)(\s|$)/i;
  var ICON_GENERIC_RE = /(^|\s)(icon|icons|icon-[\w-]+|svg-icon)(\s|$)/i;
  var TRACK_SRC_RE = /(facebook\.com\/tr|google-analytics\.com|googletagmanager\.com|doubleclick\.net|bat\.bing\.com|linkedin\.com\/px|px\.ads\.linkedin|analytics\.twitter|t\.co\/i\/adsct|scorecardresearch|quantserve|googleadservices|adservice\.google|ct\.pinterest|tr\.snapchat|q\.quora|criteo|taboola|outbrain|\/pixel(\.gif)?(\?|$))/i;
  var HIDDEN_CLS_RE = /(^|\s)(hidden|is-hidden|d-none|hide|visually-hidden|sr-only|screen-reader-text|invisible)(\s|$)/i;
  var RESPONSIVE_SHOW_RE = /(^|\s)(d-(sm|md|lg|xl|xxl)-(block|flex|inline|inline-block|grid|table)|(sm|md|lg|xl|2xl):(block|flex|grid|inline|inline-block|table|contents))(\s|$)/i;
  var PRICE_RE = /(?:₹|\$|€|£|¥|₩|₽|₺|₫|฿|₱|₦|R\$|Rs\.?|INR|USD|EUR|GBP|AED|SAR|QAR|AUD|CAD|SGD|CHF)\s?\d|\d[\d.,]*\s?(?:₹|€|£|kr|zł|Kč|Ft|lei|лв|AED|SAR|INR|USD|EUR|GBP|CHF)(?![a-z])/i;
  var PRICE_RE_G = new RegExp(PRICE_RE.source, 'gi');
  var CART_RE = /\b(add to (cart|bag|basket)|quick (view|add|shop)|buy now|choose options|select options)\b/i;
  var BLOCKPAGE_RE = /\b(just a moment|attention required|access denied|are you a (robot|human)|verify(ing)? (that )?you are (a )?human|captcha|request blocked|request unsuccessful|pardon our interruption|403 forbidden|bot detection|client challenge|checking (your|if the site connection)|security check|one more step|please enable (javascript|cookies)|enable javascript and cookies|ddos protection)\b/i;
  var BLOCKPAGE_SRC_RE = /cdn-cgi\/challenge-platform|challenges\.cloudflare\.com|\/_fs-ch-|captcha-delivery\.com|_Incapsula_Resource|px-captcha|perimeterx|\/_sec\/cp_challenge|ak-challenge/i;
  var LOCAL_SAVE_RE = /^(\.\/)?[^\/?#]+_files\//i;

  function isHiddenEl(el) {
    if (el.hasAttribute('hidden') || el.hasAttribute('data-cb-hidden')) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (/(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(el.getAttribute('style') || '')) return true;
    var c = cls(el);
    return HIDDEN_CLS_RE.test(c) && !RESPONSIVE_SHOW_RE.test(c);
  }
  function bigCopy(el) {
    var t = normText(el.textContent).length;
    return t > 1500 || (t > 600 && el.querySelectorAll('h1,h2,h3,h4').length >= 2);
  }
  function isAccordionTrigger(el) {
    var t = normText(el.textContent);
    if (t.length < 4 || t.length > 240 || /^(menu|close|open|search|sort( by)?|filter|filters|cart|bag|show more|load more|view all|next|previous|prev|×|x)$/i.test(t)) return false;
    return el.hasAttribute('aria-expanded') || el.hasAttribute('aria-controls') ||
      !!el.closest('[class*="accordion"],[class*="Accordion"],[class*="faq"],[class*="Faq"],[class*="FAQ"],[class*="collapsible"],[class*="toggle"],[id*="faq"],[id*="accordion"],details');
  }
  function numAttr(el, a) { var v = parseInt(el.getAttribute(a), 10); return isNaN(v) ? null : v; }
  function tileLike(el) {
    var t = el.textContent || '';
    if (t.length > 900 || normText(t).length > 600) return false;
    var hasImg = el.localName === 'img' || !!el.querySelector('img,picture,[data-bg],[style*="background"]');
    var hasLink = el.localName === 'a' || !!el.querySelector('a[href]');
    var hasPrice = PRICE_RE.test(t) || !!el.querySelector('[class*="price"],[class*="Price"],[itemprop="price"],[data-price]');
    var hasCart = CART_RE.test(t);
    return hasImg && hasLink && (hasPrice || hasCart);
  }
  function isListing(el) {
    var kids = arr(el.children);
    if (kids.length < 3) return false;
    var n = 0;
    for (var i = 0; i < kids.length; i++) if (tileLike(kids[i])) n++;
    return n >= 3 && n / kids.length >= 0.6;
  }
  function chromeScore(el, kind) {
    var s = 0, sig = sigOf(el);
    if ((el.getAttribute('role') || '') === (kind === 'header' ? 'banner' : 'contentinfo')) s += 2;
    if (el.querySelector('nav,[role="navigation"]')) s += 2;
    if (el.querySelectorAll('a[href]').length >= 4) s += 1;
    if (kind === 'header' ? /header|masthead|navbar|banner/.test(sig) : /footer|colophon/.test(sig)) s += 1;
    if (kind === 'footer' && /©|copyright|all rights reserved/i.test(el.textContent || '')) s += 1;
    return s;
  }
  var SECTION_ANCESTORS = 'article,aside,main,nav,section,[role="main"],[role="article"]';
  function isPageLandmark(el, kind) {
    var tag = el.localName, role = el.getAttribute('role') || '';
    var match = kind === 'header' ? (role === 'banner' || tag === 'header') : (role === 'contentinfo' || tag === 'footer');
    if (!match) return false;
    var p = el.parentElement;
    if (p && p.closest(SECTION_ANCESTORS)) return false;
    return chromeScore(el, kind) >= 1;
  }

  /* ---------- meta ---------- */
  function readMeta(doc) {
    var metas = arr(doc.querySelectorAll('meta'));
    function get(attr, key) {
      return metas.filter(function (m) { return (m.getAttribute(attr) || '').trim().toLowerCase() === key; })
        .map(function (m) { return normText(m.getAttribute('content') || ''); });
    }
    function og(key) { return get('property', key).concat(get('name', key))[0] || ''; }
    var links = arr(doc.querySelectorAll('link[rel]'));
    function rel(r) { return links.filter(function (l) { return (l.getAttribute('rel') || '').toLowerCase().split(/\s+/).indexOf(r) >= 0; }); }
    var titles = arr(doc.querySelectorAll('title')).filter(function (t) { return !t.closest('svg'); }).map(function (t) { return normText(t.textContent); });
    var descs = get('name', 'description');
    var canon = rel('canonical')[0];
    return {
      title: titles[0] || '', titles: titles,
      description: descs[0] || '', descriptions: descs,
      canonical: canon ? (canon.getAttribute('href') || '').trim() : '',
      robots: get('name', 'robots').join(', '),
      googlebot: get('name', 'googlebot').join(', '),
      ogTitle: og('og:title'), ogDescription: og('og:description'), ogImage: og('og:image'), ogUrl: og('og:url'),
      twitterTitle: get('name', 'twitter:title')[0] || '', twitterDescription: get('name', 'twitter:description')[0] || '',
      lang: (doc.documentElement && doc.documentElement.getAttribute('lang')) || '',
      hreflang: rel('alternate').filter(function (l) { return l.hasAttribute('hreflang'); }).map(function (l) {
        return { lang: l.getAttribute('hreflang'), href: l.getAttribute('href') };
      })
    };
  }

  /* ---------- scope: between header and footer ---------- */
  var SEM_H = 'header,[role="banner"]';
  var FB_H = '#header,#masthead,#site-header,#siteHeader,#shopify-section-header,.site-header,.global-header,.main-header,.header-wrapper,.header-container,.shopify-section-group-header-group,[data-section-type="header"],.elementor-location-header,[data-elementor-type="header"]';
  var SEM_F = 'footer,[role="contentinfo"]';
  var FB_F = '#footer,#colophon,#site-footer,#shopify-section-footer,.site-footer,.global-footer,.main-footer,.footer-wrapper,.footer-container,.shopify-section-group-footer-group,[data-section-type="footer"],.elementor-location-footer,[data-elementor-type="footer"]';

  function landmarkCands(doc, sem, fb, kind, anchor) {
    var list = arr(doc.querySelectorAll(sem)).filter(function (el) {
      var role = el.getAttribute('role');
      if (role === 'banner' || role === 'contentinfo') return true;
      var p = el.parentElement;
      return !(p && p.closest(SECTION_ANCESTORS));
    });
    arr(doc.querySelectorAll(fb)).forEach(function (el) {
      if (list.indexOf(el) < 0 && !el.closest('main,[role="main"],article')) list.push(el);
    });
    list = list.filter(function (el) { return !(anchor && (el.contains(anchor) || anchor.contains(el))); });
    list = outermost(list);
    var scored = list.filter(function (el) { return chromeScore(el, kind) >= 1; });
    return sortDoc(scored.length ? scored : list);
  }

  function findScope(doc, opts, add) {
    var body = doc.body;
    if (!body) return { nodes: [], method: 'none', desc: 'No <body> found' };
    var sel = (opts.customRoot || '').trim();
    if (opts.area === 'custom' && sel) {
      var els = null;
      try { els = arr(doc.querySelectorAll(sel)); } catch (e) { add('warn', 'The content area selector “' + sel + '” isn’t valid CSS, so automatic detection was used.'); }
      if (els && els.length) {
        els = outermost(els);
        return { nodes: els, method: 'custom', desc: 'Your selector ' + sel + ' (' + els.length + (els.length === 1 ? ' match' : ' matches') + ')' };
      }
      if (els) add('warn', 'Nothing on the page matches “' + sel + '”, so automatic detection was used.');
    }
    var mains = outermost(arr(doc.querySelectorAll('main,[role="main"]')));
    var bigMain = null, bigLen = -1;
    mains.forEach(function (m) { var l = normText(m.textContent).length; if (l > bigLen) { bigLen = l; bigMain = m; } });
    if (opts.area === 'main') {
      if (bigMain) return { nodes: [bigMain], method: 'main', desc: 'The page’s ' + describe(bigMain) + ' element' };
      add('warn', 'This page has no <main> element, so automatic detection was used.');
    }
    var anchor = (bigMain && bigLen > 40) ? bigMain : (body.querySelector('h1') || null);
    var hc = landmarkCands(doc, SEM_H, FB_H, 'header', anchor);
    var fc = landmarkCands(doc, SEM_F, FB_F, 'footer', anchor);
    var H = null, F = null;
    if (anchor) {
      var pre = hc.filter(function (el) { return before(el, anchor); });
      H = pre.length ? pre[pre.length - 1] : null;
      F = fc.filter(function (el) { return before(anchor, el); })[0] || null;
    } else {
      H = hc[0] || null;
      F = fc.filter(function (el) { return !H || before(H, el); })[0] || null;
    }
    if (H && F && (H.contains(F) || F.contains(H) || before(F, H))) F = null;
    var nodes = [];
    (function collect(node) {
      arr(node.childNodes).forEach(function (ch) {
        if (ch === H || ch === F) return;
        if (ch.nodeType === 1 && ((H && ch.contains(H)) || (F && ch.contains(F)))) { collect(ch); return; }
        var afterH = !H || before(H, ch);
        var beforeF = !F || before(ch, F);
        if (afterH && beforeF) nodes.push(ch);
      });
    })(body);
    var txt = nodes.reduce(function (s, n) { return s + normText(n.textContent).length; }, 0);
    var desc;
    if (H && F) desc = 'Between ' + describe(H) + ' and ' + describe(F);
    else if (H) desc = 'After ' + describe(H) + ' to the end of the page (no page footer found)';
    else if (F) desc = 'From the top of the page to ' + describe(F) + ' (no page header found)';
    else desc = 'Whole page body (no page header or footer found)';
    if (txt < 40 && bigMain && bigLen > 40) {
      add('info', 'Header/footer detection left almost nothing in between, so the <main> element was used instead.');
      return { nodes: [bigMain], method: 'main', desc: 'The page’s ' + describe(bigMain) + ' element (fallback)', H: H, F: F };
    }
    if (!H || !F) add('info', desc + '.');
    return { nodes: nodes, method: 'between', desc: desc, H: H, F: F };
  }

  function describe(el) {
    if (!el || !el.localName) return '';
    var s = '<' + el.localName;
    var eid = el.getAttribute('id');
    if (eid) s += ' id="' + String(eid).slice(0, 40) + '"';
    var c = normText(cls(el)).split(' ').filter(Boolean).slice(0, 2).join(' ');
    if (c) s += ' class="' + (c.length > 48 ? c.slice(0, 47) + '…' : c) + '"';
    return s + '>';
  }

  /* ---------- noise rules ---------- */
  function makeRules(doc, opts, mainH1, add) {
    var custom = [];
    (opts.customExclude || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s) {
      try { doc.createDocumentFragment().querySelector(s); custom.push(s); }
      catch (e) { add('warn', 'Skipped exclude selector “' + s + '” because it isn’t valid CSS.'); }
    });
    var KEEP = 'KEEP';
    function rule(el) {
      var tag = el.localName;
      var role = (el.getAttribute('role') || '').toLowerCase();
      var sig = sigOf(el);
      var id = el.getAttribute('id') || '';
      for (var i = 0; i < custom.length; i++) { try { if (el.matches(custom[i])) return 'Your exclude selectors'; } catch (e) { } }
      var prot = mainH1 && el.contains(mainH1);
      var bread = BREAD_RE.test(sig) || BREAD_RE.test(el.getAttribute('aria-label') || '') || /BreadcrumbList/.test(el.getAttribute('itemtype') || el.getAttribute('typeof') || '');
      if (bread) return (opts.breadcrumbs && !prot) ? 'Breadcrumbs' : KEEP;
      if (prot) return null;
      if (isPageLandmark(el, 'header')) return 'Page header';
      if (isPageLandmark(el, 'footer')) return 'Page footer';
      if (tag === 'nav' || role === 'navigation' || role === 'menubar' || NAV_SIG_RE.test(sig)) return 'Navigation';
      if (CHROME_RE.test(sig) || /^(siteSub|contentSub|jump-to-nav|p-lang|p-lang-btn|toc|catlinks)$/.test(id)) return 'Navigation';
      if (!HEADING.test(tag) && tag !== 'a') {
        var langLinks = el.querySelectorAll('a[hreflang], a[lang]').length;
        if (langLinks >= 5 && langLinks >= el.querySelectorAll('a').length * 0.6) return 'Navigation';
      }
      if (tag === 'a' && /^\s*skip to\b/i.test(el.textContent || '')) return 'Navigation';
      var containerish = !(tag === 'a' || tag === 'img' || tag === 'p' || HEADING.test(tag) || tag === 'li' || tag === 'span');
      if (opts.popups && (tag === 'dialog' || role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true')) return 'Popups, banners, chat & ads';
      if (opts.dedupe && CLONE_RE.test(cls(el))) return 'Slider duplicates';
      if (opts.hidden && isHiddenEl(el)) return 'Hidden on the page';
      if (opts.popups && (tag === 'amp-ad' || (tag === 'ins' && /adsbygoogle/.test(sig)) || /^(div-gpt-ad|google_ads)/i.test(id) ||
        el.hasAttribute('data-ad-slot') || el.hasAttribute('data-ad-unit'))) return 'Popups, banners, chat & ads';
      if (opts.popups && containerish && OVERLAY_RE.test(sig) && !bigCopy(el)) return 'Popups, banners, chat & ads';
      if (opts.products) {
        if (FILTERS_RE.test(sig) && containerish) return 'Filters & sorting';
        if (PRODUCT_LIST_RE.test(sig) && containerish) {
          var t = el.textContent || '';
          var prices = (t.match(PRICE_RE_G) || []).length + el.querySelectorAll('[itemprop="price"],[data-price]').length;
          if (prices >= 2 || (t.match(new RegExp(CART_RE.source, 'gi')) || []).length >= 2 || normText(t).length < 400) return 'Product listings';
        }
        if (el.children.length >= 3 && isListing(el)) return 'Product listings';
        if (/schema\.org\/(Product|Offer)$/i.test(el.getAttribute('itemtype') || '') && tileLike(el)) return 'Product listings';
        var ptxt = null;
        if (PRICE_CLS_RE.test(sig) || el.getAttribute('itemprop') === 'price' || el.hasAttribute('data-price')) {
          ptxt = normText(el.textContent);
          if (ptxt.length < 80 && /\d/.test(ptxt)) return 'Prices & buy buttons';
        }
        if (BUYBOX_RE.test(sig) && containerish && normText(el.textContent).length < 600) return 'Prices & buy buttons';
        // Short price labels and separators ("Regular price", "Unit price", "/", "per") around a price.
        var short = normText(el.textContent);
        // Bare prices or price ranges ("$15 - $500"), and pay-later promos.
        if (!HEADING.test(tag) && short.length < 30 && /^[\s$€£₹¥]*(rs\.?\s*)?\d[\d.,]*(\s*[-–]\s*[$€£₹¥]?\d[\d.,]*)?\s*[a-z]{0,3}$/i.test(short)) return 'Prices & buy buttons';
        if (/^(shopify-payment-terms|afterpay-placement|klarna-placement|square-placement|affirm-placement)$/.test(tag) || (short.length < 140 && /\bpay in \d+ (interest[- ]free )?(payments|instalments|installments)\b/i.test(short))) return 'Prices & buy buttons';
        if (short.length < 40 && (/price(?!ing)/.test(sig) || /^(regular|sale|unit|original|compare at|was|now)?\s*price:?$|^\/$|^per$/i.test(short)) && !HEADING.test(tag)) return 'Prices & buy buttons';
      }
      if (opts.reviews && (REVIEW_RE.test(sig) || REVIEW_ID_RE.test(id)) && containerish) return 'Reviews, comments & sharing';
      if (opts.sidebars && (tag === 'aside' || role === 'complementary' || SIDEBAR_RE.test(sig) || SIDEBAR_ID_RE.test(id)) && !(el.parentElement && el.parentElement.closest('article'))) return 'Sidebars';
      if (opts.forms) {
        if ((tag === 'form' || el.hasAttribute('data-cb-form')) && !bigCopy(el)) return 'Forms & buttons';
        if (tag === 'button' || role === 'button') return isAccordionTrigger(el) ? null : 'Forms & buttons';
        if (tag === 'label' || tag === 'fieldset' || tag === 'output' || role === 'search' || role === 'tablist' || tag === 'search') return 'Forms & buttons';
        if (containerish && el.querySelector('select,textarea,input:not([type="hidden"])') && !el.querySelector('h1,h2,h3,h4,h5,h6,p,ul,ol,table,img,picture')) {
          var ctl = normText(el.textContent).length;
          arr(el.querySelectorAll('select,textarea')).forEach(function (x) { ctl -= normText(x.textContent).length; });
          if (ctl < 80) return 'Forms & buttons';
        }
      }
      if ((tag === 'img' || tag === 'iframe')) {
        var w = numAttr(el, 'width'), h = numAttr(el, 'height');
        var src = el.getAttribute('src') || el.getAttribute('data-src') || '';
        if ((w !== null && h !== null && w <= 2 && h <= 2) || TRACK_SRC_RE.test(src)) return 'Tracking pixels';
      }
      if (opts.icons) {
        var c = cls(el);
        var tl = normText(el.textContent).length;
        if ((tag === 'i' || tag === 'span') && ICON_FONT_RE.test(c) && tl <= 40) return 'Icons';
        if ((tag === 'i' || tag === 'span') && ICON_GENERIC_RE.test(c) && tl <= 3) return 'Icons';
        if (tag === 'img') { var iw = numAttr(el, 'width'), ih = numAttr(el, 'height'); if (iw !== null && ih !== null && iw <= 24 && ih <= 24) return 'Icons'; }
      }
      return null;
    }
    rule.KEEP = KEEP;
    return rule;
  }

  function makeRecorder(removed) {
    return function rec(el, reason, extra) {
      var img = el.localName === 'img' ? 1 : (el.querySelectorAll ? el.querySelectorAll('img').length : 0);
      var r = {
        id: removed.length, cbid: (el.getAttribute && el.getAttribute('data-cbid')) || '', reason: reason,
        desc: describe(el), snippet: snip(spacedText(el)) || (img ? '(image only)' : '(no text)'),
        chars: normText(el.textContent).length, images: img, restorable: true
      };
      if (extra) for (var k in extra) r[k] = extra[k];
      removed.push(r);
      return r;
    };
  }

  // Restoring an element also exempts everything inside it from the rule that removed it,
  // so a restored product section comes back whole instead of one layer at a time.
  var RELATED_REASONS = {
    'Product listings': ['Product listings', 'Prices & buy buttons', 'Filters & sorting'],
    'Prices & buy buttons': ['Prices & buy buttons'],
    'Reviews, comments & sharing': ['Reviews, comments & sharing']
  };
  function prune(root, rule, forceKeep, rec, mainH1) {
    var stack = arr(root.children).reverse().map(function (el) { return { el: el, skip: null }; });
    while (stack.length) {
      var item = stack.pop(), el = item.el, skip = item.skip;
      if (!root.contains(el)) continue;
      var r = rule(el);
      if (forceKeep.has(el.getAttribute('data-cbid'))) {
        if (r && r !== rule.KEEP) skip = (skip || []).concat(RELATED_REASONS[r] || [r]);
      } else if (r && r !== rule.KEEP && !(skip && skip.indexOf(r) >= 0)) {
        var parent = el.parentElement;
        var record = rec(el, r);
        el.remove();
        if (r === 'Product listings') {
          var extraText = [];
          var p = parent;
          while (p && p !== root && !forceKeep.has(p.getAttribute('data-cbid')) && !(mainH1 && p.contains(mainH1)) &&
            normText(p.textContent).length < 120 && !p.querySelector('img,picture')) {
            var t = spacedText(p); if (t) extraText.push(t);
            var pp = p.parentElement; p.remove(); p = pp;
          }
          if (extraText.length) record.snippet = snip(extraText[extraText.length - 1] + ' · ' + record.snippet);
        }
        continue;
      }
      for (var i = el.children.length - 1; i >= 0; i--) stack.push({ el: el.children[i], skip: skip });
    }
  }

  var CONTAINER_TAGS = new Set(['div', 'section', 'article', 'aside', 'ul', 'ol', 'table', 'dl', 'blockquote', 'figure', 'details']);
  function dedupeContainers(root, forceKeep, rec) {
    var seen = new Map();
    var stack = arr(root.children).reverse();
    while (stack.length) {
      var el = stack.pop();
      var tag = el.localName;
      if (CONTAINER_TAGS.has(tag) || tag.indexOf('-') > 0) {
        var txt = normText(el.textContent);
        if (txt.length >= 80) {
          var prev = seen.get(txt);
          if (prev && !prev.contains(el) && !el.contains(prev) && !forceKeep.has(el.getAttribute('data-cbid'))) {
            rec(el, 'Duplicate copy'); el.remove(); continue;
          }
          if (!prev) seen.set(txt, el);
        }
      }
      for (var i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i]);
    }
  }

  /* ---------- conversion to clean semantic HTML ---------- */
  function makeConverter(doc, opts, base, notes) {
    var layoutTables = new Set();

    function resolveUrl(u) {
      u = (u || '').trim();
      if (!u) return u;
      if (/^data:/i.test(u)) return u;
      if (LOCAL_SAVE_RE.test(u)) { notes.localPaths++; return u; }
      if (!base) return /^\/\//.test(u) ? 'https:' + u : u;
      try { return new URL(u, base).href; } catch (e) { return u; }
    }
    function sanitizeHref(h) {
      h = (h || '').trim();
      if (!h) return null;
      if (/^(javascript|vbscript|data):/i.test(h.replace(/\s+/g, ''))) return null;
      if (h.charAt(0) === '#' || /^(mailto|tel|sms):/i.test(h)) return h;
      return resolveUrl(h);
    }
    function copyAttrs(src, dst, tag) {
      ['lang', 'dir'].forEach(function (a) { var v = src.getAttribute(a); if (v) dst.setAttribute(a, v); });
      if (HEADING.test(tag) && src.getAttribute('id')) dst.setAttribute('id', src.getAttribute('id'));
      (ATTRS[tag] || []).forEach(function (a) {
        var v = src.getAttribute(a);
        if (v == null) return;
        if (a === 'href') { v = sanitizeHref(v); if (v == null) return; }
        if (a === 'src') v = resolveUrl(v);
        dst.setAttribute(a, v);
      });
    }
    function mark(out, el, hid) {
      var id = el.getAttribute('data-cbid');
      if (id) out.setAttribute('data-cbid', id);
      if (hid) out.setAttribute('data-cbh', '1');
      return out;
    }
    function isBlockNode(n) {
      return !!n && n.nodeType === 1 && (BLOCK_OUT.has(n.localName) || n.hasAttribute('data-cba'));
    }
    function isMediaNode(n) {
      return !!n && n.nodeType === 1 && (n.localName === 'img' || n.localName === 'cb-bg' || !!n.querySelector('img,cb-bg'));
    }
    function isPlaceholder(s) {
      if (!s) return true;
      if (/^data:/i.test(s)) return s.length < 600;
      return /(^|\/)(blank|spacer|placeholder|transparent|lazy|loading|loader|pixel|grey|gray|1x1)[^\/]*\.(gif|png|svg|jpe?g|webp)(\?|#|$)/i.test(s) || s === '#';
    }
    function templ(v, img) {
      if (v.indexOf('{width}') < 0) return v;
      var w = 1200;
      try { var ws = JSON.parse(img.getAttribute('data-widths') || '[]'); if (ws.length) w = Math.max.apply(null, ws); } catch (e) { }
      return v.replace(/\{width\}/g, String(w));
    }
    function largestFromSrcset(s) {
      if (!s) return '';
      var best = '', bestV = -1, re = /\s*([^\s]+)(?:\s+([\d.]+)([wx]))?\s*(?:,|$)/g, m, guard = 0;
      while ((m = re.exec(s)) && guard++ < 200) {
        if (!m[1]) { if (re.lastIndex >= s.length) break; continue; }
        var url = m[1].replace(/,+$/, '');
        var v = m[2] ? parseFloat(m[2]) * (m[3] === 'x' ? 1000 : 1) : 0;
        if (v >= bestV) { bestV = v; best = url; }
        if (re.lastIndex >= s.length) break;
      }
      return best;
    }
    function pickImgSrc(img, picture) {
      function g(a) { return (img.getAttribute(a) || '').trim(); }
      for (var i = 0; i < LAZY_ATTRS.length; i++) { var v = g(LAZY_ATTRS[i]); if (v && !isPlaceholder(v)) return templ(v, img); }
      var src = g('src');
      if (src && !isPlaceholder(src)) return src;
      var sets = [g('srcset'), g('data-srcset'), g('data-lazy-srcset')];
      if (picture) arr(picture.querySelectorAll('source')).forEach(function (s) { sets.push(s.getAttribute('srcset') || '', s.getAttribute('data-srcset') || ''); });
      for (var j = 0; j < sets.length; j++) { var b = largestFromSrcset(templ(sets[j], img)); if (b && !isPlaceholder(b)) return b; }
      return src;
    }
    function bgUrl(el) {
      var st = el.getAttribute('style') || '';
      var m = st.match(/(?:background(?:-image)?|--[\w-]*(?:image|bg|background)[\w-]*)\s*:[^;]*?url\(\s*(['"]?)(.*?)\1\s*\)/i);
      if (m && m[2] && !/^data:/i.test(m[2])) return m[2];
      var names = ['data-bg', 'data-background', 'data-background-image', 'data-bg-src', 'data-bg-image', 'data-bgset'];
      for (var i = 0; i < names.length; i++) {
        var v = (el.getAttribute(names[i]) || '').trim();
        if (!v) continue;
        var u = v.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
        if (u) v = u[2];
        if (names[i] === 'data-bgset') v = largestFromSrcset(v.split('|').pop());
        if (v && !/^data:/i.test(v)) return v;
      }
      return '';
    }
    function makeImg(el, picture, hid) {
      var src = pickImgSrc(el, picture);
      if (!src && !el.hasAttribute('alt')) return [];
      var img = doc.createElement('img');
      img.setAttribute('src', resolveUrl(src || ''));
      if (el.hasAttribute('alt')) img.setAttribute('alt', el.getAttribute('alt'));
      ['title', 'width', 'height'].forEach(function (a) { var v = el.getAttribute(a); if (v != null && v !== '') img.setAttribute(a, v); });
      return [mark(img, el, hid)];
    }
    function embedNote(el, tag, hid) {
      var srcEl = el.querySelector && el.querySelector('source[src]');
      var src = el.getAttribute('src') || el.getAttribute('data-src') || (srcEl && srcEl.getAttribute('src')) || '';
      if (!src || src === 'about:blank') return [];
      src = resolveUrl(src);
      var title = normText(el.getAttribute('title') || el.getAttribute('aria-label') || '');
      var kind = tag === 'video' ? 'Video' : tag === 'audio' ? 'Audio' :
        /youtube|youtu\.be|vimeo|wistia|vidyard|loom|brightcove|jwplayer/i.test(src) ? 'Embedded video' :
          /google\.[^\/]+\/maps|maps\.google|openstreetmap/i.test(src) ? 'Embedded map' : 'Embedded content';
      var p = doc.createElement('p');
      p.setAttribute('data-embed', tag);
      p.appendChild(doc.createTextNode('[' + kind + (title ? ': ' + title : '') + '] '));
      var a = doc.createElement('a'); a.setAttribute('href', src); a.textContent = src; p.appendChild(a);
      return [mark(p, el, hid)];
    }
    function isLayoutTable(t) {
      var role = (t.getAttribute('role') || '').toLowerCase();
      if (role === 'presentation' || role === 'none') return true;
      if (t.querySelector('th')) return false;
      if (t.querySelector('table,h1,h2,h3,h4,h5,h6,[role="heading"]')) return true;
      var rows = t.querySelectorAll('tr').length, cells = t.querySelectorAll('td').length, len = normText(t.textContent).length;
      if (rows <= 1 && cells <= 2 && len > 80) return true;
      return t.querySelectorAll('p,ul,ol,div,blockquote').length >= 3 && len > 150;
    }

    function convKids(el, ctx) {
      var out = [];
      var ch = el.childNodes;
      for (var i = 0; i < ch.length; i++) { var r = conv(ch[i], ctx); for (var j = 0; j < r.length; j++) out.push(r[j]); }
      return out;
    }
    function group(items, hid) { return { g: items, hidden: hid }; }
    function groupHasText(it) { return it.g.some(function (x) { return x && (x.g ? groupHasText(x) : hasText(x) || isMediaNode(x)); }); }

    function conv(node, ctx) {
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        if (!ctx.pre) t = t.replace(WS, ' ');
        return t ? [doc.createTextNode(t)] : [];
      }
      if (node.nodeType !== 1) return [];
      var el = node, tag = el.localName;
      if (DROP_ALWAYS.has(tag)) return [];
      var hid = ctx.hidden || isHiddenEl(el);
      var cctx = hid !== ctx.hidden ? { hidden: hid, pre: ctx.pre } : ctx;
      var pre = [];
      if (opts.bgImages) {
        var bg = bgUrl(el);
        if (bg) { var m = doc.createElement('cb-bg'); m.setAttribute('data-src', resolveUrl(bg)); mark(m, el, hid); pre.push(m); }
      }
      if (tag === 'img') return pre.concat(makeImg(el, null, hid));
      if (tag === 'picture') { var im = el.querySelector('img'); return pre.concat(im ? makeImg(im, el, hid) : []); }
      if (tag === 'iframe' || tag === 'video' || tag === 'audio' || tag === 'embed') return pre.concat(opts.embeds ? embedNote(el, tag, hid) : []);
      if (tag === 'br' || tag === 'hr' || tag === 'wbr') return [doc.createElement(tag)];
      if (tag === 'button' || tag === 'label' || tag === 'output') return pre.concat(convKids(el, cctx));
      if (opts.ariaHeadings && !HEADING.test(tag) && (el.getAttribute('role') || '').toLowerCase() === 'heading') {
        var lv = Math.min(6, Math.max(1, parseInt(el.getAttribute('aria-level'), 10) || 2));
        tag = 'h' + lv; notes.ariaHeadings++;
      }
      tag = TAG_MAP[tag] || tag;
      if (tag === 'table' && isLayoutTable(el)) { layoutTables.add(el); notes.layoutTables++; return [group(pre.concat(convKids(el, cctx)), hid)]; }
      if (TABLE_PART.has(tag)) { var tb = el.closest('table'); if (tb && layoutTables.has(tb)) return [group(pre.concat(convKids(el, cctx)), hid)]; }
      if (SECTIONING.has(tag) && !opts.keepSections) return [group(pre.concat(convKids(el, cctx)), hid)];
      if (BLOCK_KEEP.has(tag) || SECTIONING.has(tag)) return buildBlock(el, tag, cctx, hid, pre);
      if (INLINE_KEEP.has(tag)) {
        if (tag === 'a' && !opts.links) return pre.concat(convKids(el, cctx));
        return pre.concat(buildInline(el, tag, cctx, hid));
      }
      var kids = convKids(el, cctx);
      if (BLOCKISH_UNWRAP.has(tag) || tag.indexOf('-') > 0) return [group(pre.concat(kids), hid)];
      return pre.concat(kids);
    }

    function buildBlock(el, tag, ctx, hid, pre) {
      var out = mark(doc.createElement(tag), el, hid);
      copyAttrs(el, out, tag);
      var mode = MODE[tag] || 'flow';
      pre = pre || [];
      if (mode === 'pre') { appendAll(out, flattenInline(convKids(el, { hidden: ctx.hidden, pre: true }))); return pre.concat([out]); }
      var kids = convKids(el, ctx);
      if (mode === 'flow' || mode === 'item') { kids = pre.concat(kids); pre = []; }
      if (mode === 'inline') appendAll(out, flattenInline(kids));
      else if (mode === 'item') appendAll(out, finalize(kids, 'item', hid));
      else if (mode === 'flow') appendAll(out, finalize(kids, 'flow', hid));
      else if (mode === 'list') appendAll(out, listItems(kids, hid));
      else if (mode === 'dl') appendAll(out, dlItems(kids));
      else if (mode === 'table') appendAll(out, flatElements(kids));
      if (tag === 'details') out.setAttribute('open', '');
      return pre.concat([out]);
    }

    function buildInline(el, tag, ctx, hid) {
      var kids = convKids(el, ctx);
      var groupsWithText = kids.filter(function (k) { return k && k.g && groupHasText(k); }).length;
      var hasBlocks = kids.some(function (k) { return k && !k.g && isBlockNode(k); }) || groupsWithText >= 2;
      if (tag === 'a') {
        var a = mark(doc.createElement('a'), el, false);
        copyAttrs(el, a, 'a');
        if (!a.hasAttribute('href')) return hasBlocks ? kids : flattenInline(kids);
        if (hasBlocks) { appendAll(a, finalize(kids, 'flow', hid)); a.setAttribute('data-cba', '1'); if (hid) a.setAttribute('data-cbh', '1'); }
        else appendAll(a, flattenInline(kids));
        return [a];
      }
      if (hasBlocks) return kids;
      var out = doc.createElement(tag);
      copyAttrs(el, out, tag);
      appendAll(out, flattenInline(kids));
      return [out];
    }

    function appendAll(parent, nodes) { for (var i = 0; i < nodes.length; i++) parent.appendChild(nodes[i]); }

    function flattenInline(items) {
      var out = [];
      function sep() {
        var last = out[out.length - 1];
        if (out.length && !(last.nodeType === 3 && /\s$/.test(last.nodeValue))) out.push(doc.createTextNode(' '));
      }
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it) continue;
        if (it.g) { sep(); flattenInline(it.g).forEach(function (n) { out.push(n); }); sep(); }
        else if (isBlockNode(it)) {
          if (it.localName === 'hr') continue;
          sep();
          flattenInline(arr(it.childNodes)).forEach(function (n) { out.push(n); });
          sep();
        } else out.push(it);
      }
      return out;
    }

    function wrapRun(nodes, hid) {
      var any = nodes.some(function (n) { return hasText(n); });
      if (!any) return nodes.filter(function (n) { return isMediaNode(n); });
      var p = doc.createElement('p');
      if (hid) p.setAttribute('data-cbh', '1');
      appendAll(p, nodes);
      return [p];
    }

    function finalize(items, mode, hid) {
      if (mode === 'inline') return flattenInline(items);
      var segs = [], cur = null;
      items.forEach(function (it) {
        if (!it) return;
        if (it.g) { segs.push({ t: 'g', g: it.g, hidden: it.hidden }); cur = null; }
        else if (isBlockNode(it)) { segs.push({ t: 'b', n: it }); cur = null; }
        else { if (!cur) { cur = { t: 'l', n: [] }; segs.push(cur); } cur.n.push(it); }
      });
      if (mode === 'item') {
        var meaningful = segs.filter(function (s) {
          return s.t === 'b' || (s.t === 'g' ? groupHasText(s) : s.n.some(function (n) { return hasText(n) || isMediaNode(n); }));
        });
        var anyBlock = segs.some(function (s) { return s.t === 'b'; });
        if (!anyBlock && meaningful.length <= 1) return flattenInline(items);
      }
      var out = [];
      segs.forEach(function (s) {
        if (s.t === 'b') out.push(s.n);
        else if (s.t === 'g') finalize(s.g, 'flow', s.hidden || hid).forEach(function (n) { out.push(n); });
        else wrapRun(s.n, hid).forEach(function (n) { out.push(n); });
      });
      return out;
    }

    function listItems(items, hid) {
      var out = [], run = [];
      function flush() {
        if (run.length && run.some(function (n) { return hasText(n) || isMediaNode(n); })) {
          var li = doc.createElement('li'); if (hid) li.setAttribute('data-cbh', '1'); appendAll(li, run); out.push(li);
        }
        run = [];
      }
      (function walk(list) {
        list.forEach(function (it) {
          if (!it) return;
          if (it.g) { flush(); walk(it.g); flush(); }
          else if (it.nodeType === 1 && it.localName === 'li') { flush(); out.push(it); }
          else if (isBlockNode(it)) {
            flush();
            if ((it.localName === 'ul' || it.localName === 'ol') && out.length) out[out.length - 1].appendChild(it);
            else { var li = doc.createElement('li'); li.appendChild(it); out.push(li); }
          } else run.push(it);
        });
      })(items);
      flush();
      return out;
    }
    function dlItems(items) {
      var out = [];
      (function walk(list) {
        list.forEach(function (it) {
          if (!it) return;
          if (it.g) { walk(it.g); return; }
          if (it.nodeType === 1 && (it.localName === 'dt' || it.localName === 'dd')) out.push(it);
          else if (hasText(it) || isMediaNode(it)) { var dd = doc.createElement('dd'); dd.appendChild(it); out.push(dd); }
        });
      })(items);
      return out;
    }
    function flatElements(items) {
      var out = [];
      (function walk(list) {
        list.forEach(function (it) {
          if (!it) return;
          if (it.g) { walk(it.g); return; }
          if (it.nodeType === 1) out.push(it);
        });
      })(items);
      return out;
    }

    return { convKids: convKids, finalize: finalize, appendAll: appendAll };
  }

  /* ---------- tidy ---------- */
  var TRIM_TAGS = 'p,h1,h2,h3,h4,h5,h6,li,dt,dd,td,th,caption,figcaption,summary,address,a';
  function trimSide(el, start) {
    var n = start ? el.firstChild : el.lastChild;
    while (n) {
      var next = start ? n.nextSibling : n.previousSibling;
      if (n.nodeType === 3) {
        n.nodeValue = start ? n.nodeValue.replace(/^[ \t\n\r\f]+/, '') : n.nodeValue.replace(/[ \t\n\r\f]+$/, '');
        if (n.nodeValue) return;
        n.parentNode.removeChild(n); n = next; continue;
      }
      if (n.nodeType === 1 && n.localName === 'br') { n.parentNode.removeChild(n); n = next; continue; }
      if (n.nodeType === 1 && INLINE_KEEP.has(n.localName) && !n.hasAttribute('data-cba')) {
        trimSide(n, start);
        if (!n.firstChild) { n.parentNode.removeChild(n); n = next; continue; }
        return;
      }
      return;
    }
  }
  function tidy(root) {
    root.normalize();
    arr(root.querySelectorAll(TRIM_TAGS)).forEach(function (el) {
      if (el.localName === 'a' && el.hasAttribute('data-cba')) return;
      trimSide(el, true); trimSide(el, false);
    });
    arr(root.querySelectorAll('br')).forEach(function (br) {
      var n = br.previousSibling, count = 0;
      while (n && (n.nodeType === 3 ? !/\S/.test(n.nodeValue) : n.localName === 'br')) { if (n.nodeType === 1) count++; n = n.previousSibling; }
      if (count >= 2) br.parentNode.removeChild(br);
    });
    // collapse doubled spaces across inline boundaries
    var prevSpace = true, prevBlock = null;
    var all = [];
    (function walk(n) { for (var c = n.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) all.push(c); else if (c.nodeType === 1 && c.localName !== 'pre') walk(c); } })(root);
    all.forEach(function (t) {
      var blk = t.parentNode; while (blk && blk !== root && !BLOCK_OUT.has(blk.localName)) blk = blk.parentNode;
      if (blk !== prevBlock) { prevSpace = true; prevBlock = blk; }
      if (prevSpace) t.nodeValue = t.nodeValue.replace(/^ +/, '');
      if (t.nodeValue) prevSpace = / $/.test(t.nodeValue);
    });
  }
  var KEEP_EMPTY = new Set(['img', 'br', 'hr', 'wbr', 'cb-bg', 'td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'caption']);
  function removeEmpties(root) {
    var changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      arr(root.querySelectorAll('*')).forEach(function (el) {
        if (!root.contains(el)) return;
        var t = el.localName;
        if (KEEP_EMPTY.has(t)) return;
        if ((t === 'ul' || t === 'ol') && !arr(el.children).some(function (c) { return c.localName === 'li'; })) { el.remove(); changed = true; return; }
        if (!hasText(el) && !el.querySelector('img,cb-bg,hr')) { el.remove(); changed = true; }
      });
    }
    arr(root.childNodes).forEach(function (n) { if (n.nodeType === 3 && !/\S/.test(n.nodeValue)) n.remove(); });
  }
  function dedupeBlocks(root, forceKeep, rec) {
    var seen = new Set();
    arr(root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,dl,table,pre,figure')).forEach(function (el) {
      if (!root.contains(el)) return;
      var anc = el.parentElement && el.parentElement.closest('blockquote,ul,ol,dl,table,figure,pre');
      if (anc && root.contains(anc)) return;
      var txt = normText(el.textContent);
      if (txt.length < 25) return;
      var key = el.localName + '|' + txt;
      if (seen.has(key)) {
        if (forceKeep.has(el.getAttribute('data-cbid'))) return;
        rec(el, 'Duplicate copy'); el.remove();
      } else seen.add(key);
    });
  }

  /* ---------- images & blocks ---------- */
  function fileOf(src) {
    if (!src) return '(no src)';
    if (/^data:/i.test(src)) return 'inline image (data URI)';
    var s = src.split(/[?#]/)[0];
    var f = s.split('/').filter(Boolean).pop() || s;
    try { f = decodeURIComponent(f); } catch (e) { }
    return f;
  }
  function altStatus(kind, alt) {
    if (kind === 'bg') return { key: 'bg', label: 'CSS background (no alt possible)' };
    if (alt === null) return { key: 'missing', label: 'Missing alt attribute' };
    if (!alt.trim()) return { key: 'empty', label: 'Empty alt (decorative)' };
    if (/\.(jpe?g|png|webp|gif|avif|svg|bmp|tiff?)$/i.test(alt.trim()) || /^(img|image|dsc|photo|pic|screenshot)[-_ ]?\d+/i.test(alt.trim())) return { key: 'filename', label: 'Alt looks like a file name' };
    if (clen(alt) > 125) return { key: 'long', label: 'Alt is long (over 125 characters)' };
    return { key: 'ok', label: 'OK' };
  }
  function collectImages(root, assign) {
    var out = [];
    arr(root.querySelectorAll('img,cb-bg')).forEach(function (el, i) {
      var kind = el.localName === 'img' ? 'img' : 'bg';
      var src = kind === 'img' ? (el.getAttribute('src') || '') : (el.getAttribute('data-src') || '');
      var alt = kind === 'img' && el.hasAttribute('alt') ? el.getAttribute('alt') : null;
      var st = altStatus(kind, alt);
      var link = el.closest('a[href]');
      var blk = el.closest('[data-cbb]');
      if (assign) el.setAttribute('data-cbi', String(i + 1));
      out.push({
        seq: i + 1, kind: kind, src: src, file: fileOf(src), alt: alt, status: st.key, statusLabel: st.label,
        title: el.getAttribute('title') || '', width: el.getAttribute('width') || '', height: el.getAttribute('height') || '',
        link: link ? link.getAttribute('href') : '', block: blk ? +blk.getAttribute('data-cbb') : -1,
        hidden: !!el.closest('[data-cbh]'), local: LOCAL_SAVE_RE.test(src)
      });
    });
    return out;
  }
  var FLOW_PARENTS = new Set(['section', 'article', 'header', 'footer', 'aside']);
  function indexBlocks(root) {
    var blocks = [], i = 0;
    (function visit(el) {
      arr(el.children).forEach(function (ch) {
        var t = ch.localName;
        if (FLOW_PARENTS.has(t) || (t === 'a' && ch.hasAttribute('data-cba'))) { visit(ch); return; }
        ch.setAttribute('data-cbb', String(i));
        blocks.push(ch);
        i++;
      });
    })(root);
    return blocks;
  }
  function blockRecord(el) {
    var t = el.localName, kind = 'text', label = t;
    var imgs = arr(el.localName === 'img' || t === 'cb-bg' ? [el] : el.querySelectorAll('img,cb-bg')).map(function (x) { return +x.getAttribute('data-cbi'); });
    if (t === 'img' || t === 'cb-bg' || (!hasText(el) && imgs.length)) { kind = 'media'; label = t === 'cb-bg' ? 'bg' : 'img'; }
    else if (el.hasAttribute('data-embed')) { kind = 'embed'; label = el.getAttribute('data-embed'); }
    else if (t === 'ul' || t === 'ol') label = t;
    return {
      idx: +el.getAttribute('data-cbb'), tag: t, label: label, kind: kind,
      level: HEADING.test(t) ? +t.charAt(1) : 0,
      html: kind === 'media' ? '' : serInline(el, { proof: true }),
      text: spacedText(el), imgs: imgs, items: (t === 'ul' || t === 'ol') ? el.querySelectorAll('li').length : 0,
      hidden: !!el.closest('[data-cbh]') || !!el.querySelector('[data-cbh]'),
      cbid: el.getAttribute('data-cbid') || ''
    };
  }

  /* ---------- serialization ---------- */
  var VOID = new Set(['img', 'br', 'hr', 'wbr']);
  var BOOL = new Set(['open', 'reversed']);
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;'); }
  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;'); }
  function safeComment(s) { return String(s).replace(/--/g, '%2D%2D').replace(/>/g, '%3E'); }
  function openTag(el) {
    var s = '<' + el.localName;
    arr(el.attributes).forEach(function (a) {
      if (/^data-cb/.test(a.name)) return;
      s += ' ' + a.name + (BOOL.has(a.name) && a.value === '' ? '' : '="' + escAttr(a.value) + '"');
    });
    return s + '>';
  }
  function serInline(n, o) {
    o = o || {};
    if (n.nodeType === 3) return esc(n.nodeValue);
    if (n.nodeType === 8) return '\x3c!--' + safeComment(n.nodeValue) + '--\x3e';
    if (n.nodeType !== 1) return '';
    var t = n.localName;
    if (t === 'cb-bg') return o.proof ? '<span class="chip">bg ' + n.getAttribute('data-cbi') + '</span>' : '\x3c!-- Background image: ' + safeComment(n.getAttribute('data-src') || '') + ' -->';
    if (t === 'img' && o.proof) return '<span class="chip" title="' + escAttr(n.getAttribute('alt') == null ? 'No alt attribute' : 'alt: ' + n.getAttribute('alt')) + '">img ' + n.getAttribute('data-cbi') + '</span>';
    if (VOID.has(t)) return openTag(n);
    var s = openTag(n);
    for (var c = n.firstChild; c; c = c.nextSibling) s += serInline(c, o);
    return s + '</' + t + '>';
  }
  function isLineChild(c, parentFlow) {
    if (c.nodeType !== 1) return false;
    var t = c.localName;
    return BLOCK_OUT.has(t) || t === 'cb-bg' || c.hasAttribute('data-cba') || (parentFlow && (t === 'img' || t === 'a'));
  }
  function serPretty(n, depth, lines) {
    var ind = new Array(depth + 1).join('  ');
    if (n.nodeType === 3) { var tx = n.nodeValue.trim(); if (tx) lines.push(ind + esc(tx)); return; }
    if (n.nodeType !== 1) return;
    var t = n.localName;
    var flow = FLOW_PARENTS.has(t) || t === 'blockquote' || t === 'figure' || t === 'details' || n.hasAttribute('data-cba');
    var kids = arr(n.childNodes);
    var hasLine = t !== 'pre' && kids.some(function (c) { return isLineChild(c, flow); });
    if (!hasLine) { lines.push(ind + serInline(n)); return; }
    lines.push(ind + openTag(n));
    var buf = '';
    function flush() { if (buf.trim()) lines.push(ind + '  ' + buf.trim()); buf = ''; }
    kids.forEach(function (c) {
      if (isLineChild(c, flow)) { flush(); serPretty(c, depth + 1, lines); }
      else buf += serInline(c);
    });
    flush();
    lines.push(ind + '</' + t + '>');
  }
  function serializeContent(root) {
    var lines = [];
    arr(root.childNodes).forEach(function (c) { serPretty(c, 0, lines); });
    return lines.join('\n');
  }
  function toText(root) {
    var out = [];
    function line(s) { out.push(s); }
    function imgLine(el) {
      if (el.localName === 'cb-bg') return '[Background image: ' + fileOf(el.getAttribute('data-src')) + ']';
      var alt = el.getAttribute('alt');
      return '[Image: ' + fileOf(el.getAttribute('src')) + (alt === null ? ' (no alt)' : alt.trim() ? ' alt="' + alt + '"' : ' (empty alt)') + ']';
    }
    function inline(el) {
      var c = el.cloneNode(true);
      arr(c.querySelectorAll('img,cb-bg')).forEach(function (i) { i.replaceWith(c.ownerDocument.createTextNode(' ' + imgLine(i) + ' ')); });
      arr(c.querySelectorAll('br')).forEach(function (b) { b.replaceWith(c.ownerDocument.createTextNode('\n')); });
      return c.textContent.split('\n').map(normText).join('\n').trim();
    }
    function list(ul, depth) {
      var n = parseInt(ul.getAttribute('start'), 10) || 1;
      arr(ul.children).forEach(function (li) {
        if (li.localName !== 'li') return;
        var c = li.cloneNode(true);
        arr(c.querySelectorAll('ul,ol')).forEach(function (x) { x.remove(); });
        line(new Array(depth + 1).join('  ') + (ul.localName === 'ol' ? (n++) + '. ' : '- ') + inline(c));
        arr(li.children).filter(function (x) { return x.localName === 'ul' || x.localName === 'ol'; }).forEach(function (x) { list(x, depth + 1); });
      });
    }
    (function walk(el) {
      arr(el.children).forEach(function (c) {
        var t = c.localName;
        if (HEADING.test(t)) { line(''); line(inline(c)); line(''); }
        else if (t === 'p' || t === 'address' || t === 'summary' || t === 'figcaption' || t === 'dt' || t === 'caption') { var s = inline(c); if (s) { line(s); line(''); } }
        else if (t === 'pre') { line(c.textContent); line(''); }
        else if (t === 'ul' || t === 'ol') { list(c, 0); line(''); }
        else if (t === 'table') { arr(c.querySelectorAll('tr')).forEach(function (tr) { line(arr(tr.children).map(inline).join(' | ')); }); line(''); }
        else if (t === 'img' || t === 'cb-bg') { line(imgLine(c)); line(''); }
        else if (t === 'dd') { line('  ' + inline(c)); }
        else if (t === 'hr') { line('---'); line(''); }
        else if (t === 'a' && !c.hasAttribute('data-cba')) { line(inline(c)); line(''); }
        else walk(c);
      });
    })(root);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function imagesCsv(images, pageUrl) {
    var rows = [['#', 'type', 'file', 'src', 'alt', 'alt_status', 'width', 'height', 'links_to', 'hidden_on_page', 'page_url']];
    images.forEach(function (im) {
      rows.push([im.seq, im.kind === 'bg' ? 'css-background' : 'img', im.file, im.src, im.alt === null ? '' : im.alt, im.statusLabel,
        im.width, im.height, im.link, im.hidden ? 'yes' : '', pageUrl || '']);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  /* ---------- backup document ---------- */
  var BACKUP_CSS = [
    ':root{color-scheme:light dark}',
    'body{margin:0 auto;max-width:46rem;padding:2rem 1.25rem 4rem;font:1.0625rem/1.65 Georgia,"Times New Roman",serif;color:#1d2433;background:#fff}',
    '@media (prefers-color-scheme:dark){body{color:#e4e8f0;background:#141a24}.cb-info,.cb-images,.cb-foot{border-color:#334!important}a{color:#9db4ff}}',
    'a{color:#2b57d0}img{max-width:100%;height:auto}',
    'table{border-collapse:collapse;width:100%;margin:1rem 0;font:0.9rem/1.45 system-ui,sans-serif}th,td{border:1px solid #c9d1de;padding:.4rem .55rem;text-align:left;vertical-align:top}',
    '.cb-info,.cb-images,.cb-foot{font:0.9rem/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.cb-info{border-bottom:2px solid #2b57d0;padding-bottom:1rem;margin-bottom:2rem}',
    '.cb-info p{margin:.15rem 0}.cb-kicker{font-weight:700;font-size:1.05rem}',
    '.cb-meta th{width:11rem;white-space:nowrap}.cb-meta td:last-child{width:8.5rem;color:#5a6478}',
    '.cb-images{border-top:2px solid #2b57d0;margin-top:3rem;padding-top:1rem}.cb-images img{width:5.5rem;max-height:5.5rem;object-fit:contain}',
    '.cb-section-title{font-weight:700}.cb-missing{color:#b42318;font-weight:600}',
    '.cb-foot{margin-top:2rem;color:#5a6478;border-top:1px solid #c9d1de;padding-top:1rem}',
    '[data-embed]{font:0.9rem/1.5 system-ui,sans-serif;background:#f1f4f9;padding:.5rem .75rem;border-radius:6px}',
    '@media (prefers-color-scheme:dark){[data-embed]{background:#1f2836}}'
  ].join('\n');

  var SOURCE_LABEL = { capture: 'Captured from the live page in the browser', paste: 'Pasted page source', upload: 'Uploaded saved page', fetch: 'Fetched by URL', render: 'Rendered in a headless browser (JavaScript ran)' };

  function buildDocument(r, contentHtml, images, opts, removedSummary) {
    var m = r.meta;
    var rows = [];
    function row(k, v, note) { rows.push('      <tr><th scope="row">' + esc(k) + '</th><td>' + v + '</td><td>' + esc(note || '') + '</td></tr>'); }
    function txt(v) { return v ? esc(v) : '<span class="cb-missing">Missing</span>'; }
    function link(v) { return v ? '<a href="' + escAttr(v) + '">' + esc(v) + '</a>' : '<span class="cb-missing">Missing</span>'; }
    row('Meta title', txt(m.title), m.title ? clen(m.title) + ' characters' : '');
    row('Meta description', txt(m.description), m.description ? clen(m.description) + ' characters' : '');
    if (opts.metaExtras) {
      row('Canonical', link(r.canonicalAbs), '');
      row('Meta robots', m.robots ? esc(m.robots) : '<span>Not set</span>', '');
      row('H1', r.h1s.length ? r.h1s.map(esc).join('<br>') : '<span class="cb-missing">Missing</span>', r.h1s.length > 1 ? r.h1s.length + ' H1s' : '');
      if (m.ogTitle) row('og:title', esc(m.ogTitle), clen(m.ogTitle) + ' characters');
      if (m.ogDescription) row('og:description', esc(m.ogDescription), clen(m.ogDescription) + ' characters');
      if (m.ogImage) row('og:image', link(m.ogImage), '');
      if (m.lang) row('Language', esc(m.lang), '');
      if (m.hreflang.length) row('hreflang', esc(m.hreflang.length + ' alternates'), '');
    }
    var when = r.capturedAt;
    var human = when;
    try { human = new Date(when).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { }
    var inv = '';
    if (opts.inventory && images.length) {
      inv = '\n<section class="cb-images" aria-label="Image inventory">\n  <p class="cb-section-title">Image inventory: ' + images.length + (images.length === 1 ? ' image' : ' images') + ' in page order</p>\n  <table>\n    <thead><tr><th scope="col">#</th><th scope="col">Preview</th><th scope="col">File</th><th scope="col">Alt text</th><th scope="col">Alt status</th></tr></thead>\n    <tbody>\n' +
        images.map(function (im) {
          var alt = im.kind === 'bg' ? '<em>n/a</em>' : im.alt === null ? '<span class="cb-missing">(no alt attribute)</span>' : im.alt.trim() ? esc(im.alt) : '<em>(empty)</em>';
          return '      <tr><td>' + im.seq + '</td><td>' + (im.src && !im.local ? '<img src="' + escAttr(im.src) + '" alt="" loading="lazy">' : '') + '</td><td>' +
            (im.src ? '<a href="' + escAttr(im.src) + '">' + esc(im.file) + '</a>' : esc(im.file)) + (im.kind === 'bg' ? '<br><small>CSS background</small>' : '') +
            '</td><td>' + alt + '</td><td>' + esc(im.statusLabel) + '</td></tr>';
        }).join('\n') + '\n    </tbody>\n  </table>\n</section>';
    }
    var indented = contentHtml.split('\n').map(function (l) { return l ? '  ' + l : l; }).join('\n');
    return '<!DOCTYPE html>\n<html lang="' + escAttr(m.lang || 'en') + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(m.title || ('Copy backup: ' + (r.pageUrl || r.fileName || 'page'))) + '</title>\n' +
      (m.description ? '<meta name="description" content="' + escAttr(m.description) + '">\n' : '') +
      '<meta name="copy-backup:source" content="' + escAttr(r.pageUrl || '') + '">\n<meta name="copy-backup:captured" content="' + escAttr(when) + '">\n' +
      '<style>\n' + BACKUP_CSS + '\n</style>\n</head>\n<body>\n<header class="cb-info">\n  <p class="cb-kicker">Copy backup</p>\n' +
      '  <p>Page: ' + (r.pageUrl ? '<a href="' + escAttr(r.pageUrl) + '">' + esc(r.pageUrl) + '</a>' : esc(r.fileName || 'Unknown URL')) + '</p>\n' +
      '  <p>Taken <time datetime="' + escAttr(when) + '">' + esc(human) + '</time>. ' + esc(SOURCE_LABEL[r.sourceType] || 'Page source') + '.</p>\n' +
      '  <table class="cb-meta">\n    <tbody>\n' + rows.join('\n') + '\n    </tbody>\n  </table>\n</header>\n<main class="cb-copy">\n' + indented + '\n</main>' + inv +
      '\n<footer class="cb-foot">\n  <p>Content area: ' + esc(r.scope.desc) + '.</p>\n' +
      (removedSummary ? '  <p>Left out: ' + esc(removedSummary) + '.</p>\n' : '') +
      '  <p>Made with Copy Backup. The header block and image inventory are part of the backup, not the page.</p>\n</footer>\n</body>\n</html>\n';
  }

  function summarizeRemoved(removed, excludedCount) {
    var by = {};
    removed.forEach(function (r) { if (r.reason === 'Outside content area') return; by[r.reason] = (by[r.reason] || 0) + 1; });
    var parts = Object.keys(by).map(function (k) { return k.toLowerCase() + ' (' + by[k] + ')'; });
    if (excludedCount) parts.push('blocks you unticked (' + excludedCount + ')');
    return parts.join(', ');
  }

  /* ---------- main entry ---------- */
  function extract(source, userOpts, env) {
    var opts = Object.assign({}, DEFAULT_OPTS, userOpts || {});
    env = env || {};
    var Parser = env.DOMParser || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    var forceKeep = new Set((env.forceKeep || []).map(String));
    var checks = [], removed = [], notes = { ariaHeadings: 0, layoutTables: 0, localPaths: 0 };
    function add(level, text) { checks.push({ level: level, text: text }); }
    var rec = makeRecorder(removed);

    if (!looksLikeHtml(source)) throw new Error('This doesn’t look like page HTML. Paste or upload the full page source, which starts with <!DOCTYPE html> or <html>.');

    var head = source.slice(0, 6000);
    var cm = head.match(/\x3c!--\s*copy-backup-capture\s+url="([^"]*)"\s+captured="([^"]*)"(?:\s+hidden="(\d)")?\s*-->/i);
    var capture = cm ? { url: safeDecode(cm[1]), at: cm[2], hidden: cm[3] === '1' } : null;
    var sf = head.match(/\x3c!--\s*saved from url=\(\d+\)\s*(\S+?)\s*-->/i);
    var doc = new Parser().parseFromString(source, 'text/html');
    var meta = readMeta(doc);

    var entered = normalizeUrl(env.url || '');
    var fileUrl = isHttp(env.fileUrl) ? env.fileUrl : '';
    var pageUrl = [capture && capture.url, env.finalUrl, entered, fileUrl, sf && sf[1], meta.canonical, meta.ogUrl].filter(isHttp)[0] || '';
    var base = pageUrl;
    var baseEl = doc.querySelector('base[href]');
    if (baseEl) { try { base = new URL(baseEl.getAttribute('href'), pageUrl || undefined).href; } catch (e) { } }
    var canonicalAbs = '';
    if (meta.canonical) { try { canonicalAbs = new URL(meta.canonical, base || undefined).href; } catch (e) { canonicalAbs = meta.canonical; } }

    if (env.httpStatus && env.httpStatus >= 400) add('error', 'The server answered HTTP ' + env.httpStatus + ', so this may be an error page rather than the real page.');
    if (capture && entered && !sameUrl(capture.url, entered)) add('warn', 'The captured page (' + capture.url + ') isn’t the URL you entered (' + entered + '). The backup uses the captured page.');
    if (env.finalUrl && entered && !sameUrl(env.finalUrl, entered)) add('info', 'The URL redirected to ' + env.finalUrl + '.');

    // prepass
    arr(doc.querySelectorAll('form')).forEach(function (f) {
      var d = doc.createElement('div');
      arr(f.attributes).forEach(function (a) { if (a.name !== 'action' && a.name !== 'method') d.setAttribute(a.name, a.value); });
      d.setAttribute('data-cb-form', '1');
      while (f.firstChild) d.appendChild(f.firstChild);
      f.parentNode.replaceChild(d, f);
    });
    arr(doc.querySelectorAll('noscript')).forEach(function (ns) {
      var imgs = ns.querySelectorAll('img');
      var parent = ns.parentElement;
      if (!imgs.length || !parent) { ns.remove(); return; }
      var sibling = arr(parent.querySelectorAll('img')).some(function (i) { return !ns.contains(i); });
      if (sibling) ns.remove();
      else { while (ns.firstChild) parent.insertBefore(ns.firstChild, ns); ns.remove(); }
    });
    arr(doc.querySelectorAll('script,style,template,link,meta,iframe[src*="googletagmanager"],iframe[src*="doubleclick"]')).forEach(function (e) { if (!e.closest('head')) e.remove(); });
    var bodyText = doc.body ? normText(doc.body.textContent) : '';
    var scriptCount = (source.match(/\x3cscript\b/gi) || []).length;
    var i = 0;
    if (doc.body) arr(doc.body.querySelectorAll('*')).forEach(function (el) { el.setAttribute('data-cbid', String(i++)); });

    var scope = findScope(doc, opts, add);
    if (scope.H) rec(scope.H, 'Outside content area', { restorable: false, desc: 'Page header ' + describe(scope.H) + ' and everything above it' });
    if (scope.F) rec(scope.F, 'Outside content area', { restorable: false, desc: 'Page footer ' + describe(scope.F) + ' and everything below it' });
    var root0 = doc.createElement('div');
    scope.nodes.forEach(function (n) { root0.appendChild(n); });
    var mainH1 = root0.querySelector('h1') || root0.querySelector('[role="heading"][aria-level="1"]');

    var rule = makeRules(doc, opts, mainH1, add);
    prune(root0, rule, forceKeep, rec, mainH1);
    if (opts.dedupe) dedupeContainers(root0, forceKeep, rec);

    var conv = makeConverter(doc, opts, base, notes);
    var outRoot = doc.createElement('div');
    conv.appendAll(outRoot, conv.finalize(conv.convKids(root0, { hidden: false, pre: false }), 'flow', false));
    tidy(outRoot);
    removeEmpties(outRoot);
    if (opts.dedupe) dedupeBlocks(outRoot, forceKeep, rec);
    removeEmpties(outRoot);
    var blockEls = indexBlocks(outRoot);
    var images = collectImages(outRoot, true);
    var blocks = blockEls.map(blockRecord);

    // stats
    var h1s = arr(outRoot.querySelectorAll('h1')).map(function (h) { return normText(h.textContent); });
    var textForWords = outRoot.cloneNode(true);
    arr(textForWords.querySelectorAll('[data-embed]')).forEach(function (e) { e.remove(); });
    var words = (normText(textForWords.textContent).match(/\S+/g) || []).length;
    var hcount = {};
    for (var lv = 1; lv <= 6; lv++) hcount['h' + lv] = outRoot.querySelectorAll('h' + lv).length;
    var stats = {
      words: words, headings: hcount, paragraphs: outRoot.querySelectorAll('p:not([data-embed])').length,
      lists: outRoot.querySelectorAll('ul,ol').length, tables: outRoot.querySelectorAll('table').length,
      links: outRoot.querySelectorAll('a[href]').length - outRoot.querySelectorAll('[data-embed] a').length,
      images: images.filter(function (x) { return x.kind === 'img'; }).length, backgrounds: images.filter(function (x) { return x.kind === 'bg'; }).length,
      embeds: outRoot.querySelectorAll('[data-embed]').length
    };

    // checks
    var tl = clen(meta.title), dl = clen(meta.description);
    if (BLOCKPAGE_RE.test(meta.title) || (bodyText.length < 1500 && (BLOCKPAGE_RE.test(bodyText) || BLOCKPAGE_SRC_RE.test(source)))) add('error', 'This site showed a bot check instead of the page, so its copy couldn’t be read automatically.');
    if (bodyText.length < 250 && (doc.querySelector('#root,#app,#__next,#__nuxt,[ng-version],app-root,[data-reactroot]') || scriptCount > 5))
      add('error', 'This page builds its copy with JavaScript, and it couldn’t be read automatically.');
    if (!meta.title) add('error', 'No meta title found.');
    else {
      if (meta.titles.length > 1) add('warn', meta.titles.length + ' <title> tags found. The backup uses the first one.');
      if (tl > 60) add('warn', 'Meta title is ' + tl + ' characters, so Google may cut it off (about 50–60 is safe).');
      else if (tl < 30) add('info', 'Meta title is short (' + tl + ' characters).');
    }
    if (!meta.description) add('warn', 'No meta description found.');
    else {
      if (meta.descriptions.length > 1) add('warn', meta.descriptions.length + ' meta descriptions found. The backup uses the first one.');
      if (dl > 160) add('warn', 'Meta description is ' + dl + ' characters, so Google may cut it off (about 150–160 is safe).');
      else if (dl < 70) add('info', 'Meta description is short (' + dl + ' characters).');
    }
    if (/noindex/i.test(meta.robots + ' ' + meta.googlebot)) add('warn', 'The page is set to noindex (' + (meta.robots || meta.googlebot) + ').');
    if (canonicalAbs && pageUrl && !sameUrl(canonicalAbs, pageUrl)) add('info', 'Canonical points to a different URL: ' + canonicalAbs);
    if (!blocks.length) add('error', 'No copy was found between the page’s header and footer.');
    if (blocks.length && !h1s.length) add('warn', 'No H1 heading in the copy.');
    if (h1s.length > 1) add('warn', h1s.length + ' H1 headings in the copy.');
    var prev = 0, skips = [];
    arr(outRoot.querySelectorAll('h1,h2,h3,h4,h5,h6')).forEach(function (h) {
      var l = +h.localName.charAt(1);
      if (prev && l > prev + 1 && skips.length < 3) skips.push('h' + prev + ' → h' + l + ' at “' + snip(h.textContent, 48) + '”');
      prev = l;
    });
    if (skips.length) add('info', 'Heading levels skip: ' + skips.join('; ') + '.');
    var miss = images.filter(function (x) { return x.status === 'missing'; }).length;
    var fn = images.filter(function (x) { return x.status === 'filename'; }).length;
    var emp = images.filter(function (x) { return x.status === 'empty'; }).length;
    if (miss) add('warn', miss + (miss === 1 ? ' image has' : ' images have') + ' no alt attribute.');
    if (fn) add('warn', fn + (fn === 1 ? ' image alt looks' : ' image alts look') + ' like a file name.');
    if (emp) add('info', emp + (emp === 1 ? ' image has' : ' images have') + ' empty alt text (treated as decorative).');
    var hiddenBlocks = blocks.filter(function (b) { return b.hidden; }).length;
    if (hiddenBlocks) add('info', hiddenBlocks + (hiddenBlocks === 1 ? ' block was' : ' blocks were') + ' hidden on the page (closed accordions, tabs or mobile-only copy). They’re kept and marked “hidden”.');
    if (notes.ariaHeadings) add('info', notes.ariaHeadings + ' ARIA heading' + (notes.ariaHeadings === 1 ? ' (role="heading") was' : 's (role="heading") were') + ' saved as real heading tags.');
    if (notes.layoutTables) add('info', notes.layoutTables + ' layout table' + (notes.layoutTables === 1 ? ' was' : 's were') + ' unwrapped so only its copy remains.');
    if (notes.localPaths) add('warn', 'Image paths point to a local “_files” folder from “Save page as → Webpage, Complete”. Save as “Webpage, HTML only” or fetch the page by URL to keep the live image URLs.');
    if (env.rendered) add('info', 'Rendered in a headless browser, so copy built by JavaScript is included' + (env.browserMs ? ' (' + (Math.round(env.browserMs / 100) / 10) + ' s of browser time)' : '') + '.');
    if (!pageUrl) add('info', 'Page URL unknown, so image and link paths are kept exactly as written. Enter the URL to make them absolute.');

    var order = { error: 0, warn: 1, info: 2 };
    checks.sort(function (a, b) { return order[a.level] - order[b.level]; });

    return {
      meta: meta, pageUrl: pageUrl, canonicalAbs: canonicalAbs, capture: capture, entered: entered,
      capturedAt: (capture && capture.at) || new Date().toISOString(),
      sourceType: env.sourceType || (capture ? 'capture' : 'paste'), fileName: env.fileName || '',
      scope: { method: scope.method, desc: scope.desc }, root: outRoot, blocks: blocks, images: images,
      removed: removed, checks: checks, stats: stats, h1s: h1s, words: words, notes: notes
    };
  }

  function exportBackup(result, excluded, userOpts) {
    var opts = Object.assign({}, DEFAULT_OPTS, userOpts || {});
    var root = result.root.cloneNode(true);
    var exCount = 0;
    if (excluded && excluded.size) {
      arr(root.querySelectorAll('[data-cbb]')).forEach(function (el) {
        if (excluded.has(+el.getAttribute('data-cbb'))) { el.remove(); exCount++; }
      });
      removeEmpties(root);
    }
    var images = collectImages(root, false);
    var contentHtml = serializeContent(root);
    var text = toText(root);
    var csv = imagesCsv(images, result.pageUrl);
    var fullHtml = buildDocument(result, contentHtml, images, opts, summarizeRemoved(result.removed, exCount));
    return { contentHtml: contentHtml, fullHtml: fullHtml, text: text, csv: csv, images: images };
  }

  function buildFilename(result, ext) {
    var host = 'page', slug = '';
    try {
      var u = new URL(result.pageUrl);
      host = u.hostname.replace(/^www\./, '');
      slug = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).join('-') || 'home';
    } catch (e) { slug = (result.fileName || 'page').replace(/\.[a-z0-9]+$/i, ''); host = ''; }
    slug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
    var d = new Date(result.capturedAt); if (isNaN(d)) d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
    return ['copy-backup', host, slug, stamp].filter(Boolean).join('_') + '.' + (ext || 'html');
  }

  /* ---------- file decoding (html, htm, mhtml, other charsets) ---------- */
  function tryDecode(bytes, label) {
    try { return new TextDecoder(label || 'utf-8').decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }
  function decodeQP(s, cs) {
    s = s.replace(/=\r?\n/g, '');
    var bytes = new Uint8Array(s.length), n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { bytes[n++] = parseInt(s.substr(i + 1, 2), 16); i += 2; }
      else bytes[n++] = s.charCodeAt(i) & 0xff;
    }
    return tryDecode(bytes.subarray(0, n), cs);
  }
  function decodeB64(s, cs) {
    var bin = atob(s.replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return tryDecode(bytes, cs);
  }
  function parseMHTML(text) {
    var bm = text.slice(0, 4000).match(/boundary="?([^";\r\n]+)"?/i);
    if (!bm) return null;
    var parts = text.split('--' + bm[1]);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].replace(/^\r?\n/, '');
      var sep = part.search(/\r?\n\r?\n/);
      if (sep < 0) continue;
      var headers = part.slice(0, sep);
      if (!/content-type:\s*text\/html/i.test(headers)) continue;
      var body = part.slice(sep).replace(/^\r?\n\r?\n/, '');
      var enc = (headers.match(/content-transfer-encoding:\s*([\w-]+)/i) || [])[1] || '';
      var loc = (headers.match(/content-location:\s*(\S+)/i) || [])[1] || '';
      var cs = (headers.match(/charset="?([\w-]+)/i) || [])[1] || 'utf-8';
      var html = /quoted-printable/i.test(enc) ? decodeQP(body, cs) : /base64/i.test(enc) ? decodeB64(body, cs) : body;
      return { html: html, url: loc };
    }
    return null;
  }
  function decodeFile(buffer, name, contentType) {
    var bytes = new Uint8Array(buffer);
    var headStr = tryDecode(bytes.subarray(0, 4096), 'windows-1252');
    var hinted = (/charset=["']?([\w-]+)/i.exec(contentType || '') || [])[1];
    if (/\.(mhtml?|mht)$/i.test(name || '') || (/^\s*(from:|mime-version:|content-type:\s*multipart\/related)/im.test(headStr) && /multipart\/related/i.test(headStr))) {
      var m = parseMHTML(tryDecode(bytes, 'utf-8'));
      if (!m) throw new Error('Couldn’t find the page inside this MHTML file.');
      return { html: m.html, url: m.url };
    }
    if (/\.webarchive$/i.test(name || '')) throw new Error('Safari .webarchive files aren’t supported. In Safari choose File → Save As → Page Source, or back the page up by URL.');
    var cs = hinted || (headStr.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i) || [])[1];
    var html = tryDecode(bytes, cs && !/^utf-?8$/i.test(cs) ? cs : 'utf-8');
    return { html: html, url: '' };
  }


  /* ---------- tiny zip writer (stored, UTF-8 names) ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (s, a) { return s + a.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var out = new Uint8Array(all.reduce(function (s, a) { return s + a.length; }, 0)), pos = 0;
    all.forEach(function (a) { out.set(a, pos); pos += a.length; });
    return out;
  }

  /* ---------- bookmarklet (runs on the live page) ---------- */
  function captureFn() {
    try {
      var marked = [];
      var all = document.body ? document.body.getElementsByTagName('*') : [];
      for (var i = 0; i < all.length; i++) {
        var cs = window.getComputedStyle(all[i]);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) { all[i].setAttribute('data-cb-hidden', '1'); marked.push(all[i]); }
      }
      var h = '\x3c!-- copy-backup-capture url="' + encodeURI(location.href) + '" captured="' + new Date().toISOString() + '" hidden="1" -->\n<!DOCTYPE html>\n' + document.documentElement.outerHTML;
      for (var j = 0; j < marked.length; j++) marked[j].removeAttribute('data-cb-hidden');
      var kb = Math.round(h.length / 1024);
      var say = function (msg, ok) {
        var d = document.createElement('div');
        d.textContent = msg;
        d.setAttribute('style', 'position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);max-width:90vw;padding:12px 18px;border-radius:10px;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);color:#fff;background:' + (ok ? '#1c7a4c' : '#b42318'));
        document.body.appendChild(d);
        setTimeout(function () { d.remove(); }, 5000);
      };
      var manual = function () {
        var w = document.createElement('div');
        w.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:rgba(10,15,25,.6);display:flex;align-items:center;justify-content:center;font:15px/1.4 system-ui,sans-serif');
        var b = document.createElement('div');
        b.setAttribute('style', 'background:#fff;color:#16213a;padding:18px;border-radius:12px;width:min(640px,92vw)');
        var p1 = document.createElement('p');
        p1.textContent = 'Copy Backup: press Ctrl+C (Cmd+C on Mac) to copy this page, close this box, then paste into Copy Backup.';
        p1.setAttribute('style', 'margin:0 0 10px;font-weight:600');
        b.appendChild(p1);
        var ta = document.createElement('textarea');
        ta.value = h; ta.setAttribute('style', 'width:100%;height:180px;font:12px monospace');
        var x = document.createElement('button');
        x.textContent = 'Close'; x.setAttribute('style', 'margin-top:10px;padding:8px 14px;font:600 14px system-ui');
        x.onclick = function () { w.remove(); };
        b.appendChild(ta); b.appendChild(x); w.appendChild(b); document.body.appendChild(w);
        ta.focus(); ta.select();
      };
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = h; ta.setAttribute('style', 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0');
        document.body.appendChild(ta); ta.focus(); ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { }
        ta.remove();
        if (ok) say('Page captured for Copy Backup (' + kb + ' KB). Go back to the tool and press Ctrl+V.', true); else manual();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(h).then(function () { say('Page captured for Copy Backup (' + kb + ' KB). Go back to the tool and press Ctrl+V.', true); }, fallback);
      } else fallback();
    } catch (e) { alert('Copy Backup capture failed: ' + e.message); }
  }
  function bookmarklet() {
    var src = captureFn.toString().replace(/^function\s*\w*\s*\(\)\s*\{/, '').replace(/\}\s*$/, '');
    src = src.split('\n').map(function (l) { return l.trim(); }).join(' ');
    return 'javascript:' + encodeURIComponent('(function(){' + src + '})();void 0;');
  }

  return {
    DEFAULT_OPTS: DEFAULT_OPTS, extract: extract, exportBackup: exportBackup, buildFilename: buildFilename,
    decodeFile: decodeFile, parseMHTML: parseMHTML, bookmarklet: bookmarklet, looksLikeHtml: looksLikeHtml,
    normalizeUrl: normalizeUrl, summarizeRemoved: summarizeRemoved, makeZip: makeZip
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CB;
