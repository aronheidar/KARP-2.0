<?php
/**
 * KARP VAKT PRO (LOTA 18, #7) — leitarorða-áskriftir + daglegur tölvupóstur.
 * Límist inn sem WPCode-snippet (PHP, Run Everywhere) á karp.is — sama munstur
 * og karp-user.php. Framendinn á karp.is talar við /wp-json/karp/v1/leitvakt.
 *
 * Veitir:
 *   GET  /karp/v1/leitvakt       → { ord: [...] } (innskráður notandi)
 *   POST /karp/v1/leitvakt       → vistar { ord: [...] } (hám. 12 orð, 40 stafir)
 *   WP-cron 'karp_vaktpro_daily' → sækir lifandi veitur karp.is, matchar orð
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

  $d = $get('https://karp.is/api/domar');
  foreach ((array) ($d['hr'] ?? []) as $v) $feeds[] = ['t' => 'Dómur (Hæstiréttur ' . ($v['nr'] ?? '') . '): ' . ($v['titill'] ?? '') . ' — ' . implode(', ', (array) ($v['efnisord'] ?? [])), 'u' => 'https://www.haestirettur.is/domar/'];
  foreach ((array) ($d['lr'] ?? []) as $v) $feeds[] = ['t' => 'Dómur (Landsréttur ' . ($v['nr'] ?? '') . '): ' . ($v['titill'] ?? ''), 'u' => 'https://www.landsrettur.is/domar-og-urskurdir/'];

  $s = $get('https://karp.is/api/samrad');
  foreach ((array) ($s['data']['consultationPortalGetCases']['cases'] ?? []) as $c) $feeds[] = ['t' => 'Samráð (' . ($c['statusName'] ?? '') . '): ' . ($c['name'] ?? '') . ' — ' . ($c['institutionName'] ?? ''), 'u' => 'https://island.is/samradsgatt/mal/' . ($c['id'] ?? '')];

  // Útboð: fulla dagsafnið (Útboðsvefur+TED+Faxaflóahafnir+Landsvirkjun, LOTA 25)
  // — normaliserað í gogn/utbod.json (build_utbod.js). Nær yfir allar gáttir sem
  // Karp scrape-ar, ekki bara Útboðsvefinn.
  $ut = $get('https://karp.is/gogn/utbod.json');
  foreach ((array) ($ut['tenders'] ?? []) as $p) {
    if (!is_array($p)) continue;
    $srcName = ['rk' => 'Útboðsvefur', 'ted' => 'TED', 'rvk' => 'Reykjavíkurborg', 'fax' => 'Faxaflóahafnir', 'lv' => 'Landsvirkjun'][$p['src'] ?? ''] ?? 'Útboð';
    $feeds[] = ['t' => 'Útboð (' . $srcName . '): ' . ($p['t'] ?? '') . (($p['buyer'] ?? '') ? ' — ' . $p['buyer'] : ''), 'u' => $p['u'] ?? 'https://karp.is/utbod/'];
  }

  $g = $get('https://karp.is/api/greidslur');
  foreach ((array) ($g['rows'] ?? []) as $r) $feeds[] = ['t' => 'Greiðsla: ' . ($r['stofnun'] ?? '') . ' → ' . ($r['birgir'] ?? '') . ' (' . number_format((float) ($r['upph'] ?? 0), 0, ',', '.') . ' kr): ' . ($r['lysing'] ?? ''), 'u' => 'https://karp.is/vaktir/'];

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
    $body .= "\nÖll vöktunin: https://karp.is/vaktir/\nÞú breytir leitarorðunum þínum þar. — Karp";
    wp_mail($usr->user_email, 'Karp-vaktin: ' . count($hits) . ' leitarorð með treff í dag', $body);
  }
});

/**
 * ─────────────────────────────────────────────────────────────
 * ÚTBOÐSVAKT (LOTA 26) — SÉRSNIÐIN vakt fyrir verktaka, aðgreind frá
 * almennu leitarorðavaktinni. Vaktar eftir FLOKKI (jarðvinna, raflagnir…)
 * OG/EÐA leitarorðum, og sendir útboðs-sérsniðinn tölvupóst með AÐEINS NÝJUM
 * útboðum (heldur utan um hvað hefur verið sent → engin endurtekning).
 *
 *   GET  /karp/v1/utbodvakt              → { on, cats:[...], words:[...] }
 *   POST /karp/v1/utbodvakt { on, cats, words } → vistar
 *   cron 'karp_utbodvakt_daily'          → matchar gogn/utbod.json, sendir ný útboð
 * Gögn: user meta karp_utbodvakt = { on, cats, words, seen:{ url:ts } }
 * ─────────────────────────────────────────────────────────────
 */
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/utbodvakt', [
    [
      'methods' => 'GET',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function () {
        $v = get_user_meta(get_current_user_id(), 'karp_utbodvakt', true);
        if (!is_array($v)) $v = [];
        return [
          'on'    => !empty($v['on']),
          'cats'  => isset($v['cats']) && is_array($v['cats']) ? array_values($v['cats']) : [],
          'words' => isset($v['words']) && is_array($v['words']) ? array_values($v['words']) : [],
        ];
      },
    ],
    [
      'methods' => 'POST',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function (WP_REST_Request $req) {
        $uid = get_current_user_id();
        $p = $req->get_json_params();
        // Gildir flokkar (samræmast build_utbod.js CATS)
        $validCats = ['bygg', 'jardv', 'raf', 'vatn', 'vel', 'hugb', 'radgjof', 'raesting', 'flutn', 'matur', 'trygg', 'annad'];
        $cats = [];
        foreach ((array) ($p['cats'] ?? []) as $c) { $c = sanitize_key($c); if (in_array($c, $validCats, true) && !in_array($c, $cats, true)) $cats[] = $c; }
        $words = [];
        foreach ((array) ($p['words'] ?? []) as $w) { $w = sanitize_text_field(mb_substr((string) $w, 0, 40)); if (mb_strlen($w) >= 2 && !in_array($w, $words, true)) $words[] = $w; if (count($words) >= 12) break; }
        $prev = get_user_meta($uid, 'karp_utbodvakt', true);
        $seen = (is_array($prev) && isset($prev['seen']) && is_array($prev['seen'])) ? $prev['seen'] : [];
        $v = ['on' => !empty($p['on']), 'cats' => $cats, 'words' => $words, 'seen' => $seen];
        update_user_meta($uid, 'karp_utbodvakt', $v);
        return ['ok' => true, 'on' => $v['on'], 'cats' => $cats, 'words' => $words];
      },
    ],
  ]);
});

