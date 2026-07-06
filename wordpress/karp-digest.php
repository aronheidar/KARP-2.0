<?php
/**
 * KARP VIKUYFIRLIT v2 (LOTA 70) — persónulegt vikulegt yfirlit í tölvupósti.
 * --------------------------------------------------------------------------
 * Kemur í stað eldri karp-digest (almenna textapóstsins). Límist sem WPCode-
 * snippet (PHP, Run Everywhere) á wp.karp.is — YFIRSKRIFAR gamla digest-snippetið.
 *
 * Veitir:
 *   GET  /wp-json/karp/v1/digest       → { on }        (innskráður notandi)
 *   POST /wp-json/karp/v1/digest {on}  → vistar user meta digest = '1'/'0'
 *                                        (sama meta og UM-prófílhakið „Fá vikulegt yfirlit")
 *   WP-cron 'karp_weekly_digest'       → mánudagsmorgna: safnar sameiginlegum gögnum,
 *                                        raðar áskrifendum í 40 manna lotur og sendir.
 *
 * Efni póstsins — aðeins hlutar sem eiga efni birtast:
 *   📊 Vikan í tölum   — verðbólga / gengi / stýrivextir (spyrdu_context.json, uppfært daglega)
 *   🔎 Leitarorðin þín — treff í fréttasafni Karp (wp_karp_news) síðustu 7 daga
 *   ⭐ Fylgst með       — co:/mp: follows → umfjöllun vikunnar um hvern aðila
 *   🏠 Fasteignavaktin — þinglýstar sölur vikunnar á götuvöktum notandans
 *   📋 Útboðsvaktin    — útboð sem vaktin fann í vikunni (seen-tímastimplar)
 *   🏢 Firmavaktin     — staða vöktuðu félaga (vanskil/afskráning úr karp_firmavakt_snap)
 *   🅡 Ný vörumerki    — nýskráð vörumerki hjá vöktuðum félögum (karp.is/gogn/vorumerki_nyskrad.json)
 *
 * ⚠ AFHENDING: wp_mail þarf virka SMTP-uppsetningu (sjá noreply@karp.is verkefnið).
 */

/* ── 1) REST: kveikja/slökkva ─────────────────────────────────── */
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/digest', [
    [
      'methods' => 'GET',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function () {
        return ['on' => get_user_meta(get_current_user_id(), 'digest', true) === '1'];
      },
    ],
    [
      'methods' => 'POST',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function (WP_REST_Request $req) {
        $on = !empty($req->get_json_params()['on']);
        update_user_meta(get_current_user_id(), 'digest', $on ? '1' : '0');
        return ['ok' => true, 'on' => $on];
      },
    ],
  ]);
});

/* ── 2) Cron: mánudagar kl. 08:10 (v2 endurskráir gamla atburðinn einu sinni) ── */
add_filter('cron_schedules', function ($s) {
  if (!isset($s['weekly'])) $s['weekly'] = ['interval' => 7 * DAY_IN_SECONDS, 'display' => 'Vikulega'];
  return $s;
});
add_action('init', function () {
  if (get_option('karp_digest_v2_sched') !== '1') {
    wp_clear_scheduled_hook('karp_weekly_digest');
    update_option('karp_digest_v2_sched', '1', false);
  }
  if (!wp_next_scheduled('karp_weekly_digest')) {
    $t = strtotime('next monday 08:10');
    wp_schedule_event($t ?: time() + DAY_IN_SECONDS, 'weekly', 'karp_weekly_digest');
  }
});

