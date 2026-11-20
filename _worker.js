/*
 * Copy Backup: fetch service for Cloudflare Pages (free plan).
 * Pages runs this file automatically when it sits next to index.html.
 * It serves the tool and adds /api/fetch, which powers "Fetch automatically".
 *
 * If wrangler.jsonc has a "browser" binding, pages that are built by
 * JavaScript or come back blocked can be re-fetched in a real headless browser
 * (Cloudflare Browser Run; the free plan allows 10 minutes a day).
 *
 * Optional setting (Cloudflare dashboard → your Worker → Settings →
 * Variables and Secrets):
 *   ALLOWED_HOSTS = acme.in, acme.com      only fetch these domains (and their
 *                                          subdomains). Leave unset to allow any site.
 */
const AGENTS = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
};
const MAX_REDIRECTS = 10;
const TIMEOUT_MS = 25000;
const MAX_BYTES = 25 * 1024 * 1024;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

function allowedHost(hostname, allow) {
  if (!allow.length) return true;
  const h = hostname.toLowerCase();
  return allow.some(a => h === a || h.endsWith('.' + a));
}

async function handleFetch(request, url, env) {
  if (request.method !== 'GET') return json(405, { ok: false, error: 'Only GET is supported.' });
  if (url.searchParams.has('ping')) return json(200, { ok: true, service: 'cloudflare', render: !!env.BROWSER });

  // Only answer the Copy Backup page on this same site. Browsers set this header
  // and pages can't fake it, so other websites can't use this service.
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') {
    return json(403, { ok: false, error: 'This fetch service only answers the Copy Backup page on this site.' });
  }

  let target;
  try { target = new URL(url.searchParams.get('url') || ''); } catch (e) { return json(400, { ok: false, error: 'That isn’t a valid URL.' }); }
  if (!/^https?:$/.test(target.protocol)) return json(400, { ok: false, error: 'Only http and https URLs can be fetched.' });

  const allow = String(env.ALLOWED_HOSTS || '').split(/[\s,]+/).map(s => s.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
  const blocked = () => json(403, { ok: false, error: 'This copy of Copy Backup only fetches ' + allow.join(', ') + '. For other sites, paste the page source instead.' });
  if (!allowedHost(target.hostname, allow)) return blocked();

  const headers = {
    'User-Agent': AGENTS[url.searchParams.get('ua')] || AGENTS.desktop,
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9'
  };
  if (target.username || target.password) {
    headers.Authorization = 'Basic ' + btoa(decodeURIComponent(target.username) + ':' + decodeURIComponent(target.password));
    target.username = '';
    target.password = '';
  }

  if (url.searchParams.get('mode') === 'render') return renderPage(target, url.searchParams.get('ua'), headers, env, allow);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let current = target;
    let redirected = false;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current.href, { headers, redirect: 'manual', signal: ctrl.signal });
      const loc = res.headers.get('Location');
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        redirected = true;
        if (!/^https?:$/.test(current.protocol)) return json(200, { ok: false, error: 'The page redirected to a non-web address.' });
        if (!allowedHost(current.hostname, allow)) return blocked();
        continue;
      }
      const type = res.headers.get('Content-Type') || '';
      if (type && !/html|xml|text\/plain/i.test(type)) {
        return json(200, { ok: false, error: 'The URL returned ' + type.split(';')[0] + ', not a web page.' });
      }
      const len = parseInt(res.headers.get('Content-Length') || '0', 10);
      if (len > MAX_BYTES) return json(200, { ok: false, error: 'The page is larger than 25 MB.' });
      // Stream the page through untouched. It's labelled as a download with a
      // sandbox policy so it can never run as a web page on this site.
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="page.html"',
          'Content-Security-Policy': 'sandbox; default-src \'none\'',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
          'X-CB-Status': String(res.status),
          'X-CB-Final-Url': current.href,
          'X-CB-Content-Type': type,
          'X-CB-Redirected': redirected ? '1' : '0'
        }
      });
    }
    return json(200, { ok: false, error: 'Too many redirects.' });
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'The site took longer than 25 seconds to answer.' : 'Couldn’t fetch the page (' + ((e && e.message) || 'network error') + ').';
    return json(200, { ok: false, error: msg });
  } finally {
    clearTimeout(timer);
  }
}

