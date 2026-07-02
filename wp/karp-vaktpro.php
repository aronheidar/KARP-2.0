<?php
/**
 * KARP VAKT PRO (LOTA 18, #7) — leitarorða-áskriftir + daglegur tölvupóstur.
 * Límist inn sem WPCode-snippet (PHP, Run Everywhere) á karp.is — sama munstur
 * og karp-user.php. Framendinn á app.karp.is talar við /wp-json/karp/v1/leitvakt.
 *
 * Veitir:
 *   GET  /karp/v1/leitvakt       → { ord: [...] } (innskráður notandi)
 *   POST /karp/v1/leitvakt       → vistar { ord: [...] } (hám. 12 orð, 40 stafir)
 *   WP-cron 'karp_vaktpro_daily' → sækir lifandi veitur app.karp.is, matchar orð
 *                                  hvers áskrifanda og sendir samantekt í tölvupósti.
 * Öryggi: aðeins eigin orð notanda; engin gögn þriðja aðila; wp_mail á skráð netfang.
 */

add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/leitvakt', [
    [
      'methods' => 'GET',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function () {
        $ord = get_user_meta(get_current_user_id(), 'karp_leitvakt', true);
        return ['ord' => is_array($ord) ? array_values($ord) : []];
      },
    ],
    [
      'methods' => 'POST',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function (WP_REST_Request $req) {
        $ord = $req->get_param('ord');
        if (!is_array($ord)) return new WP_Error('bad', 'ord þarf að vera listi', ['status' => 400]);
        $clean = [];
        foreach ($ord as $w) {
          $w = sanitize_text_field(mb_substr((string) $w, 0, 40));
          if (mb_strlen($w) >= 2 && !in_array($w, $clean, true)) $clean[] = $w;
          if (count($clean) >= 12) break;
        }
        update_user_meta(get_current_user_id(), 'karp_leitvakt', $clean);
        return ['ord' => $clean, 'ok' => true];
      },
    ],
  ]);
});

// ── Daglegi pósturinn ────────────────────────────────────────
if (!wp_next_scheduled('karp_vaktpro_daily')) {
  wp_schedule_event(strtotime('tomorrow 07:30'), 'daily', 'karp_vaktpro_daily');
}

add_action('karp_vaktpro_daily', function () {
  // 1) Sækja lifandi veitur (skyndiminnis-proxy Karp — ódýr köll)
  $feeds = [];
  $get = function ($url) { $r = wp_remote_get($url, ['timeout' => 25]); return is_wp_error($r) ? null : json_decode(wp_remote_retrieve_body($r), true); };

  $d = $get('https://app.karp.is/api/domar');
  foreach ((array) ($d['hr'] ?? []) as $v) $feeds[] = ['t' => 'Dómur (Hæstiréttur ' . ($v['nr'] ?? '') . '): ' . ($v['titill'] ?? '') . ' — ' . implode(', ', (array) ($v['efnisord'] ?? [])), 'u' => 'https://www.haestirettur.is/domar/'];
  foreach ((array) ($d['lr'] ?? []) as $v) $feeds[] = ['t' => 'Dómur (Landsréttur ' . ($v['nr'] ?? '') . '): ' . ($v['titill'] ?? ''), 'u' => 'https://www.landsrettur.is/domar-og-urskurdir/'];

  $s = $get('https://app.karp.is/api/samrad');
  foreach ((array) ($s['data']['consultationPortalGetCases']['cases'] ?? []) as $c) $feeds[] = ['t' => 'Samráð (' . ($c['statusName'] ?? '') . '): ' . ($c['name'] ?? '') . ' — ' . ($c['institutionName'] ?? ''), 'u' => 'https://island.is/samradsgatt/mal/' . ($c['id'] ?? '')];

  $u = $get('https://app.karp.is/api/utbod');
  foreach ((array) $u as $p) { if (is_array($p)) $feeds[] = ['t' => 'Útboð: ' . ($p['title']['rendered'] ?? ''), 'u' => $p['link'] ?? 'https://utbodsvefur.is']; }

  $g = $get('https://app.karp.is/api/greidslur');
  foreach ((array) ($g['rows'] ?? []) as $r) $feeds[] = ['t' => 'Greiðsla: ' . ($r['stofnun'] ?? '') . ' → ' . ($r['birgir'] ?? '') . ' (' . number_format((float) ($r['upph'] ?? 0), 0, ',', '.') . ' kr): ' . ($r['lysing'] ?? ''), 'u' => 'https://app.karp.is/vaktir/'];

  if (!$feeds) return;

  // 2) Hver áskrifandi: matcha orð, senda samantekt
  $users = get_users(['meta_key' => 'karp_leitvakt', 'fields' => ['ID', 'user_email', 'display_name']]);
  foreach ($users as $usr) {
    $ord = get_user_meta($usr->ID, 'karp_leitvakt', true);
    if (!is_array($ord) || !$ord) continue;
    $hits = [];
    foreach ($feeds as $f) {
      $low = mb_strtolower($f['t']);
      foreach ($ord as $w) {
        if ($w !== '' && mb_strpos($low, mb_strtolower($w)) !== false) { $hits[$w][] = $f; break; }
      }
    }
    if (!$hits) continue;
    $body = "Góðan dag " . $usr->display_name . ",\n\nLeitarorðavaktin þín á Karp fann eftirfarandi í dag:\n";
    foreach ($hits as $w => $rows) {
      $body .= "\n■ „" . $w . "“ (" . count($rows) . "):\n";
      foreach (array_slice($rows, 0, 6) as $f) $body .= "  • " . $f['t'] . "\n    " . $f['u'] . "\n";
    }
    $body .= "\nÖll vöktunin: https://app.karp.is/vaktir/\nÞú breytir leitarorðunum þínum þar. — Karp";
    wp_mail($usr->user_email, 'Karp-vaktin: ' . count($hits) . ' leitarorð með treff í dag', $body);
  }
});