/* ── 3) Sameiginleg vikugögn (eitt sótt fyrir alla — transient 2 klst) ── */
function karp_digest_shared() {
  $sh = get_transient('karp_digest_shared');
  if (is_array($sh)) return $sh;
  $get = function ($url) { $r = wp_remote_get($url, ['timeout' => 25]); return is_wp_error($r) ? null : json_decode(wp_remote_retrieve_body($r), true); };
  $sh = ['tolur' => [], 'kaup7' => [], 'mp' => [], 'utbod' => []];
  // 📊 hagtölulínur úr samhengispakka Spyrðu Karp (VERÐBÓLGA/GENGI/STÝRIVEXTIR)
  $ctx = $get('https://karp.is/gogn/spyrdu_context.json');
  foreach (explode("\n", (string) ($ctx['text'] ?? '')) as $line) {
    foreach (['VERÐBÓLGA', 'GENGI', 'STÝRIVEXTIR'] as $k) {
      // ATH: GENGI-línan er „GENGI (2026-07-03): …" — því forskeyti án tvípunkts
      if (mb_strpos($line, $k) === 0) $sh['tolur'][] = trim($line);
    }
  }
  // 🏠 þinglýstar sölur síðustu 7 daga (lítill hluti 180d skráarinnar)
  $wk = gmdate('Y-m-d', time() - 7 * DAY_IN_SECONDS);
  $ks = $get('https://karp.is/gogn/kaupskra_nyjast.json');
  foreach ((array) ($ks['rows'] ?? []) as $x) {
    if (is_array($x) && (string) ($x['d'] ?? '') >= $wk) $sh['kaup7'][] = $x;
  }
  // ⭐ mp:id → nafn (fyrir follows)
  $al = $get('https://karp.is/gogn/althingi.json');
  foreach ((array) $al as $m) { if (is_array($m) && isset($m['id'])) $sh['mp'][(string) $m['id']] = (string) ($m['nafn'] ?? ''); }
  // 📋 útboð: url → heiti/kaupandi (fyrir seen-vísun notenda)
  $ut = $get('https://karp.is/gogn/utbod.json');
  foreach ((array) ($ut['tenders'] ?? []) as $t) { if (is_array($t) && !empty($t['u'])) $sh['utbod'][(string) $t['u']] = ['t' => (string) ($t['t'] ?? ''), 'b' => (string) ($t['buyer'] ?? '')]; }
  set_transient('karp_digest_shared', $sh, 2 * HOUR_IN_SECONDS);
  return $sh;
}

/* ── 4) Vikuleg keyrsla: lotuskipting (40/lotu, 2 mín millibil) ── */
add_action('karp_weekly_digest', function () {
  karp_digest_shared(); // hita skyndiminnið einu sinni
  $users = get_users(['meta_key' => 'digest', 'meta_value' => '1', 'fields' => 'ID']);
  if (!$users) return;
  $chunks = array_chunk(array_map('intval', $users), 40);
  foreach ($chunks as $i => $chunk) {
    if ($i === 0) { do_action('karp_digest_batch', $chunk); continue; }
    wp_schedule_single_event(time() + $i * 120, 'karp_digest_batch', [$chunk]);
  }
});

add_action('karp_digest_batch', function ($ids) {
  if (!is_array($ids)) return;
  $sh = karp_digest_shared();
  foreach ($ids as $uid) {
    $u = get_userdata((int) $uid);
    if (!$u || !$u->user_email || !is_email($u->user_email)) continue;
    if (get_user_meta($u->ID, 'digest', true) !== '1') continue;
    $html = karp_digest_build($u, $sh);
    if ($html === '') continue;
    $ctype = function () { return 'text/html; charset=UTF-8'; };
    add_filter('wp_mail_content_type', $ctype);
    wp_mail($u->user_email, '🐟 Vikuyfirlitið þitt á Karp', $html);
    remove_filter('wp_mail_content_type', $ctype);
  }
}, 10, 1);

/* ── 5) Byggja póst hvers notanda ─────────────────────────────── */
function karp_digest_news_hits($word, $wkTs, $limit = 4) {
  global $wpdb;
  $t = $wpdb->prefix . 'karp_news';
  $like = '%' . $wpdb->esc_like($word) . '%';
  $n = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $t WHERE ts >= %d AND title LIKE %s", $wkTs, $like));
  if (!$n) return ['n' => 0, 'rows' => []];
  $rows = $wpdb->get_results($wpdb->prepare("SELECT title, url, source FROM $t WHERE ts >= %d AND title LIKE %s ORDER BY ts DESC LIMIT %d", $wkTs, $like, $limit), ARRAY_A);
  return ['n' => $n, 'rows' => is_array($rows) ? $rows : []];
}

/* Nýskráð vörumerki sl. 35 daga, lyklað á ownerSsn (kt) — byggingartíma-feed build_vorumerki_nyskrad.js.
   Sótt einu sinni per cron-keyrslu (static cache), notað til að láta fylgjendur vita um ný merki félaga. */
