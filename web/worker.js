// karp21 Worker (LOTA 13): þjónar static-assets ÁFRAM en bætir við smá-proxy-um
// fyrir lifandi gögn sem hafa ekki CORS fyrir app.karp.is. Skyndiminni í caches.default.
const PROXIES = {
  // ✈️ OpenSky: lifandi flug yfir Íslandi (bbox). 5-mín cache heldur okkur innan kvóta.
  '/api/flug': {
    url: 'https://opensky-network.org/api/states/all?lamin=62.5&lomin=-26&lamax=67.5&lomax=-12',
    ttl: 300,
  },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const proxy = PROXIES[url.pathname];
    if (proxy) {
      const cache = caches.default;
      const cacheKey = new Request('https://cache.karp.internal' + url.pathname);
      let res = await cache.match(cacheKey);
      if (!res) {
        try {
          const up = await fetch(proxy.url, { headers: { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)' } });
          const body = await up.text();
          res = new Response(up.ok ? body : JSON.stringify({ error: up.status }), {
            status: 200,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'access-control-allow-origin': '*',
              'cache-control': `public, max-age=${proxy.ttl}`,
            },
          });
          ctx.waitUntil(cache.put(cacheKey, res.clone()));
        } catch (e) {
          res = new Response(JSON.stringify({ error: 'upstream' }), { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
        }
      }
      return res;
    }
    return env.ASSETS.fetch(request);
  },
};
