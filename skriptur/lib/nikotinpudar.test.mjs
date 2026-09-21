// skriptur/lib/nikotinpudar.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thattaSitemap, thattaToflu, thattaStyrk, thattaVerd, thattaVoru, flokka } from './nikotinpudar.mjs';

test('flokkun: ein tala er rafretta (mg/ml), ekki óþáttaður púði', () => {
  assert.equal(flokka({ strengur: '13,5 – 19,3', mgG: 19.3 }), 'pudi');
  assert.equal(flokka({ strengur: '20', mgG: null }), 'rafretta');
  assert.equal(flokka({ strengur: '0', mgG: null }), 'rafretta');
  assert.equal(flokka({ strengur: '12mg, 20mg', mgG: null }), 'othattad');
  assert.equal(flokka({ strengur: null, mgG: null }), null);
});

const SIDA = `<h1 class="product_title entry-title">Zyn Blackcurrant Ice #5</h1>
<p class="price"><del aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi>1.395&nbsp;<span>kr.</span></bdi></span></del>
<ins aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi>1.295&nbsp;<span>kr.</span></bdi></span></ins></p>
<script type="application/ld+json">{"@context":"https://schema.org/","@graph":[{"@type":"Product","name":"Zyn Blackcurrant Ice #5","offers":[{"@type":"Offer","priceSpecification":[{"@type":"UnitPriceSpecification","price":"1295","priceCurrency":"ISK"},{"@type":"UnitPriceSpecification","price":"1395","priceCurrency":"ISK","priceType":"https://schema.org/ListPrice"}]}]}]}</script>
<table><tr><td>Vörumerki</td><td>Zyn</td></tr>
<tr><td>Magn í dós (g)</td><td>14,7</td></tr>
<tr><td>Nikótínstyrkur (mg/púði) (mg/g)</td><td>13,5 &#8211; 19,3</td></tr>
<tr><td>Púðar í dós</td><td>21</td></tr></table>`;

test('veftréð: aðeins vörusíður', () => {
  const xml = '<url><loc>https://svens.is/products/a/</loc></url><url><loc>https://svens.is/collections/b/</loc></url>';
  assert.deepEqual(thattaSitemap(xml), ['https://svens.is/products/a/']);
});

test('⚠ taflan er <td> í BÁÐUM dálkum — fyrsta talningin las <th> og fékk ekkert', () => {
  const t = thattaToflu(SIDA);
  assert.equal(t['Magn í dós (g)'], '14,7');
  assert.equal(t['Nikótínstyrkur (mg/púði) (mg/g)'], '13,5 – 19,3');
});

test('styrkur: bæði „13,5 – 19,3" og „12,5-20"', () => {
  assert.deepEqual(thattaStyrk('13,5 – 19,3'), { mgPudi: 13.5, mgG: 19.3 });
  assert.deepEqual(thattaStyrk('12,5-20'), { mgPudi: 12.5, mgG: 20 });
});

test('annað snið er ÓÞÁTTAÐ, aldrei giskað', () => {
  assert.equal(thattaStyrk('12mg, 20mg'), null);
  assert.equal(thattaStyrk(''), null);
  assert.equal(thattaStyrk(null), null);
});

test('verð: núverandi verð úr JSON-LD, ekki listaverðið fyrir útsölu', () => {
  assert.equal(thattaVerd(SIDA), 1295);
});

test('verð: varaleið um <ins> ef JSON-LD vantar', () => {
  const an = SIDA.replace(/<script[\s\S]*?<\/script>/, '');
  assert.equal(thattaVerd(an), 1295);
});

test('ein vörusíða → færsla', () => {
  assert.deepEqual(thattaVoru(SIDA, 'https://svens.is/products/x/'), {
    nafn: 'Zyn Blackcurrant Ice #5', slod: 'https://svens.is/products/x/', verd: 1295,
    dosG: 14.7, strengur: '13,5 – 19,3', mgPudi: 13.5, mgG: 19.3,
  });
});

test('síða án nikótínstyrks (aukahlutur) skilar strengur=null', () => {
  const v = thattaVoru('<h1>Dósahylki</h1><table><tr><td>Litur</td><td>Svart</td></tr></table>', 's');
  assert.equal(v.strengur, null); assert.equal(v.mgG, null);
});
