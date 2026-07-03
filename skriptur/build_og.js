// ─────────────────────────────────────────────────────────────
// build_og.js — OG/deilingar-myndin (LOTA 23): 1200×630 PNG úr inline-SVG
// með gyllta karpanum og merkinu. Keyrt EINU SINNI handvirkt (statísk mynd,
// ekki í cron). Úttak: web/public/og-karp.png → og:image í Layout.
// ─────────────────────────────────────────────────────────────
const sharp = require('sharp');
const path = require('path');

// Karpurinn úr KarpFish.astro, speglaður til hægri, skalaður inn í 1200×630
const fish = `
  <g transform="translate(870,315) scale(3.4) translate(-50,-50)">
    <g transform="translate(100,0) scale(-1,1)">
      <path d="M78 50 L96 34 Q91 50 96 66 Z" fill="#c98a26"/>
      <path d="M38 32 Q52 14 68 30 L60 38 Q48 30 42 36 Z" fill="#c98a26"/>
      <path d="M46 68 Q52 82 62 78 L56 66 Z" fill="#c98a26"/>
      <ellipse cx="48" cy="50" rx="34" ry="21" fill="#f6b13b"/>
      <g fill="none" stroke="#c98a26" stroke-width="1.6" opacity=".45">
        <path d="M36 40 q5 5 0 10 M48 38 q5 6 0 12 M60 40 q5 5 0 10"/>
        <path d="M42 52 q5 5 0 10 M54 52 q5 5 0 10 M66 50 q4 5 0 10"/>
      </g>
      <path d="M30 33 Q20 50 30 67" fill="none" stroke="#c98a26" stroke-width="2" opacity=".6"/>
      <circle cx="24" cy="45" r="5.2" fill="#0b1220"/>
      <circle cx="22.4" cy="43.4" r="1.7" fill="#eaf1fb"/>
      <path d="M14.5 52 q3 2.4 6 1.6" fill="none" stroke="#0b1220" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M15 56 q-3 5 -7 5.5 M19 58 q-1 5 -4.5 7" fill="none" stroke="#c98a26" stroke-width="1.7" stroke-linecap="round"/>
    </g>
  </g>
  <g fill="none" stroke="#7fd0ff" stroke-width="3" opacity=".55">
    <circle cx="1046" cy="212" r="9"/><circle cx="1072" cy="176" r="6"/><circle cx="1058" cy="140" r="4"/>
  </g>`;

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b1220"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <defs>
    <radialGradient id="g" cx="72%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#16233c"/><stop offset="100%" stop-color="#0b1220"/>
    </radialGradient>
  </defs>
  <rect x="0" y="618" width="1200" height="12" fill="#f6b13b"/>
  ${fish}
  <text x="80" y="270" font-family="Segoe UI, Arial, sans-serif" font-size="118" font-weight="800" fill="#f6b13b" letter-spacing="14">KARP</text>
  <text x="84" y="340" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="600" fill="#eaf1fb">Hagvísir Íslands</text>
  <text x="84" y="404" font-family="Segoe UI, Arial, sans-serif" font-size="25" fill="#9fb0c8">Efnahagur · Alþingi · sveitarfélög · markaðir</text>
  <text x="84" y="442" font-family="Segoe UI, Arial, sans-serif" font-size="25" fill="#9fb0c8">— opinber gögn á mannamáli, uppfærð daglega</text>
  <text x="84" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="#7e8ca6">karp.is</text>
</svg>`;

sharp(Buffer.from(svg)).png().toFile(path.join(__dirname, '..', 'web', 'public', 'og-karp.png'))
  .then((info) => console.log('Skrifað: web/public/og-karp.png ·', info.width + '×' + info.height, '·', Math.round(info.size / 1024), 'KB'))
  .catch((e) => { console.error(e); process.exit(1); });
