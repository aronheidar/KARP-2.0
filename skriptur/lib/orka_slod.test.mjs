// skriptur/lib/orka_slod.test.mjs
// ⚠ 21.9.2026: /orka/ endaði í 2024 því build_orka.js harðkóðaði slóð útgáfu OS-2025-1. Ný útgáfa
// (ROS-2026-1, 1969–2025) kom 1.4.2026 undir nýju auðkenni sem enginn hefði getað giskað á.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { nyjastaRaforkuSlod, slodarKostir } = require('./orka_slod.cjs');

const SIDA = `<a href="https://vefskrar.orkustofnun.is/Talnaefni/OS-2024-16-throun-raforkuframleidslu-a-islandi-1969-2023.xlsx">2023</a>
<a href="https://vefskrar.orkustofnun.is/Talnaefni/ROS-2026-1-throun-raforkuframleidslu-a-islandi-1969-2025+(2).xlsx">2025</a>
<a href="https://vefskrar.orkustofnun.is/Talnaefni/OS-2025-1-throun-raforkuframleidslu-a-islandi-1969-2024.xlsx">2024</a>
<a href="/upplysingar/talnaefni/raforka/annad.xlsx">annað</a>`;

test('velur útgáfuna með hæsta lokaárinu, óháð röð og auðkenni', () => {
  const r = nyjastaRaforkuSlod(SIDA);
  assert.equal(r.ar, 2025);
  assert.match(r.slod, /ROS-2026-1-.*1969-2025/);
});

test('afstæð slóð er leyst á móti síðunni', () => {
  const r = nyjastaRaforkuSlod('<a href="/Talnaefni/X-throun-raforkuframleidslu-1969-2026.xlsx">x</a>', 'https://orkustofnun.is/upplysingar/talnaefni/raforka');
  assert.equal(r.slod, 'https://orkustofnun.is/Talnaefni/X-throun-raforkuframleidslu-1969-2026.xlsx');
});

test('enginn hlekkur → null (skriptan heldur þá fyrri skrá)', () => {
  assert.equal(nyjastaRaforkuSlod('<a href="a.pdf">a</a>'), null);
});

test('„+" í slóðinni getur verið bil: báðar útgáfur reyndar', () => {
  assert.deepEqual(slodarKostir('https://x.is/a-1969-2025+(2).xlsx'), ['https://x.is/a-1969-2025+(2).xlsx', 'https://x.is/a-1969-2025%20(2).xlsx']);
  assert.deepEqual(slodarKostir('https://x.is/a.xlsx'), ['https://x.is/a.xlsx']);
});
