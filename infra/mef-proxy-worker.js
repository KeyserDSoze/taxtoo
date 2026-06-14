/**
 * Taxtoo MEF CORS proxy — Cloudflare Worker.
 *
 * The Italian MEF publishes municipal IMU resolution archives (datizip) WITHOUT
 * CORS headers, so a browser on https://taxtoo.app cannot fetch them directly.
 * This tiny Worker forwards a whitelisted MEF request and adds CORS headers.
 * It holds NO state and NO secrets — it just passes bytes through.
 *
 * Deploy (free):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file, Deploy. You get https://<name>.<sub>.workers.dev
 *   3. Put that base URL in the app env: VITE_MEF_PROXY=https://<name>.<sub>.workers.dev
 *
 * Usage from the app:
 *   GET https://<worker>/?path=2026/abruzzo.zip
 */

const MEF_BASE =
  'https://www1.finanze.gov.it/dipartimentopolitichefiscali/fiscalitalocale/tributi_locali/datizip/';

// Restrict which origins may use the proxy (avoid being an open proxy).
const ALLOWED_ORIGINS = [
  'https://taxtoo.app',
  'http://localhost:54321',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=86400',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';

    // Only allow "<year>/<region>.zip" — no traversal, no arbitrary URLs.
    if (!/^\d{4}\/[a-z-]+\.zip$/.test(path)) {
      return new Response('Bad path', { status: 400, headers: corsHeaders(origin) });
    }

    const upstream = await fetch(MEF_BASE + path, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });

    const headers = new Headers(corsHeaders(origin));
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/zip');
    const len = upstream.headers.get('Content-Length');
    if (len) headers.set('Content-Length', len);

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
