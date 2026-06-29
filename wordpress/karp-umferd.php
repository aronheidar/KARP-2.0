<?php
/**
 * KARP Umferð — LIVE bílaumferð á þjóðvegum frá Vegagerðinni (umferðarteljarar, ~15 mín).
 * Uppsetning: NÝTT WPCode PHP-snippet (Run Everywhere / Auto Insert). SLEPPA fyrstu línunni <?php í WPCode.
 * Endapunktur:  /wp-json/karp/v1/umferd
 *   → { total_today, counters, days:[{label,date,total}], busiest:[{nafn,umf}], updated }
 * Vegagerðin WFS (gagnaveita.vegagerdin.is) hefur ENGIN CORS-haus → proxy. Transient-cache 10 mín.
 * Án þessa snippets felst „vegaumferð núna" hlutinn; Keflavík-farþegar (Hagstofa, lifandi) virka áfram.
 * ⚠ Lag-heitið er `test_umferdteljarar` (Vegagerðin merkir það svo) — uppfæra ef það breytist.
 */

add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/umferd', array(
    'methods'             => 'GET',
    'permission_callback' => '__return_true',
    'callback'            => 'karp_umferd_callback',
  ));
});

function karp_umferd_callback($req) {
  $cached = get_transient('karp_umferd');
  if ($cached !== false) return new WP_REST_Response($cached);

  $url = 'https://gagnaveita.vegagerdin.is/geoserver/gis/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=gis:test_umferdteljarar&outputFormat=application/json';
  $r = wp_remote_get($url, array(
    'timeout' => 12, 'redirection' => 3,
    'headers' => array('User-Agent' => 'Mozilla/5.0 (compatible; KARP-Hagvisir/1.0; +https://www.karp.is)', 'Accept' => 'application/json'),
  ));
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) != 200) {
    return new WP_REST_Response(array('error' => 'unavailable'), 200);
  }
  $j = json_decode(wp_remote_retrieve_body($r), true);
  if (empty($j['features'])) return new WP_REST_Response(array('error' => 'parse'), 200);

  $total_today = 0; $counters = 0; $byName = array();
  $dayTot = array_fill(1, 7, 0); $dayDate = array_fill(1, 7, null);
  foreach ($j['features'] as $f) {
    $p = isset($f['properties']) ? $f['properties'] : array();
    $td = isset($p['UMF_I_DAG']) ? (int) $p['UMF_I_DAG'] : 0;
    if ($td > 0) {
      $total_today += $td; $counters++;
      $nm = isset($p['NAFN']) ? trim($p['NAFN']) : '?';
      $byName[$nm] = (isset($byName[$nm]) ? $byName[$nm] : 0) + $td;     // sameina báðar stefnur
    }
    for ($d = 1; $d <= 7; $d++) {
      $k = 'UMF_DAGUR' . $d;
      if (isset($p[$k]) && $p[$k] !== null) {
        $dayTot[$d] += (int) $p[$k];
        if (!$dayDate[$d] && isset($p['DAGS_DAGUR' . $d])) $dayDate[$d] = substr($p['DAGS_DAGUR' . $d], 0, 10);
      }
    }
  }
  arsort($byName);
  $busiest = array();
  foreach ($byName as $nm => $v) { $busiest[] = array('nafn' => $nm, 'umf' => $v); if (count($busiest) >= 8) break; }

  // dagur 1 = í gær … dagur 7 = elstur → snúa við (elstur fyrst) fyrir línurit
  $WD = array('Sun', 'Mán', 'Þri', 'Mið', 'Fim', 'Fös', 'Lau');
  $days = array();
  for ($d = 7; $d >= 1; $d--) {
    $dt = $dayDate[$d];
    $lab = $dt ? ($WD[(int) date('w', strtotime($dt))] . ' ' . (int) substr($dt, 8, 2) . '.') : ('d' . $d);
    $days[] = array('label' => $lab, 'date' => $dt, 'total' => $dayTot[$d]);
  }

  $out = array('total_today' => $total_today, 'counters' => $counters, 'days' => $days, 'busiest' => $busiest, 'updated' => current_time('c'));
  set_transient('karp_umferd', $out, 10 * MINUTE_IN_SECONDS);
  return new WP_REST_Response($out);
}