function karp_digest_vorumerki() {
  static $c = null;
  if ($c !== null) return $c;
  $c = [];
  $r = wp_remote_get('https://karp.is/gogn/vorumerki_nyskrad.json', ['timeout' => 8]);
  if (!is_wp_error($r) && (int) wp_remote_retrieve_response_code($r) === 200) {
    $j = json_decode(wp_remote_retrieve_body($r), true);
    if (is_array($j) && !empty($j['byKt']) && is_array($j['byKt'])) $c = $j['byKt'];
  }
  return $c;
}

function karp_digest_build($u, $sh) {
  $wkTs = time() - 7 * DAY_IN_SECONDS;
  $dIS = function ($d) { $m = []; if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', (string) $d, $m)) return ((int) $m[3]) . '.' . ((int) $m[2]) . '.' . $m[1]; return ''; };
  $mkr = function ($v) { return number_format(((float) $v) / 1000, 1, ',', '.') . ' m.kr'; };
  $H = function ($ico, $txt) { return '<tr><td style="padding:18px 20px 4px;color:#f6b13b;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.05em">' . $ico . ' ' . esc_html($txt) . '</td></tr>'; };
  $li = function ($main, $sub, $url = '') {
    $t = $url ? '<a href="' . esc_url($url) . '" style="color:#eaf1fb;font-size:14.5px;text-decoration:none;font-weight:600">' . esc_html($main) . '</a>' : '<span style="color:#eaf1fb;font-size:14.5px;font-weight:600">' . esc_html($main) . '</span>';
    return '<tr><td style="padding:8px 20px;border-bottom:1px solid #1d2733">' . $t . ($sub !== '' ? '<br><span style="color:#8a93a8;font-size:12px">' . esc_html($sub) . '</span>' : '') . '</td></tr>';
  };
  $rows = '';
  $personal = false;

  /* 📊 Vikan í tölum (allir) */
  if (!empty($sh['tolur'])) {
    $rows .= $H('📊', 'Vikan í tölum');
    $chips = '';
    foreach ($sh['tolur'] as $line) {
      $p = explode(':', $line, 2);
      $chips .= '<span style="display:inline-block;background:#141c2b;border:1px solid #263349;border-radius:9px;padding:6px 10px;margin:3px 4px 3px 0;color:#cdd6e6;font-size:12px"><b style="color:#f6b13b">' . esc_html(trim($p[0])) . '</b> ' . esc_html(trim($p[1] ?? '')) . '</span>';
    }
    $rows .= '<tr><td style="padding:6px 20px 10px">' . $chips . '</td></tr>';
  }

  /* 🔎 Leitarorðin þín — treff í fréttasafninu sl. 7 daga */
  $ord = get_user_meta($u->ID, 'karp_leitvakt', true);
  if (is_array($ord) && $ord) {
    $sec = '';
    foreach (array_slice($ord, 0, 12) as $w) {
      $hit = karp_digest_news_hits($w, $wkTs, 3);
      if (!$hit['n']) continue;
      $sec .= $li('„' . $w . '“ — ' . $hit['n'] . ' ' . ($hit['n'] === 1 ? 'fyrirsögn' : 'fyrirsagnir') . ' í vikunni', '', 'https://karp.is/frettir/');
      foreach ($hit['rows'] as $r) $sec .= $li('· ' . mb_substr((string) $r['title'], 0, 90), (string) $r['source'], (string) $r['url']);
    }
    if ($sec !== '') { $rows .= $H('🔎', 'Leitarorðin þín í fjölmiðlum vikunnar') . $sec; $personal = true; }
  }

  /* ⭐ Fylgst með — co:/mp: follows → umfjöllun vikunnar */
  $fl = get_user_meta($u->ID, 'karp_follows', true);
  if (is_array($fl) && $fl) {
    $sec = '';
    $done = 0;
    foreach ($fl as $key) {
      if ($done >= 12) break;
      $nafn = '';
      if (strpos($key, 'co:') === 0) $nafn = trim(substr($key, 3));
      elseif (strpos($key, 'mp:') === 0) $nafn = (string) ($sh['mp'][substr($key, 3)] ?? '');
      if ($nafn === '') continue;
      $done++;
      $hit = karp_digest_news_hits($nafn, $wkTs, 1);
      if (!$hit['n']) continue;
      $top = $hit['rows'][0] ?? null;
      $sec .= $li($nafn . ' — ' . $hit['n'] . ' ' . ($hit['n'] === 1 ? 'fyrirsögn' : 'fyrirsagnir'), $top ? mb_substr((string) $top['title'], 0, 88) . ' (' . (string) $top['source'] . ')' : '', 'https://karp.is/frettir/');
    }
    if ($sec !== '') { $rows .= $H('⭐', 'Þau sem þú fylgist með — vikan í fjölmiðlum') . $sec; $personal = true; }
  }

  /* 🏠 Fasteignavaktin — sölur vikunnar á vöktum notandans */
  $fv = get_user_meta($u->ID, 'karp_fastvakt', true);
  if (is_array($fv) && !empty($fv['on']) && !empty($fv['vaktir']) && !empty($sh['kaup7'])) {
    $match = function ($x, $sv, $q) {
      if ($sv !== '' && (string) ($x['sv'] ?? '') !== $sv) return false;
      if ($q === '') return true;
      if (preg_match('/^\d{3}$/', $q)) return (string) ($x['pn'] ?? '') === $q;
      return mb_strpos(mb_strtolower((string) ($x['a'] ?? '')), mb_strtolower($q)) === 0;
    };
    $sec = '';
    $n = 0;
    foreach ($sh['kaup7'] as $x) {
      foreach ((array) $fv['vaktir'] as $w) {
        if ($match($x, (string) ($w['sv'] ?? ''), (string) ($w['q'] ?? ''))) {
          $n++;
          if ($n <= 8) {
            $fm = (float) ($x['fm'] ?? 0);
            $sec .= $li((string) ($x['a'] ?? '') . ' — ' . $mkr($x['v'] ?? 0), trim($dIS($x['d'] ?? '') . ' · ' . str_replace('.', ',', (string) $fm) . ' m²' . ($fm > 0 ? ' · ' . round(((float) ($x['v'] ?? 0)) / $fm) . ' þ/m²' : '') . ' · ' . (string) ($x['pn'] ?? '') . ' ' . (string) ($x['sv'] ?? '')), 'https://karp.is/fasteignavakt/');
          }
          break;
        }
      }
    }
    if ($n) {
      $rows .= $H('🏠', 'Fasteignavaktin — ' . $n . ' þinglýst' . ($n === 1 ? ' sala' : 'ar sölur') . ' í vikunni') . $sec;
      if ($n > 8) $rows .= $li('… og ' . ($n - 8) . ' til viðbótar', '', 'https://karp.is/fasteignavakt/');
      $personal = true;
    }
  }

  /* 📋 Útboðsvaktin — ný útboð vikunnar (seen-tímastimplar) */
  $uv = get_user_meta($u->ID, 'karp_utbodvakt', true);
  if (is_array($uv) && !empty($uv['on']) && !empty($uv['seen']) && !empty($sh['utbod'])) {
    $sec = '';
    $n = 0;
    foreach ((array) $uv['seen'] as $url => $ts) {
      if ((int) $ts < $wkTs || !isset($sh['utbod'][$url])) continue;
      $n++;
      if ($n <= 6) { $t = $sh['utbod'][$url]; $sec .= $li($t['t'], $t['b'], (string) $url); }
    }
    if ($n) {
      $rows .= $H('📋', 'Útboðsvaktin — ' . $n . ' ' . ($n === 1 ? 'nýtt útboð' : 'ný útboð') . ' í vikunni') . $sec;
      $personal = true;
    }
  }

  /* 🏢 Firmavaktin — staða vöktuðu félaga (úr karp_firmavakt_snap; uppfært daglega, engin auka RSK-köll) */
  $fmv = get_user_meta($u->ID, 'karp_firmavakt', true);
  if (is_array($fmv) && !empty($fmv['on']) && !empty($fmv['felog'])) {
    $snap = get_option('karp_firmavakt_snap');
    $sec = '';
    $nfl = 0;
    foreach ((array) $fmv['felog'] as $co) {
      if (!is_array($co) || empty($co['kt'])) continue;
      $kt = (string) $co['kt'];
      $f = (is_array($snap) && isset($snap[$kt]['f']) && is_array($snap[$kt]['f'])) ? $snap[$kt]['f'] : null;
      $nafn = $f && !empty($f['Heiti']) ? $f['Heiti'] : (!empty($co['nafn']) ? $co['nafn'] : $kt);
      $van = $f ? (string) ($f['Vanskil ársreikningaskila'] ?? '') : '';
      $flag = 'í skilum';
      if ($f && ($f['Skráningarstaða'] ?? '') === 'AFSKRÁÐ') $flag = '⚠ félag afskráð';
      elseif ($van !== '' && $van !== 'engin') $flag = '⚠ vanskil ársreikningaskila: ' . $van;
      elseif (!$f) $flag = 'kt. ' . $kt;
      $nfl++;
      if ($nfl <= 12) $sec .= $li($nafn, $flag, 'https://karp.is/fyrirtaeki/?q=' . rawurlencode($kt));
    }
    if ($sec) { $rows .= $H('🏢', 'Félög á vaktinni þinni — staða'); $rows .= $sec; $personal = true; }
  }

  /* 🅡 Ný vörumerki hjá félögum á vaktinni (Hugverkastofan, lyklað á ownerSsn — nýskráð sl. 35 daga) */
  if (is_array($fmv) && !empty($fmv['on']) && !empty($fmv['felog'])) {
    $vm = karp_digest_vorumerki();
    if (!empty($vm)) {
      $sec = '';
      $nvm = 0;
      foreach ((array) $fmv['felog'] as $co) {
        if (!is_array($co) || empty($co['kt'])) continue;
        $kt = preg_replace('/\D/', '', (string) $co['kt']);
        if (empty($vm[$kt]) || !is_array($vm[$kt])) continue;
        $nafn = !empty($co['nafn']) ? $co['nafn'] : $kt;
        foreach (array_slice($vm[$kt], 0, 4) as $m) {
          $nvm++;
          if ($nvm <= 10) {
            $ti = !empty($m['titill']) ? $m['titill'] : ($m['id'] ?? '');
            $sub = esc_html($nafn) . ' · ' . esc_html($m['tegund'] ?? 'vörumerki') . (!empty($m['skrad']) ? ' · skráð ' . esc_html($m['skrad']) : '');
            $sec .= $li('🅡 ' . $ti, $sub, 'https://www.hugverk.is/leit/trademark/' . rawurlencode($m['id'] ?? ''));
          }
        }
      }
      if ($sec) { $rows .= $H('🅡', 'Ný vörumerki hjá félögum á vaktinni'); $rows .= $sec; $personal = true; }
    }
  }

  /* Vantar allt persónulegt? Hvetjum til að setja upp vaktir. */
  if (!$personal) {
    $rows .= '<tr><td style="padding:14px 20px;color:#8a93a8;font-size:13px;line-height:1.6">Engin persónuleg treff í vikunni — settu upp <a href="https://karp.is/vaktir/" style="color:#f6b13b">leitarorða-, útboðs- eða fasteignavakt</a> eða fylgstu með fyrirtækjum og þingmönnum til að fá vikuna þína hér.</td></tr>';
  }

  $name = $u->display_name ? esc_html($u->display_name) : '';
  return '<div style="background:#0a0e14;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
    . '<div style="max-width:600px;margin:0 auto;background:#0e1420;border:1px solid #1d2733;border-radius:16px;overflow:hidden">'
    . '<div style="padding:22px 24px 8px"><div style="color:#f6b13b;font-weight:800;font-size:13px;letter-spacing:1px">🐟 KARP VIKUYFIRLIT</div>'
    . '<div style="color:#eaf1fb;font-size:21px;font-weight:800;margin-top:6px">' . ($name ? 'Vikan þín, ' . $name : 'Vikan þín á Karp') . '</div>'
    . '<div style="color:#8a93a8;font-size:13.5px;margin-top:4px">Það sem gerðist í vikunni á vöktunum þínum og hjá þeim sem þú fylgist með.</div></div>'
    . '<table style="width:100%;border-collapse:collapse;margin-top:6px">' . $rows . '</table>'
    . '<div style="padding:18px 24px 24px"><a href="https://karp.is/mitt-svaedi/" style="display:inline-block;background:#f6b13b;color:#131a29;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Opna Mitt svæði →</a>'
    . '<div style="color:#5c6678;font-size:12px;margin-top:18px;line-height:1.5">Þú færð þennan póst því vikuyfirlitið er virkt á aðganginum þínum. Slökktu (eða kveiktu aftur) á <a href="https://karp.is/vaktir/" style="color:#8a93a8">karp.is/vaktir</a> — „📬 Vikuyfirlitið".</div></div>'
    . '</div></div>';
}
