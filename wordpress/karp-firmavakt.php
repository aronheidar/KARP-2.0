<?php
/**
 * KARP FIRMAVAKT (LOTA 73) — breytinga- og vanskilavakt á fyrirtæki.
 * --------------------------------------------------------------------------
 * „Vakta félagið"-takkinn á karp.is/fyrirtaeki setur félag á vaktina; daglegur
 * cron ber saman opinberu skráninguna (um /api/fyrirtaeki á karp.is, 24 klst
 * skyndiminni) og vanskilastöðu ársreikningaskila (/api/vanskil) við síðustu
 * mynd og sendir tölvupóst þegar eitthvað breytist:
 *   heiti · rekstrarform · lögheimili · forráðamaður · VSK-staða · afskráning
 *   · ársreikningaskil · vanskilalisti ársreikningaskrár (á/af).
 *
 * UPPSETNING (WPCode á wp.karp.is): Add Snippet → PHP → límdu (slepptu fyrstu
 * <?php-línunni) → Active · Auto Insert · Run Everywhere · Save.
 *
 *   GET  /wp-json/karp/v1/firmavakt              → { on, felog:[{kt,nafn}] }
 *   POST /wp-json/karp/v1/firmavakt {on, felog}  → vistar (hám. 12 félög)
 *   cron 'karp_firmavakt_daily' kl. ~07:00       → diff + póstur
 *
 * Gögn: user meta karp_firmavakt = { on, felog:[{kt,nafn}] }
 *       option karp_firmavakt_snap = { kt: { f:{...svið}, t:ts } } (sameiginlegt)
 * Hófsemi við RSK: einkvæmar kt teknar EINU SINNI á keyrslu (þvert á notendur),
 * 1,5 sek bið milli félaga, hám. 100 félög/keyrslu.
 */

/* ── 1) REST ─────────────────────────────────────────────────── */
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/firmavakt', [
    [
      'methods' => 'GET',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function () {
        $v = get_user_meta(get_current_user_id(), 'karp_firmavakt', true);
        if (!is_array($v)) $v = [];
        $felog = [];
        foreach ((array) ($v['felog'] ?? []) as $f) {
          if (is_array($f) && preg_match('/^\d{10}$/', (string) ($f['kt'] ?? ''))) {
            $felog[] = ['kt' => (string) $f['kt'], 'nafn' => (string) ($f['nafn'] ?? '')];
          }
        }
        return ['on' => !empty($v['on']), 'felog' => $felog];
      },
    ],
    [
      'methods' => 'POST',
      'permission_callback' => function () { return is_user_logged_in(); },
      'callback' => function (WP_REST_Request $req) {
        $p = $req->get_json_params();
        $felog = [];
        foreach ((array) ($p['felog'] ?? []) as $f) {
          if (!is_array($f)) continue;
          $kt = preg_replace('/\D/', '', (string) ($f['kt'] ?? ''));
          if (strlen($kt) !== 10) continue;
          foreach ($felog as $ex) { if ($ex['kt'] === $kt) continue 2; }
          $felog[] = ['kt' => $kt, 'nafn' => sanitize_text_field(mb_substr((string) ($f['nafn'] ?? ''), 0, 80))];
          if (count($felog) >= 12) break;
        }
        update_user_meta(get_current_user_id(), 'karp_firmavakt', ['on' => !empty($p['on']), 'felog' => $felog]);
        return ['ok' => true, 'on' => !empty($p['on']), 'felog' => $felog];
      },
    ],
  ]);
});

/* ── 2) Cron ─────────────────────────────────────────────────── */
if (!wp_next_scheduled('karp_firmavakt_daily')) {
  wp_schedule_event(strtotime('tomorrow 07:00'), 'daily', 'karp_firmavakt_daily');
}