function streamHeaders(extra) {
  return Object.assign({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="page.html"',
    'Content-Security-Policy': 'sandbox; default-src \'none\'',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  }, extra);
}

// Re-fetch the page in Cloudflare's headless browser so JavaScript-built copy is included.
async function renderPage(target, ua, headers, env, allow) {
  if (!env.BROWSER) {
    return json(200, { ok: false, error: 'Browser rendering isn’t switched on for this copy of Copy Backup.' });
  }
  const options = {
    url: target.href,
    gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 },
    rejectResourceTypes: ['image', 'media', 'font'],
    userAgent: AGENTS[ua] || AGENTS.desktop
  };
  if (headers.Authorization) {
    const pair = atob(headers.Authorization.slice(6));
    const i = pair.indexOf(':');
    options.authenticate = { username: pair.slice(0, i), password: pair.slice(i + 1) };
  }
  let res;
  try {
    res = await env.BROWSER.quickAction('content', options);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (e instanceof TypeError || /not a function|does not implement|quickAction/i.test(msg)) return json(200, { ok: false, error: 'Browser rendering isn’t available on this Cloudflare account yet. Check that wrangler.jsonc has a compatibility date of 2026-03-24 or later.' });
    if (/429|limit/i.test(msg)) return json(429, { ok: false, busy: true, error: 'The browser renderer is busy or over today’s free limit.' });
    return json(200, { ok: false, error: 'The browser couldn’t load the page (' + msg.slice(0, 160) + ').' });
  }
  const used = res.headers.get('X-Browser-Ms-Used') || '';
  const type = res.headers.get('Content-Type') || '';
  if (res.status === 429) {
    return json(429, { ok: false, busy: true, error: 'The free plan renders one page every 10 seconds and 10 minutes a day. Wait a moment and try again.' });
  }
  let html = '', finalUrl = target.href, status = 200;
  if (/json/i.test(type)) {
    let data = null;
    try { data = await res.json(); } catch (e) { }
    if (!data || data.success === false || !res.ok) {
      const err = data && data.errors && data.errors[0];
      const busy = !!(err && (err.code === 2001 || /rate|limit/i.test(err.message || '')));
      return json(busy ? 429 : 200, { ok: false, busy, error: 'The browser couldn’t render the page' + (err && err.message ? ' (' + err.message + ')' : '') + '.' });
    }
    html = typeof data.result === 'string' ? data.result : (data.result && (data.result.content || data.result.html)) || '';
    if (data.meta) { finalUrl = data.meta.finalUrl || data.meta.url || finalUrl; status = data.meta.status || status; }
  } else {
    if (!res.ok) return json(200, { ok: false, error: 'The browser couldn’t render the page (HTTP ' + res.status + ').' });
    html = await res.text();
  }
  if (!html) return json(200, { ok: false, error: 'The browser returned an empty page.' });
  try { if (!allowedHost(new URL(finalUrl).hostname, allow)) return json(403, { ok: false, error: 'The page redirected to a site this copy of Copy Backup doesn’t fetch.' }); } catch (e) { finalUrl = target.href; }
  return new Response(html, {
    status: 200,
    headers: streamHeaders({
      'X-CB-Status': String(status), 'X-CB-Final-Url': finalUrl, 'X-CB-Content-Type': 'text/html; charset=utf-8',
      'X-CB-Redirected': finalUrl !== target.href ? '1' : '0', 'X-CB-Rendered': '1', 'X-CB-Browser-Ms': used
    })
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fetch') return handleFetch(request, url, env);
    return env.ASSETS.fetch(request);
  }
};