if (!wp_next_scheduled('karp_utbodvakt_daily')) {
  wp_schedule_event(strtotime('tomorrow 07:15'), 'daily', 'karp_utbodvakt_daily');
}
add_action('karp_utbodvakt_daily', function () {
  $r = wp_remote_get('https://karp.is/gogn/utbod.json', ['timeout' => 25]);
  if (is_wp_error($r)) return;
  $data = json_decode(wp_remote_retrieve_body($r), true);
  $tenders = (is_array($data) && isset($data['tenders'])) ? $data['tenders'] : [];
  if (!$tenders) return;
  $catNames = ['bygg' => 'Byggingar', 'jardv' => 'Jarðvinna & vegir', 'raf' => 'Rafmagn', 'vatn' => 'Veitur & lagnir', 'vel' => 'Vélar & búnaður', 'hugb' => 'Upplýsingatækni', 'radgjof' => 'Ráðgjöf & hönnun', 'raesting' => 'Ræsting & úrgangur', 'flutn' => 'Flutningar', 'matur' => 'Matvæli', 'trygg' => 'Tryggingar', 'annad' => 'Annað'];
  $srcNames = ['rk' => 'Útboðsvefur', 'ted' => 'TED (EES)', 'rvk' => 'Reykjavíkurborg', 'fax' => 'Faxaflóahafnir', 'lv' => 'Landsvirkjun'];
  // Lykill hvers útboðs = slóð (stöðug og einkvæm)
  $curKeys = [];
  foreach ($tenders as $t) { if (!empty($t['u'])) $curKeys[$t['u']] = true; }

  $users = get_users(['meta_key' => 'karp_utbodvakt', 'fields' => ['ID', 'user_email', 'display_name']]);
  foreach ($users as $usr) {
    $v = get_user_meta($usr->ID, 'karp_utbodvakt', true);
    if (!is_array($v) || empty($v['on'])) continue;
    $cats = isset($v['cats']) && is_array($v['cats']) ? $v['cats'] : [];
    $words = isset($v['words']) && is_array($v['words']) ? $v['words'] : [];
    if (!$cats && !$words) continue; // ekkert valið → engin vöktun (ekki spam)
    $seen = (isset($v['seen']) && is_array($v['seen'])) ? $v['seen'] : [];

    // Matcha: flokkur í vöktun (ef flokkar valdir) OG/EÐA leitarorð í heiti/kaupanda.
    $matches = [];
    foreach ($tenders as $t) {
      $url = $t['u'] ?? '';
      if ($url === '') continue;
      $catOk = !$cats || in_array($t['cat'] ?? '', $cats, true);
      $wordOk = true;
      if ($words) {
        $hay = mb_strtolower(($t['t'] ?? '') . ' ' . ($t['buyer'] ?? ''));
        $wordOk = false;
        foreach ($words as $w) { if (mb_strpos($hay, mb_strtolower($w)) !== false) { $wordOk = true; break; } }
      }
      // Ef bæði flokkar OG orð eru valin þarf hvort tveggja að passa; annars nægir hitt.
      $ok = ($cats && $words) ? ($catOk && $wordOk) : ($catOk && $wordOk);
      if ($ok) $matches[$url] = $t;
    }

    // Aðeins NÝ (ekki áður send)
    $new = [];
    foreach ($matches as $url => $t) { if (!isset($seen[$url])) $new[] = $t; }

    // Uppfæra seen: halda aðeins lyklum sem enn eru í safninu + bæta nýjum við
    $newSeen = [];
    foreach ($seen as $url => $ts) { if (isset($curKeys[$url])) $newSeen[$url] = $ts; }
    foreach ($matches as $url => $t) { $newSeen[$url] = isset($seen[$url]) ? $seen[$url] : time(); }
    $v['seen'] = $newSeen;
    update_user_meta($usr->ID, 'karp_utbodvakt', $v);

    if (!$new || !$usr->user_email) continue;
    karp_utbodvakt_email($usr, $new, $catNames, $srcNames);
  }
});
function karp_utbodvakt_email($usr, $new, $catNames, $srcNames) {
  // Flokka ný útboð eftir flokki
  $byCat = [];
  foreach ($new as $t) { $byCat[$t['cat'] ?? 'annad'][] = $t; }
  $dIS = function ($d) { if (!$d) return ''; $m = []; if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', $d, $m)) return ((int) $m[3]) . '.' . ((int) $m[2]) . '.' . $m[1]; return ''; };
  $rows = '';
  foreach ($byCat as $cat => $list) {
    $rows .= '<tr><td colspan="2" style="padding:16px 16px 4px;color:#f6b13b;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.04em">' . esc_html($catNames[$cat] ?? 'Útboð') . '</td></tr>';
    foreach (array_slice($list, 0, 20) as $t) {
      $sub = trim(($srcNames[$t['src'] ?? ''] ?? 'Útboð') . (($t['buyer'] ?? '') ? ' · ' . $t['buyer'] : '') . (($t['deadline'] ?? '') ? ' · frestur ' . $dIS($t['deadline']) : ''));
      $rows .= '<tr><td style="padding:9px 16px;border-bottom:1px solid #1d2733">'
        . '<a href="' . esc_url($t['u']) . '" style="color:#eaf1fb;font-size:15px;text-decoration:none;font-weight:600">' . esc_html($t['t']) . '</a>'
        . '<br><span style="color:#8a93a8;font-size:12px">' . esc_html($sub) . '</span></td></tr>';
    }
  }
  $n = count($new);
  $html = '<div style="background:#0a0e14;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
    . '<div style="max-width:560px;margin:0 auto;background:#0e1420;border:1px solid #1d2733;border-radius:16px;overflow:hidden">'
    . '<div style="padding:22px 24px 6px"><div style="color:#f6b13b;font-weight:800;font-size:13px;letter-spacing:1px">📋 KARP ÚTBOÐSVAKT</div>'
    . '<div style="color:#eaf1fb;font-size:21px;font-weight:800;margin-top:6px">' . $n . ' ' . ($n === 1 ? 'nýtt útboð' : 'ný útboð') . ' passa við vaktina þína</div>'
    . '<div style="color:#8a93a8;font-size:14px;margin-top:4px">Ný opinber útboð sem falla að þinni verktöku.</div></div>'
    . '<table style="width:100%;border-collapse:collapse;margin-top:12px">' . $rows . '</table>'
    . '<div style="padding:18px 24px 24px"><a href="https://karp.is/utbod/" style="display:inline-block;background:#f6b13b;color:#131a29;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Skoða öll útboð á Karp →</a>'
    . '<div style="color:#5c6678;font-size:12px;margin-top:18px;line-height:1.5">Þú færð þennan póst því þú ert með útboðsvakt á karp.is. Breyttu flokkum eða leitarorðum — eða slökktu á vaktinni — á <a href="https://karp.is/utbod/" style="color:#8a93a8">karp.is/utbod</a>.</div></div>'
    . '</div></div>';
  $ctype = function () { return 'text/html; charset=UTF-8'; };
  add_filter('wp_mail_content_type', $ctype);
  wp_mail($usr->user_email, 'Karp útboðsvakt: ' . $n . ' ný útboð fyrir þig', $html);
  remove_filter('wp_mail_content_type', $ctype);
}