/* Mynd félags: sviðin sem vaktin fylgist með (normaliserað úr /api/fyrirtaeki + /api/vanskil). */
function karp_firmavakt_mynd($kt) {
  $get = function ($url) { $r = wp_remote_get($url, ['timeout' => 30]); return is_wp_error($r) ? null : json_decode(wp_remote_retrieve_body($r), true); };
  $d = $get('https://karp.is/api/fyrirtaeki?q=' . $kt);
  $f = (is_array($d) && isset($d['felag']) && is_array($d['felag'])) ? $d['felag'] : null;
  if (!$f) return null;                                   // náðist ekki → sleppum diff í dag (ekki falskur munur)
  $vskA = 0;
  foreach ((array) ($f['vsk'] ?? []) as $v) { if (is_array($v) && empty($v['afskrad'])) $vskA++; }
  $ars = 0;
  foreach ((array) ($f['arsreikningar'] ?? []) as $a) { if (is_array($a) && !empty($a['skil'])) $ars = max($ars, (int) ($a['ar'] ?? 0)); }
  $van = $get('https://karp.is/api/vanskil?kt=' . $kt);
  $vanTxt = '';
  if (is_array($van) && isset($van['ar']) && is_array($van['ar'])) {
    $bits = [];
    foreach ($van['ar'] as $x) { if (is_array($x)) $bits[] = (string) ($x['ar'] ?? '') . ' (' . (string) ($x['vanskil'] ?? '') . ')'; }
    $vanTxt = $bits ? implode(' · ', $bits) : 'engin';
  }
  // Lögbirtingablaðið (LOTA 111): þrot/innköllun/skiptalok — NÝ tilkynning = viðvörun (kjarninn í vöktun).
  $lb = $get('https://karp.is/api/logbirting?kt=' . $kt);
  $lbTxt = (is_array($lb) && !empty($lb['holdur']) && !empty($lb['tilkynningar']))
    ? ((string) ($lb['count'] ?? count($lb['tilkynningar'])) . ' tilk. · nýjast: ' . (string) ($lb['tilkynningar'][0]['tegundHeiti'] ?? '') . (isset($lb['tilkynningar'][0]['dagsetning']) ? ' (' . (string) $lb['tilkynningar'][0]['dagsetning'] . ')' : ''))
    : (is_array($lb) ? 'engar' : '');
  // Opinbert eftirlit RVK (LOTA 111): ný úttekt/einkunn = breyting (aðeins RVK-fyrirtæki hafa gögn).
  $ef = $get('https://karp.is/api/eftirlit?kt=' . $kt);
  $efTxt = (is_array($ef) && !empty($ef['holdur']) && !empty($ef['stadir']))
    ? ((string) ($ef['stadir'][0]['ratingLabel'] ?? '') . (isset($ef['stadir'][0]['lastInspection']) ? ' · ' . (string) $ef['stadir'][0]['lastInspection'] : ''))
    : '';
  return [
    'Heiti'                      => (string) ($f['nafn'] ?? ''),
    'Rekstrarform'               => (string) ($f['form'] ?? ''),
    'Lögheimili'                 => (string) ($f['logheimili'] ?? ''),
    'Forráðamaður'               => implode(' · ', (array) ($f['radamenn'] ?? [])),
    'Skráningarstaða'            => !empty($f['afskrad']) ? 'AFSKRÁÐ' : 'skráð',
    'Virk VSK-númer'             => (string) $vskA,
    'Nýjustu ársreikningaskil'   => $ars ? (string) $ars : '',
    'Vanskil ársreikningaskila'  => $vanTxt,
    'Lögbirtingablaðið'          => $lbTxt,
    'Opinbert eftirlit'          => $efTxt,
  ];
}

