/*
 * Copy Backup: fetch service for Cloudflare Pages (free plan).
 * Pages runs this file automatically when it sits next to index.html.
 * It serves the tool and adds /api/fetch, which powers "Fetch automatically".
 *
 * Optional setting (Cloudflare dashboard → your Pages project → Settings →
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
  if (url.searchParams.has('ping')) return json(200, { ok: true, service: 'cloudflare' });

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
  const blocked = () => json(403, { ok: false, error: 'This copy of Copy Backup only fetches ' + allow.join(', ') + '. Use Capture from browser for other sites.' });
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fetch') return handleFetch(request, url, env);
    return env.ASSETS.fetch(request);
  }
};
