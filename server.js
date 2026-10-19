#!/usr/bin/env node
/*
 * Copy Backup: local server
 * Serves index.html and adds "Fetch automatically", so you can type a URL
 * (or a list of URLs) and get the backup without capturing by hand.
 *
 * Needs Node.js 18 or newer. No npm install, no dependencies.
 *   node server.js            then open http://127.0.0.1:4173
 *
 * Settings (environment variables):
 *   PORT=4173                 port to listen on
 *   HOST=127.0.0.1            use 0.0.0.0 to share with your team on the network
 *   ALLOW_PRIVATE=1           when HOST is not local, also allow fetching
 *                             private/intranet addresses (staging on your LAN)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_ONLY = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
const ALLOW_PRIVATE = LOCAL_ONLY || process.env.ALLOW_PRIVATE === '1';
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 25000;
const MAX_REDIRECTS = 10;
const INDEX = path.join(__dirname, 'index.html');

const AGENTS = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
};

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  const mapped = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/.exec(v.replace(/^::/, '0::'));
  if (mapped || v.startsWith('::ffff:')) {
    const rest = mapped ? mapped[1] : v.slice(7);
    if (net.isIPv4(rest)) return isPrivateIp(rest);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hex) { const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16); return isPrivateIp([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')); }
    return true;
  }
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function checkHost(url) {
  if (ALLOW_PRIVATE) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.some(a => isPrivateIp(a.address))) {
    throw new Error('Private network addresses are blocked on this shared server. Start it with ALLOW_PRIVATE=1 to allow them.');
  }
}

async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { reader.cancel(); throw new Error('The page is larger than 20 MB.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c)));
}

function decode(buf, contentType) {
  let cs = (/charset=["']?([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!cs) cs = (/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1')) || [])[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}

async function fetchPage(target, ua) {
  const headers = {
    'User-Agent': AGENTS[ua] || AGENTS.desktop,
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9'
  };
  if (target.username || target.password) {
    headers.Authorization = 'Basic ' + Buffer.from(decodeURIComponent(target.username) + ':' + decodeURIComponent(target.password)).toString('base64');
    target.username = ''; target.password = '';
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let url = target, redirected = false;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await checkHost(url);
      const res = await fetch(url.href, { headers, redirect: 'manual', signal: ctrl.signal });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url); redirected = true;
        if (!/^https?:$/.test(url.protocol)) throw new Error('The page redirected to a non-web address.');
        continue;
      }
      const type = res.headers.get('content-type') || '';
      if (type && !/html|xml|text\/plain/i.test(type)) {
        return { ok: false, error: 'The URL returned ' + type.split(';')[0] + ', not a web page.' };
      }
      const html = decode(await readCapped(res), type);
      return { ok: true, status: res.status, finalUrl: url.href, redirected, contentType: type, html };
    }
    throw new Error('Too many redirects.');
  } finally {
    clearTimeout(timer);
  }
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local');
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Only GET is supported.' });
  if (u.pathname === '/' || u.pathname === '/index.html') {
    let page;
    try { page = fs.readFileSync(INDEX, 'utf8'); } catch (e) { return send(res, 500, 'text/plain; charset=utf-8', 'index.html must sit next to server.js.'); }
    page = page.replace('<meta name="cb-proxy" content="">', '<meta name="cb-proxy" content="/api/fetch">');
    return send(res, 200, 'text/html; charset=utf-8', page);
  }
  if (u.pathname === '/api/health') return json(res, 200, { ok: true });
  if (u.pathname === '/api/fetch') {
    if (u.searchParams.has('ping')) return json(res, 200, { ok: true, service: 'local' });
    let target;
    try { target = new URL(u.searchParams.get('url') || ''); } catch (e) { return json(res, 400, { ok: false, error: 'That isn’t a valid URL.' }); }
    if (!/^https?:$/.test(target.protocol)) return json(res, 400, { ok: false, error: 'Only http and https URLs can be fetched.' });
    const started = Date.now();
    try {
      const out = await fetchPage(target, u.searchParams.get('ua'));
      console.log(`${out.ok ? out.status : 'skip'}  ${Date.now() - started} ms  ${target.href}`);
      return json(res, 200, out);
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'The site took longer than 25 seconds to answer.'
        : /blocked/.test(e.message) || /redirect|larger/.test(e.message) ? e.message
          : 'Couldn’t fetch the page (' + ((e.cause && e.cause.code) || e.message) + ').';
      console.log(`fail  ${target.href}  ${msg}`);
      return json(res, 200, { ok: false, error: msg });
    }
  }
  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Copy Backup is running at http://${shown}:${PORT}`);
  if (!LOCAL_ONLY) console.log(`Shared on your network. Private addresses are ${ALLOW_PRIVATE ? 'allowed' : 'blocked (set ALLOW_PRIVATE=1 to allow)'}.`);
  console.log('Press Ctrl+C to stop.');
});