add_action('karp_firmavakt_daily', function () {
  // 1) einkvæm félög allra notenda (kt → nafn) + hverjir vakta hvað
  $users = get_users(['meta_key' => 'karp_firmavakt', 'fields' => ['ID', 'user_email', 'display_name']]);
  if (!$users) return;
  $ktUsers = [];   // kt → [user objects]
  $ktNafn  = [];
  foreach ($users as $usr) {
    $v = get_user_meta($usr->ID, 'karp_firmavakt', true);
    if (!is_array($v) || empty($v['on'])) continue;
    foreach ((array) ($v['felog'] ?? []) as $f) {
      if (!is_array($f) || !preg_match('/^\d{10}$/', (string) ($f['kt'] ?? ''))) continue;
      $kt = (string) $f['kt'];
      $ktUsers[$kt][] = $usr;
      if (!isset($ktNafn[$kt])) $ktNafn[$kt] = (string) ($f['nafn'] ?? $kt);
    }
  }
  if (!$ktUsers) return;

  // 2) sækja myndir (hófsemi: 1,5 s bið, hám. 100 félög) og diffa við síðustu mynd
  $snap = get_option('karp_firmavakt_snap');
  if (!is_array($snap)) $snap = [];
  $changed = [];   // kt → [ [svið, gamalt, nýtt], … ]
  $n = 0;
  foreach (array_keys($ktUsers) as $kt) {
    if (++$n > 100) break;
    $mynd = karp_firmavakt_mynd($kt);
    usleep(1500000);
    if ($mynd === null) continue;
    if (isset($snap[$kt]['f']) && is_array($snap[$kt]['f'])) {
      $old = $snap[$kt]['f'];
      $diffs = [];
      foreach ($mynd as $svid => $ny) {
        if (!array_key_exists($svid, $old)) continue;   // nýtt vöktunar-svið (t.d. Lögbirting) → engin viðvörun við fyrstu skráningu í mynd
        $gam = isset($old[$svid]) ? (string) $old[$svid] : '';
        if ((string) $ny !== $gam) $diffs[] = [$svid, $gam, (string) $ny];
      }
      if ($diffs) $changed[$kt] = $diffs;
    }
    $snap[$kt] = ['f' => $mynd, 't' => time()];
  }
  // hreinsa félög sem enginn vaktar lengur
  foreach (array_keys($snap) as $kt) { if (!isset($ktUsers[$kt])) unset($snap[$kt]); }
  update_option('karp_firmavakt_snap', $snap, false);
  if (!$changed) return;

  // 3) póstur á hvern notanda með HANS breyttu félög
  foreach ($users as $usr) {
    if (empty($usr->user_email) || !is_email($usr->user_email)) continue;
    $v = get_user_meta($usr->ID, 'karp_firmavakt', true);
    if (!is_array($v) || empty($v['on'])) continue;
    $rows = '';
    $nCo = 0;
    foreach ((array) ($v['felog'] ?? []) as $f) {
      $kt = (string) ($f['kt'] ?? '');
      if (!isset($changed[$kt])) continue;
      $nCo++;
      $nafn = isset($snap[$kt]['f']['Heiti']) && $snap[$kt]['f']['Heiti'] !== '' ? $snap[$kt]['f']['Heiti'] : ($f['nafn'] ?? $kt);
      $rows .= '<tr><td style="padding:14px 20px 4px;color:#f6b13b;font-weight:800;font-size:14px">🏢 ' . esc_html($nafn) . ' <span style="color:#8a93a8;font-weight:400;font-size:12px">kt. ' . esc_html($kt) . '</span></td></tr>';
      foreach ($changed[$kt] as $ch) {
        $rows .= '<tr><td style="padding:5px 20px;border-bottom:1px solid #1d2733;font-size:13px;color:#cdd6e6"><b style="color:#eaf1fb">' . esc_html($ch[0]) . ':</b> <span style="color:#8a93a8">' . esc_html($ch[1] !== '' ? $ch[1] : '—') . '</span> → <b style="color:#f6b13b">' . esc_html($ch[2] !== '' ? $ch[2] : '—') . '</b></td></tr>';
      }
    }
    if (!$rows) continue;
    $html = '<div style="background:#0a0e14;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
      . '<div style="max-width:600px;margin:0 auto;background:#0e1420;border:1px solid #1d2733;border-radius:16px;overflow:hidden">'
      . '<div style="padding:22px 24px 6px"><div style="color:#f6b13b;font-weight:800;font-size:13px;letter-spacing:1px">🏢 KARP FIRMAVAKT</div>'
      . '<div style="color:#eaf1fb;font-size:20px;font-weight:800;margin-top:6px">' . $nCo . ' ' . ($nCo === 1 ? 'félag á vaktinni þinni breyttist' : 'félög á vaktinni þinni breyttust') . '</div>'
      . '<div style="color:#8a93a8;font-size:13px;margin-top:4px">Breytingar í fyrirtækjaskrá, ársreikningaskrá, Lögbirtingablaðinu og opinberu eftirliti.</div></div>'
      . '<table style="width:100%;border-collapse:collapse;margin-top:8px">' . $rows . '</table>'
      . '<div style="padding:18px 24px 24px"><a href="https://karp.is/fyrirtaeki/" style="display:inline-block;background:#f6b13b;color:#131a29;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Opna Fyrirtækjaskrána →</a>'
      . '<div style="color:#5c6678;font-size:12px;margin-top:16px;line-height:1.5">Þú færð þennan póst því þú vaktar félögin á karp.is/fyrirtaeki — þar geturðu líka fjarlægt félög af vaktinni.</div></div>'
      . '</div></div>';
    $ctype = function () { return 'text/html; charset=UTF-8'; };
    add_filter('wp_mail_content_type', $ctype);
    wp_mail($usr->user_email, 'Karp firmavakt: ' . $nCo . ' ' . ($nCo === 1 ? 'félag breyttist' : 'félög breyttust'), $html);
    remove_filter('wp_mail_content_type', $ctype);
  }
});
