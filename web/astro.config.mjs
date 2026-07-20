import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';

// #2 sameining: Astro-appið (web/) býr í repo-inu og importar úr sameiginlega
// src/lib gegnum @lib-alias. Gamla build_app.js → dist/karp-app.js stendur ÓSNERT.
export default defineConfig({
  site: 'https://karp.is',       // fyrir sitemap + canonical (breyta ef annað lén)
  output: 'static',
  build: { format: 'directory' },
  // Sitemap: sleppa auth-/utility-/redirect-/noindex-síðum (#4) — annars misvísandi crawl-merki.
  integrations: [sitemap({ filter: (page) => !/\/(mitt-svaedi|skel-fyrirtaeki|innskra|nyskraning|endurstilla|kaup|greining|areidanleiki|atvinnuleysi|efnahagur)\/?$/.test(page) })],
  vite: {
    resolve: {
      alias: {
        '@lib': fileURLToPath(new URL('../src/lib', import.meta.url)),
        '@gogn': fileURLToPath(new URL('../gogn', import.meta.url)), // byggingartíma-gögn
      },
    },
  },
});
