<?php
/**
 * KARP Raforka — LIVE framleiðslublanda raforkukerfisins frá Landsnet (Amper).
 * Uppsetning: NÝTT WPCode PHP-snippet (Run Everywhere / Auto Insert). SLEPPA fyrstu línunni <?php í WPCode.
 * Endapunktur:  /wp-json/karp/v1/orka  → { hydro, geothermal, oil, timestamp }  (MW, núlíðandi)
 * Landsnet-API (amper.landsnet.is) hefur ENGIN CORS-haus → þetta proxy gerir það aðgengilegt fyrir
 * mælaborðið (same-origin). Transient-cache 90 sek (gögnin uppfærast ~hverja mínútu).
 * Án þessa snippets felur „Framleiðsla núna"-reiturinn sig sjálfkrafa — ferillinn (bakaður) virkar áfram.
 */

add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/orka', array(
    'methods'             => 'GET',
    'permission_callback' => '__return_true',
    'callback'            => 'karp_orka_callback',
  ));
});

function karp_orka_callback($req) {
  $cached = get_transient('karp_orka_live');
  if ($cached !== false) return new WP_REST_Response($cached);

  $r = wp_remote_get('https://amper.landsnet.is/generation/api/Values', array(
    'timeout' => 6, 'redirection' => 3,
    'headers' => array('User-Agent' => 'Mozilla/5.0 (compatible; KARP-Hagvisir/1.0; +https://www.karp.is)', 'Accept' => 'application/json'),
  ));
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) != 200) {
    return new WP_REST_Response(array('error' => 'unavailable'), 200);
  }
  $j = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($j)) {
    return new WP_REST_Response(array('error' => 'parse'), 200);
  }
  $out = array(
    'hydro'      => isset($j['hydro']) ? round((float) $j['hydro'], 1) : null,
    'geothermal' => isset($j['geothermal']) ? round((float) $j['geothermal'], 1) : null,
    'oil'        => isset($j['oil']) ? round((float) $j['oil'], 1) : 0,
    'timestamp'  => isset($j['timestamp']) ? $j['timestamp'] : null,
  );
  set_transient('karp_orka_live', $out, 90);
  return new WP_REST_Response($out);
}
