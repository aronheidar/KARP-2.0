<?php
/**
 * KARP EES-vaktin — LIVE listi yfir nýjustu EES-tækar ESB-tilskipanir úr EUR-Lex (CELLAR).
 * Uppsetning: NÝTT WPCode PHP-snippet (Run Everywhere / Auto Insert). SLEPPA fyrstu línunni <?php í WPCode.
 * Endapunktur:  /wp-json/karp/v1/ees  → { updated, count, items:[{celex,date,title,type,force}] }
 *
 * GÖGN: EUR-Lex Publications Office SPARQL (https://publications.europa.eu/webapi/rdf/sparql, opið, engin skráning).
 *   Sækir tilskipanir (DIR/DIR_DEL/DIR_IMPL) síðustu ~3 ár þar sem enski titillinn inniheldur "EEA relevance"
 *   (þannig er EES-tækni merkt í EUR-Lex — það er ekki sérstök eign). Þetta er ESB-megin hlið EES-ferlisins:
 *   gerð er samþykkt af ESB → sameiginlega EES-nefndin innleiðir hana síðar í EES-samninginn.
 *   ⚠️ Innleiðslustaða EES-megin (EFTA) fæst EKKI hér — efta.int/EEA-Lex er á bak við bot-vegg og hefur ekkert API.
 *   Þess vegna er hlekkur á EEA-Lex factsheet hverrar gerðar í viðmótinu fyrir opinbera stöðu.
 * Transient-cache 12 klst (tilskipanir koma fáeinum sinnum í viku); stutt cache ef sókn mistekst.
 */

add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/ees', array(
    'methods'             => 'GET',
    'permission_callback' => '__return_true',
    'callback'            => 'karp_ees_callback',
  ));
});

function karp_ees_sparql() {
  $cutoff = date('Y-m-d', strtotime('-3 years'));
  return '
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?celex ?date ?title ?type ?force WHERE {
 ?work cdm:work_has_resource-type ?type .
 FILTER(?type IN (<http://publications.europa.eu/resource/authority/resource-type/DIR>,<http://publications.europa.eu/resource/authority/resource-type/DIR_IMPL>,<http://publications.europa.eu/resource/authority/resource-type/DIR_DEL>))
 ?work cdm:resource_legal_id_celex ?celex .
 ?work cdm:work_date_document ?date .
 FILTER(?date >= "' . $cutoff . '"^^xsd:date)
 ?exp cdm:expression_belongs_to_work ?work .
 ?exp cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
 ?exp cdm:expression_title ?title .
 FILTER(CONTAINS(LCASE(STR(?title)),"eea relevance"))
 FILTER NOT EXISTS { ?work cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/CORRIGENDUM> }
 OPTIONAL { ?work cdm:resource_legal_in-force ?force . }
}
ORDER BY DESC(?date) LIMIT 120';
}

function karp_ees_fetch() {
  $ep  = 'https://publications.europa.eu/webapi/rdf/sparql';
  $url = $ep . '?query=' . rawurlencode(karp_ees_sparql()) . '&format=' . rawurlencode('application/sparql-results+json');
  $r = wp_remote_get($url, array('timeout' => 25, 'redirection' => 3, 'headers' => array(
    'Accept'     => 'application/sparql-results+json',
    'User-Agent' => 'Mozilla/5.0 (compatible; KARP-Hagvisir/1.0; +https://www.karp.is)',
  )));
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) != 200) return null;
  $j = json_decode(wp_remote_retrieve_body($r), true);
  if (!$j || empty($j['results']['bindings'])) return null;

  $seen = array(); $items = array();
  foreach ($j['results']['bindings'] as $b) {
    $celex = isset($b['celex']['value']) ? $b['celex']['value'] : '';
    if ($celex === '' || isset($seen[$celex])) continue;
    $seen[$celex] = 1;
    $typeUri = isset($b['type']['value']) ? $b['type']['value'] : '';
    $type = strtoupper(substr($typeUri, strrpos($typeUri, '/') + 1)); // DIR / DIR_DEL / DIR_IMPL
    $fv = isset($b['force']['value']) ? strtolower(trim($b['force']['value'])) : ''; // Virtuoso skilar boolean sem "1"/"0" (stundum "true"/"false")
    $items[] = array(
      'celex' => $celex,
      'date'  => isset($b['date']['value']) ? substr($b['date']['value'], 0, 10) : '',
      'title' => isset($b['title']['value']) ? $b['title']['value'] : '',
      'type'  => $type,
      'force' => ($fv === 'true' || $fv === '1') ? 1 : (($fv === 'false' || $fv === '0') ? 0 : null),
    );
    if (count($items) >= 80) break;
  }
  return $items;
}

function karp_ees_callback($req) {
  $cached = get_transient('karp_ees_v1');
  if ($cached !== false) return new WP_REST_Response($cached);

  $items = karp_ees_fetch();
  $ok = is_array($items) && count($items) > 0;
  $out = array(
    'updated' => current_time('c'),
    'source'  => 'EUR-Lex / Publications Office (CELLAR SPARQL)',
    'count'   => $ok ? count($items) : 0,
    'items'   => $ok ? $items : array(),
  );
  // Ef sókn mistókst (Virtuoso niðri/hægt) → stutt cache svo við reynum fljótt aftur, annars 12 klst.
  set_transient('karp_ees_v1', $out, $ok ? 12 * HOUR_IN_SECONDS : 10 * MINUTE_IN_SECONDS);
  return new WP_REST_Response($out);
}
