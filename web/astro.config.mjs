import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';

// #2 sameining: Astro-appið (web/) býr í repo-inu og importar úr sameiginlega
// src/lib gegnum @lib-alias. Gamla build_app.js → dist/karp-app.js stendur ÓSNERT.
export default defineConfig({
  site: 'https://karp.is',       // fyrir sitemap + canonical (breyta ef annað lén)
  output: 'static',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: (page) => !/\/mitt-svaedi\/?$/.test(page) && !/\/skel-fyrirtaeki\/?$/.test(page) })], // Mitt svæði = noindex
  vite: {
    resolve: {
      alias: {
        '@lib': fileURLToPath(new URL('../src/lib', import.meta.url)),
        '@gogn': fileURLToPath(new URL('../gogn', import.meta.url)), // byggingartíma-gögn
      },
    },
  },
});
