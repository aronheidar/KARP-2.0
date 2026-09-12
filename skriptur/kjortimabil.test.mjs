// Kjörtímabilið er EINA talan í Alþingis-pípunni sem verður ekki leidd af API-inu — Alþingi
// birtir ekkert kjörtímabils-hugtak, og bæði merkin sem voru prófuð 12.9.2026 brugðust
// (þingmannalistinn telur varaþingmenn; bil milli þinga missir kosningarnar 2016/2017/2021).
// Hún er því skráð í gogn/kjortimabil.json — og þessi próf sjá til þess að hún geti ekki rotnað
// í kyrrþey eins og `const LTHING = 157` gerði í seldu þingmannaskýrslunni.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GOGN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'gogn');
const les = (f) => JSON.parse(fs.readFileSync(path.join(GOGN, f), 'utf8'));

test('kjortimabil.json er gilt og ber upphafsþing + kosningadag', () => {
  const k = les('kjortimabil.json');
  assert.ok(Number.isInteger(k.fra) && k.fra > 100, 'fra á að vera löggjafarþings-númer');
  assert.match(k.kosningar, /^\d{4}-\d{2}-\d{2}$/, 'kosningar á ISO-formi');
  assert.ok((k.athugasemd || '').length > 40, 'athugasemd útskýri hvað á að gera eftir kosningar');
});

test('þingmannaskýrslan nær yfir samfellt kjörtímabil frá skráðu upphafsþingi', () => {
  const k = les('kjortimabil.json');
  const t = les('thingskyrsla.json');
  assert.ok(Array.isArray(t.thing), 'thing á að vera FYLKI þinga, ekki ein tala — eitt þing var gamla gildran');
  assert.equal(t.thing[0], k.fra, 'skýrslan á að byrja á upphafsþingi kjörtímabilsins');
  assert.equal(t.thing[0], t.kjortimabil.fra);
  assert.equal(t.thing[t.thing.length - 1], t.kjortimabil.til);
  for (let i = 1; i < t.thing.length; i++) {
    assert.equal(t.thing[i], t.thing[i - 1] + 1, 'þingin eiga að vera samfelld — gat þýðir tapað þing');
  }
});

test('hver uppreisn, flutt mál og fyrirspurn ber þingið sitt (annars vísar hlekkur á rangt mál)', () => {
  const t = les('thingskyrsla.json');
  const gild = new Set(t.thing);
  let n = 0;
  for (const mp of Object.values(t.mp)) {
    for (const r of [...mp.rebel, ...mp.flutt, ...mp.fyrirspurnir]) {
      assert.ok(gild.has(r.lt), `lt=${r.lt} er utan kjörtímabilsins ${JSON.stringify(t.thing)}`);
      n++;
    }
  }
  assert.ok(n > 0, 'ekkert að prófa — skýrslan er tóm');
});

test('nafnaköllin ná yfir fleira en eitt þing þegar kjörtímabilið gerir það', () => {
  const t = les('thingskyrsla.json');
  if (t.thing.length < 2) return;                       // rétt eftir kosningar: aðeins eitt þing
  const thingMedUppreisn = new Set(
    Object.values(t.mp).flatMap((m) => m.rebel.map((r) => r.lt)),
  );
  assert.ok(thingMedUppreisn.size >= 2,
    'aðeins eitt þing á bak við uppreisnirnar — lykkjan safnar líklega ekki þvert á þing');
});
