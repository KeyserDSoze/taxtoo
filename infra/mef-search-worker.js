/**
 * Taxtoo — MEF web-search Worker (keyless, DuckDuckGo HTML).
 *
 * Fallback used when the MEF dataset has no resolution for a comune/year: the app
 * searches the web for the municipal IMU rate (aliquota) and lets the AI extract it.
 *
 * This Worker is a thin, CORS-enabled search+fetch proxy. It does NOT use any API key.
 * It scrapes the DuckDuckGo HTML endpoint (no JS), then fetches the top result pages
 * and returns their stripped text so the client AI can read them.
 *
 *   GET /?q=<query>&n=<numResults 1..5>
 *   ->  { results: [ { url, title, snippet, text } ] }
 *
 * Deploy:
 *   1. https://dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *   2. Paste this file, Deploy.
 *   3. Put the Worker URL in VITE_MEF_SEARCH_PROXY (.env + GitHub secret).
 *
 * Note: keyless scraping is best-effort and may be rate-limited or blocked by DDG.
 * If it becomes unreliable, switch to a search API (Serper/Brave) with a key.
 */

const ALLOWED_ORIGINS = ['https://taxtoo.app', 'http://localhost:54321', 'http://localhost:5173'];

const MAX_RESULTS = 5;
const PER_PAGE_TEXT_LIMIT = 6000; // chars of stripped text per page
const FETCH_TIMEOUT_MS = 12000;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** Decode a DuckDuckGo redirect href (//duckduckgo.com/l/?uddg=ENCODED&...) to a real URL. */
function decodeDdgHref(href) {
  try {
    let u = href;
    if (u.startsWith('//')) u = 'https:' + u;
    const url = new URL(u, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return url.href;
  } catch {
    return null;
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'");
}

/** Parse DuckDuckGo HTML results into {url, title, snippet}. */
function parseDdgResults(html, limit) {
  const results = [];
  // Result anchors: <a ... class="result__a" href="...">TITLE</a>
  const anchorRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Snippets: <a ... class="result__snippet" ...>SNIPPET</a>
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const snippets = [];
  let sm;
  while ((sm = snippetRe.exec(html)) !== null) {
    snippets.push(decodeEntities(stripHtml(sm[1])));
  }

  let m;
  let i = 0;
  while ((m = anchorRe.exec(html)) !== null && results.length < limit) {
    const url = decodeDdgHref(m[1]);
    const title = decodeEntities(stripHtml(m[2]));
    if (!url || !/^https?:\/\//i.test(url)) {
      i++;
      continue;
    }
    results.push({ url, title, snippet: snippets[i] ?? '' });
    i++;
  }
  return results;
}

async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const n = Math.min(MAX_RESULTS, Math.max(1, parseInt(url.searchParams.get('n') || '3', 10)));
    if (!q) {
      return new Response(JSON.stringify({ error: 'missing q' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    try {
      // 1) DuckDuckGo HTML search (no JS, no key).
      const searchResp = await fetchWithTimeout(
        'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q),
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
            Accept: 'text/html',
            'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
          },
        }
      );
      if (!searchResp.ok) {
        return new Response(JSON.stringify({ error: 'search HTTP ' + searchResp.status, results: [] }), {
          status: 502,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const searchHtml = await searchResp.text();
      const found = parseDdgResults(searchHtml, n);

      // 2) Fetch top result pages and strip their text (best-effort, parallel).
      const results = await Promise.all(
        found.map(async (r) => {
          try {
            const pageResp = await fetchWithTimeout(r.url, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
              },
            });
            const ctype = (pageResp.headers.get('Content-Type') || '').toLowerCase();
            const isBinary =
              ctype.includes('application/pdf') ||
              ctype.startsWith('image/') ||
              ctype.includes('octet-stream');
            let text = '';
            if (pageResp.ok && !isBinary) {
              // Read as text regardless of exact text/* subtype (many PA sites send
              // text/html;charset=ISO-8859-1 or application/xhtml+xml).
              const body = await pageResp.text();
              text = stripHtml(body).slice(0, PER_PAGE_TEXT_LIMIT);
            }
            return { url: r.url, title: r.title, snippet: r.snippet, text };
          } catch {
            return { url: r.url, title: r.title, snippet: r.snippet, text: '' };
          }
        })
      );

      return new Response(JSON.stringify({ query: q, results }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e), results: [] }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
