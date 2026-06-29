const KEY = '6c6db4894035b383456c09e6fc0e64ce';
const EP = 'https://karp.is/wp-json/royal-mcp/v1/pages';
const pages = [
  { key: 'verdlag',     title: 'Hagvísir – Verðlag og vextir',           slug: 'hagvisir-verdlag' },
  { key: 'hagvoxtur',   title: 'Hagvísir – Hagvöxtur og vinnumarkaður',  slug: 'hagvisir-hagvoxtur' },
  { key: 'heimilin',    title: 'Hagvísir – Heimilin',                    slug: 'hagvisir-heimilin' },
  { key: 'riki',        title: 'Hagvísir – Ríki og útlönd',              slug: 'hagvisir-riki' },
  { key: 'althjodlegt', title: 'Hagvísir – Alþjóðlegt',                  slug: 'hagvisir-althjodlegt' }
];
(async () => {
  for (const p of pages) {
    try {
      const r = await fetch(EP, {
        method: 'POST',
        headers: { 'X-Royal-MCP-API-Key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: p.title, slug: p.slug, status: 'publish', content: '[wpcode id="2867"]' })
      });
      const j = await r.json();
      const pg = j.page || j;
      console.log(p.key.padEnd(12), 'http', r.status, '| id', pg.id, '| slug:', pg.slug, '|', pg.permalink);
    } catch (e) { console.log(p.key, 'ERROR', e.message); }
  }
})();
