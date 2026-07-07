<?php
/**
 * Karp — notenda-innskráningarstaða fyrir mælaborðið.
 * --------------------------------------------------------------------------
 * Sprautar  window.KARP_USER  inn í <head> svo embed-ið (WPCode-snippet 2867)
 * viti hvort gestur sé skráður inn, og geti sýnt prófíl-/innskráningar-takka
 * í appbarnum. Virkar með Ultimate Member ef það er virkt (annars WP-sjálfgefið).
 *
 * UPPSETNING (WPCode):
 *   Add Snippet → Add Your Custom Code → PHP Snippet →
 *   límdu þetta (SLEPPTU fyrstu <?php línunni — WPCode bætir henni við) →
 *   Active · Auto Insert · Run Everywhere · Save.
 *
 * ⚠ SKYNDIMINNI: tryggðu að LiteSpeed/skyndiminni visti EKKI síður fyrir
 *   innskráða notendur  ("Cache Logged-in Users" = OFF, sem er sjálfgefið).
 *   Annars gæti innskráningarstaða eins notanda lekið í skyndiminni annarra.
 *
 * Skilar (JSON í window.KARP_USER):
 *   loggedIn, loginUrl, registerUrl  — alltaf
 *   name, avatar, profileUrl, logoutUrl — aðeins þegar innskráð(ur)
 */
/**
 * Byggir KARP_USER-hleðsluna (innskráningarstaða + prófílreitir + nonce + follows).
 * --------------------------------------------------------------------------
 * Notað á TVEIMUR stöðum:
 *   1) wp_head-sprautun hér að neðan → window.KARP_USER (núverandi embed á karp.is).
 *   2) GET /wp-json/karp/v1/me (neðar) → sami farmur fyrir DECOUPLED framenda (Astro
 *      á karp.is), þar sem wp_head keyrir ekki því annar en WP rendar skelina.
 * Ein uppspretta sannleikans → embed og Astro haldast í takti.
 */
function karp_user_payload() {
    // Innskráning / nýskráning — NATIVE Karp-síður á karp.is (Astro) sem POST-a beint á
    // wp-login.php (top-level form → engin CORS; kakan er sett á .karp.is svo hún gildir á
    // karp.is eftir á). Þetta leysir af óstíluðu Ultimate Member-síðurnar (wp.karp.is/login
    // | /nyskraning). Villu-/árangurs-vísun + skilmála-samþykki: sjá karp-auth-pages.php.
    $login    = 'https://karp.is/innskra/';
    $register = 'https://karp.is/nyskraning/';

    $data = array(
        'loggedIn'    => false,
        'loginUrl'    => $login,
        'registerUrl' => $register,
    );

    if (is_user_logged_in()) {
        $u = wp_get_current_user();

        // Prófíl-slóð: Ultimate Member-prófíll ef hægt, annars Account-síða, annars WP-prófíll.
        $profile = '';
        if (function_exists('um_fetch_user') && function_exists('um_user_profile_url')) {
            um_fetch_user($u->ID);
            $profile = um_user_profile_url();
            if (function_exists('um_reset_user')) {
                um_reset_user();
            }
        }
        if (empty($profile) && function_exists('um_get_core_page')) {
            $acc = um_get_core_page('account');
            if (!empty($acc)) {
                $profile = $acc;
            }
        }
        if (empty($profile)) {
            $profile = get_edit_profile_url($u->ID);
        }

        $data['loggedIn']   = true;
        $data['name']       = $u->display_name;
        $data['avatar']     = get_avatar_url($u->ID, array('size' => 64)); // Ultimate Member skiptir hér inn prófílmyndinni
        // wp_logout_url() skilar &#038; (HTML-flúr) — afflúrum svo slóðin fari hrein í JSON
        // (annars tvíflúrast hún í framenda → _wpnonce afbakast → WordPress sýnir „viltu skrá þig út?" síðu).
        // LEIÐ A: útskráning skilar fólki á appið (karp.is), ekki WP-forsíðuna.
        $data['logoutUrl']  = html_entity_decode(wp_logout_url('https://karp.is/'), ENT_QUOTES);
        $data['profileUrl'] = $profile;

        // --- Karp-prófílreitir ("sérsvæðið") -------------------------------
        // Lesnir úr user meta. Tómir þar til reitirnir eru búnir til í UM með
        // þessum nákvæmu Meta Key gildum. Áfangi 2: mælaborðið les þetta til að
        // persónustilla (t.d. sveitarfelag -> kortið stillist, áhugasvið -> röðun).
        $data['fields'] = array(
            'sveitarfelag' => get_user_meta($u->ID, 'sveitarfelag', true),
            'kjordaemi'    => get_user_meta($u->ID, 'kjordaemi', true),
            'kynning'      => get_user_meta($u->ID, 'kynning', true),
            'ahugasvid'    => get_user_meta($u->ID, 'ahugasvid', true),
            'uppahalds'    => get_user_meta($u->ID, 'uppahalds', true),
            'tengill'      => get_user_meta($u->ID, 'tengill', true),
            'digest'       => get_user_meta($u->ID, 'digest', true),
        );
        // Nonce svo mælaborðið geti vistað reitina beint (POST /wp-json/karp/v1/me).
        $data['nonce'] = wp_create_nonce('wp_rest');
        // Hverjum notandinn fylgist með (t.d. "mp:123") — fyrir Fylgja-eiginleikann.
        $fl = get_user_meta($u->ID, 'karp_follows', true);
        $data['follows'] = is_array($fl) ? array_values($fl) : array();
        // Stjórnandi? → mælaborðið sýnir "Ný könnun"-form (Karp-kannanir).
        $data['isAdmin'] = current_user_can('manage_options');
        // Karp+ áskrift (LOTA 94): admin = alltaf; annars karp_plus_until (unix-tími) í FRAMTÍÐ = virk áskrift/fríprófun.
        $data['plus']    = current_user_can('manage_options') || ( (int) get_user_meta($u->ID, 'karp_plus_until', true) > time() );
        // Keyptar skýrslur (karp_reports = fylki {key,title,ts}) → KARP_USER.reports = LYKLAR (fyrir hasReport-athugun).
        $rep = (array) ( get_user_meta($u->ID, 'karp_reports', true) ?: array() );
        $data['reports'] = array_values( array_map( function ($r) { return is_array($r) ? (string) ( $r['key'] ?? '' ) : (string) $r; }, $rep ) );
        $data['id'] = (int) $u->ID;   // fyrir server-hlið entitlement-skráningu (greiðslu-callback → /reports/grant)
        // Per-þjónustu áskriftir (LOTA 100): frettir (Fjölmiðlagreining) + utbod (Útboðsvaktin), 3.490 kr/mán hvor.
        // admin = allt; annars karp_sub_<svc>_until (unix-tími) í FRAMTÍÐ = virk áskrift/fríprófun.
        $data['subs'] = array(
            'frettir' => $data['isAdmin'] || ( (int) get_user_meta($u->ID, 'karp_sub_frettir_until', true) > time() ),
            'utbod'   => $data['isAdmin'] || ( (int) get_user_meta($u->ID, 'karp_sub_utbod_until', true) > time() ),
        );
    }
    // Greiðsluveggir VIRKIR? Global rofi (option karp_paywall='1') — Aron kveikir þegar billing er tilbúið.
    // SLÖKKT sjálfgefið svo Vöktun/Útboð haldist opin þar til launch. Á við líka útskráða (gátt fyrir alla).
    $data['paywall'] = get_option('karp_paywall') === '1';

    return $data;
}

/**
 * LOTA 27 — leyfa örugga endursendingu YFIR Á APPIÐ (cross-host).
 * wp_safe_redirect() (login, logout, UM-redirects) strípar annars karp.is af
 * redirect_to og skilur notandann eftir á wp.karp.is — appið sendir nú alltaf
 * redirect_to með og þessi sía leyfir hýslana.
 */
add_filter('allowed_redirect_hosts', function ($hosts) {
    foreach (array('karp.is', 'www.karp.is', 'app.karp.is') as $h) {
        if (!in_array($h, (array) $hosts, true)) {
            $hosts[] = $h;
        }
    }
    return $hosts;
});

add_action('wp_head', function () {
    if (is_admin()) {
        return;
    }
    // JSON_HEX_TAG kemur í veg fyrir að "</script>" í gögnum brjóti út úr taginu.
    echo '<script>window.KARP_USER=' . wp_json_encode(karp_user_payload(), JSON_HEX_TAG | JSON_HEX_AMP) . ';</script>' . "\n";
}, 7);

/**
 * Vistun á Karp-prófílreitum BEINT úr mælaborðinu — POST /wp-json/karp/v1/me
 * --------------------------------------------------------------------------
 * Auðkenning: WordPress innskráningar-kaka + X-WP-Nonce (wp_rest) sem mælaborðið
 * sendir. Notandi getur aðeins breytt SÍNUM eigin reitum. Engin UM-síða þarf.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/me', array(
        // GET: skilar KARP_USER-farminum fyrir DECOUPLED framenda (Astro á karp.is) —
        //   kemur í stað wp_head-sprautunar, sem keyrir aðeins þegar WP rendar skelina.
        //   Opið (__return_true): {loggedIn:false} fyrir gest, full gögn + nonce þegar kakan auðkennir.
        array('methods' => 'GET',  'permission_callback' => '__return_true',                            'callback' => 'karp_me_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_me_save'),
    ));
    // POST /profile {name,email} — notandi uppfærir EIGIN prófíl (nafn + netfang).
    // Native „Breyta prófíl" á Mitt svæði — kemur í stað ónotuðu Ultimate-Member/wp-notanda-síðunnar.
    register_rest_route('karp/v1', '/profile', array(
        'methods' => 'POST',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback' => function (WP_REST_Request $req) {
            $uid = get_current_user_id();
            if (!$uid) { return array('ok' => false, 'error' => 'Ekki innskráð(ur).'); }
            $name = trim(wp_strip_all_tags((string) $req->get_param('name')));
            if ($name === '') { return array('ok' => false, 'error' => 'Nafn má ekki vera tómt.'); }
            $args = array('ID' => $uid, 'display_name' => $name, 'nickname' => $name);
            $email = sanitize_email((string) $req->get_param('email'));
            if ($email !== '' && is_email($email)) {
                $ex = email_exists($email);
                if ($ex && (int) $ex !== (int) $uid) { return array('ok' => false, 'error' => 'Netfangið er þegar í notkun hjá öðrum aðgangi.'); }
                $args['user_email'] = $email;
            }
            $res = wp_update_user($args);
            if (is_wp_error($res)) { return array('ok' => false, 'error' => $res->get_error_message()); }
            $u = get_userdata($uid);
            return array('ok' => true, 'name' => $u->display_name, 'email' => $u->user_email);
        },
    ));
});

/**
 * Karp+ áskrift + keyptar skýrslur (LOTA 94)
 * --------------------------------------------------------------------------
 * POST /plus/trial — hefja 1-mánaðar fríprófun (EINU SINNI per notanda; setur karp_plus_until).
 * GET  /reports    — full gögn keyptra skýrslna notandans (fyrir Mitt svæði).
 * ⚠ Sjálf greiðslan/áskriftin (endurnýjun karp_plus_until, viðbót í karp_reports) fer gegnum
 *   PSP-vefhook (Teya) server-hlið EFTIR staðfesta greiðslu — EKKI beint kallanlegt af framenda.
 *   Sá vefhook-handler kemur með Teya-samþættingunni (worker /api/pay + wp-hook).
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/plus/trial', array(
        'methods' => 'POST',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback' => function () {
            $uid = get_current_user_id();
            if ( get_user_meta($uid, 'karp_trial_used', true) ) {
                return array('ok' => false, 'error' => 'used');
            }
            $until = time() + 30 * DAY_IN_SECONDS;
            update_user_meta($uid, 'karp_plus_until', $until);
            update_user_meta($uid, 'karp_trial_used', '1');
            return array('ok' => true, 'until' => $until);
        },
    ));
    // POST /sub/trial {service:'frettir'|'utbod'} — 1-mánaðar fríprófun per þjónustu (EINU SINNI per þjónustu).
    // ⚠ Endurtekin rukkun (kort geymt, mánaðarleg endurnýjun karp_sub_<svc>_until) fer gegnum Teya-callback í
    //   worker EFTIR staðfesta greiðslu — kemur með SecurePay-boðgreiðslum/RPG-tóka (bíður Teya-svars).
    register_rest_route('karp/v1', '/sub/trial', array(
        'methods' => 'POST',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback' => function ($req) {
            $uid = get_current_user_id();
            $p = (array) $req->get_json_params();
            $svc = ( isset($p['service']) && $p['service'] === 'utbod' ) ? 'utbod' : 'frettir';
            $used = 'karp_sub_' . $svc . '_trial_used';
            if ( get_user_meta($uid, $used, true) ) {
                return array('ok' => false, 'error' => 'used');
            }
            $until = time() + 30 * DAY_IN_SECONDS;
            update_user_meta($uid, 'karp_sub_' . $svc . '_until', $until);
            update_user_meta($uid, $used, '1');
            return array('ok' => true, 'service' => $svc, 'until' => $until);
        },
    ));
    register_rest_route('karp/v1', '/reports', array(
        'methods' => 'GET',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback' => function () {
            $r = get_user_meta(get_current_user_id(), 'karp_reports', true);
            return array('reports' => array_values( (array) ( $r ?: array() ) ));
        },
    ));
    // POST /reports/grant — SERVER-TIL-SERVER: Cloudflare-worker (greiðslu-callback) skráir keypta
    // skýrslu á notanda EFTIR staðfesta Teya-greiðslu (worker sannreynir orderhash áður). Varið með
    // sameiginlegu leyndarmáli KARP_GRANT_SECRET (define í wp-config.php EÐA option karp_grant_secret)
    // — EKKI notenda-kaka. Sama leyndarmál er sett í Cloudflare (worker env KARP_GRANT_SECRET).
    register_rest_route('karp/v1', '/reports/grant', array(
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => 'karp_reports_grant',
    ));
});
function karp_reports_grant($req) {
    $secret = defined('KARP_GRANT_SECRET') ? (string) KARP_GRANT_SECRET : (string) get_option('karp_grant_secret');
    $p = (array) $req->get_json_params();
    $given = isset($p['secret']) ? (string) $p['secret'] : '';
    if ($secret === '' || ! hash_equals($secret, $given)) {
        return new WP_REST_Response(array('ok' => false, 'error' => 'auth'), 403);
    }
    $uid     = isset($p['userid'])  ? (int) $p['userid'] : 0;
    $key     = isset($p['key'])     ? sanitize_text_field($p['key']) : '';
    $orderid = isset($p['orderid']) ? sanitize_text_field($p['orderid']) : '';
    if ($uid <= 0 || $key === '') {
        return array('ok' => false, 'error' => 'args');
    }
    $rep = (array) ( get_user_meta($uid, 'karp_reports', true) ?: array() );
    foreach ($rep as $r) {                                   // dedupe á lykli — idempotent (callback getur endurtekið sig)
        if (is_array($r) && ( $r['key'] ?? '' ) === $key) { return array('ok' => true, 'dup' => true); }
    }
    $parts = explode(':', $key, 2);                          // titill leiddur af lykli fyrir Mitt svæði
    $kind  = $parts[0];
    $ref   = isset($parts[1]) ? $parts[1] : '';
    $title = ( $kind === 'fasteign' ? 'Verðmatsskýrsla' : 'Fyrirtækjaskýrsla' ) . ( $ref !== '' ? ' — ' . $ref : '' );
    $rep[] = array('key' => $key, 'title' => $title, 'ts' => time(), 'order' => $orderid);
    update_user_meta($uid, 'karp_reports', $rep);
    return array('ok' => true);
}
function karp_me_get() {
    // WordPress REST API kallar wp_set_current_user(0) á kökuauðkennd köll ÁN X-WP-Nonce
    // (rest_cookie_check_errors) → is_user_logged_in() yrði FALSKT. Þar sem /me er LES-aðgerð
    // sem SKILAR nonce-inu (til að rjúfa hænu-og-egg), endur-staðfestum við lotu-kökuna beint.
    // ÖRUGGT: CORS hleypir AÐEINS karp.is/app.karp.is/www að lesa svarið → nonce lekur ekki annað.
    if ( ! is_user_logged_in() ) {
        $uid = wp_validate_auth_cookie( '', 'logged_in' );
        if ( $uid ) {
            wp_set_current_user( $uid );
        }
    }
    nocache_headers(); // notanda-sértæk gögn (nonce) — ALDREI í skyndiminni
    return karp_user_payload();
}

/**
 * CORS-herðing fyrir DECOUPLED framenda (Astro á karp.is).
 * --------------------------------------------------------------------------
 * WordPress-core endurvarpar SÉRHVERJU origin með Allow-Credentials:true. Um leið og
 * GET /me afhjúpar nonce yrði það CSRF-flötur (illgjarnt origin gæti lesið nonce).
 * Því: fjarlægjum core-hegðunina og hvítlistum AÐEINS Karp-lénin.
 * LEIÐ A: karp.is er aðalvefurinn (Astro á Cloudflare), app.karp.is 301-ar þangað
 * og www.karp.is sömuleiðis — öll þrjú í hvítlistanum til öryggis í millibilsástandi.
 */
add_action('rest_api_init', function () {
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
    add_filter('rest_pre_serve_request', function ($value) {
        $origin  = get_http_origin();
        $allowed = array(
            'https://karp.is',       // Astro-framendinn — AÐALVEFURINN (Leið A)
            'https://app.karp.is',   // gamla undirlénið — 301-ar á karp.is en leyft í millibilsástandi
            'https://www.karp.is',   // www — 301-ar á karp.is
        );
        if ($origin && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin', false);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Methods: OPTIONS, GET, POST');
            header('Access-Control-Allow-Headers: Authorization, X-WP-Nonce, Content-Type');
        }
        return $value;
    });
}, 15);
function karp_me_save($req) {
    $uid = get_current_user_id();
    if (!$uid) {
        return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401));
    }
    $p = $req->get_json_params();
    if (!is_array($p)) {
        $p = array();
    }
    $allowed = array('sveitarfelag', 'kjordaemi', 'kynning', 'ahugasvid', 'uppahalds', 'tengill', 'digest');
    foreach ($allowed as $k) {
        if (!array_key_exists($k, $p)) {
            continue;
        }
        $v = $p[$k];
        if ($k === 'kynning') {
            $v = sanitize_textarea_field($v);
        } elseif ($k === 'tengill') {
            $v = $v ? esc_url_raw($v) : '';
        } elseif ($k === 'ahugasvid') {
            $v = is_array($v) ? array_values(array_map('sanitize_text_field', $v)) : sanitize_text_field($v);
        } else {
            $v = sanitize_text_field($v);
        }
        update_user_meta($uid, $k, $v);
    }
    return array('ok' => true, 'saved' => array_values(array_intersect($allowed, array_keys($p))));
}

/**
 * Notenda-atkvæði um þingmál — GET/POST /wp-json/karp/v1/vote
 * --------------------------------------------------------------------------
 * GET  ?bill=<lykill>          → { ja, nei, mine }  (opið öllum, sýnir talningu)
 * POST { bill, choice:ja|nei } → skráir/breytir atkvæði (krefst innskráningar + nonce)
 * Geymsla: heildartölur í wp_option (karp_votec_<bill>), atkvæði notanda í user meta
 * (karp_vote_<bill>) svo hann geti skipt um skoðun án tvítalningar.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/vote', array(
        array('methods' => 'GET',  'permission_callback' => '__return_true',                            'callback' => 'karp_vote_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_vote_post'),
    ));
});
function karp_vote_counts($bill) {
    $c = get_option('karp_votec_' . $bill);
    if (!is_array($c)) {
        $c = array('ja' => 0, 'nei' => 0);
    }
    return array('ja' => (int) $c['ja'], 'nei' => (int) $c['nei']);
}
function karp_vote_get($req) {
    $bill = sanitize_key($req->get_param('bill'));
    if (!$bill) {
        return new WP_Error('karp_nobill', 'Vantar mál.', array('status' => 400));
    }
    $mine = is_user_logged_in() ? get_user_meta(get_current_user_id(), 'karp_vote_' . $bill, true) : '';
    // Tölfræði birtist AÐEINS eftir að þú hefur kosið (og ert innskráð(ur)) — annars sendum við engar tölur.
    if (!$mine) {
        return array('voted' => false, 'mine' => '');
    }
    $c = karp_vote_counts($bill);
    return array('voted' => true, 'mine' => $mine, 'ja' => $c['ja'], 'nei' => $c['nei']);
}
function karp_vote_post($req) {
    $uid = get_current_user_id();
    if (!$uid) {
        return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401));
    }
    $p = $req->get_json_params();
    $bill = sanitize_key(isset($p['bill']) ? $p['bill'] : '');
    $choice = isset($p['choice']) ? sanitize_text_field($p['choice']) : '';
    if (!$bill || ($choice !== 'ja' && $choice !== 'nei')) {
        return new WP_Error('karp_bad', 'Ógilt mál eða val.', array('status' => 400));
    }
    $prev = get_user_meta($uid, 'karp_vote_' . $bill, true);
    $c = karp_vote_counts($bill);
    if ($prev !== $choice) {
        if ($prev === 'ja' || $prev === 'nei') {
            $c[$prev] = max(0, $c[$prev] - 1);
        }
        $c[$choice] = $c[$choice] + 1;
        update_option('karp_votec_' . $bill, $c, false);
        update_user_meta($uid, 'karp_vote_' . $bill, $choice);
    }
    return array('ja' => $c['ja'], 'nei' => $c['nei'], 'mine' => $choice);
}

/**
 * Uppáhalds-gröf samstillt við prófílinn (þvert á tæki) — GET/POST /wp-json/karp/v1/favs
 * GET → { favs:[...] }   POST { favs:[...] } → vistar (krefst innskráningar + nonce)
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/favs', array(
        array('methods' => 'GET',  'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_favs_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_favs_post'),
    ));
});
function karp_favs_get($req) {
    $f = get_user_meta(get_current_user_id(), 'karp_favs', true);
    return array('favs' => is_array($f) ? array_values($f) : array());
}
function karp_favs_post($req) {
    $uid = get_current_user_id();
    if (!$uid) {
        return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401));
    }
    $p = $req->get_json_params();
    $favs = (isset($p['favs']) && is_array($p['favs'])) ? array_slice(array_values(array_unique(array_map('sanitize_text_field', $p['favs']))), 0, 60) : array();
    update_user_meta($uid, 'karp_favs', $favs);
    return array('ok' => true, 'favs' => $favs);
}

/**
 * Fylgja — hverjum notandinn fylgist með (þingmenn o.fl.) — GET/POST /wp-json/karp/v1/follows
 * Geymt sem listi strengja (t.d. "mp:123") í user meta karp_follows.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/follows', array(
        array('methods' => 'GET',  'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_follows_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_follows_post'),
    ));
});
function karp_follows_get($req) {
    $f = get_user_meta(get_current_user_id(), 'karp_follows', true);
    return array('follows' => is_array($f) ? array_values($f) : array());
}
function karp_follows_post($req) {
    $uid = get_current_user_id();
    if (!$uid) {
        return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401));
    }
    $p = $req->get_json_params();
    $fl = (isset($p['follows']) && is_array($p['follows'])) ? array_slice(array_values(array_unique(array_map('sanitize_text_field', $p['follows']))), 0, 200) : array();
    update_user_meta($uid, 'karp_follows', $fl);
    return array('ok' => true, 'follows' => $fl);
}

/**
 * Öll atkvæði notandans um þingmál — GET /wp-json/karp/v1/myvotes → { "157_32":"ja", ... }
 * Notað fyrir flokka-/þingmanna-samsvörun. Krefst innskráningar.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/myvotes', array(
        'methods' => 'GET',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback' => 'karp_myvotes_get',
    ));
});
function karp_myvotes_get($req) {
    $uid = get_current_user_id();
    $all = get_user_meta($uid);
    $out = array();
    if (is_array($all)) {
        foreach ($all as $k => $v) {
            if (strpos($k, 'karp_vote_') === 0) {
                $choice = is_array($v) ? reset($v) : $v;
                if ($choice === 'ja' || $choice === 'nei') {
                    $out[substr($k, strlen('karp_vote_'))] = $choice;
                }
            }
        }
    }
    return array('votes' => (object) $out);
}

/**
 * Spá-leikur — notendur spá fyrir um hagtölur — GET/POST /wp-json/karp/v1/spa?topic=X
 * GET → { avg, count, mine }   POST { topic, value } → skráir/uppfærir spá (innskráning + nonce)
 * Geymir hlaupandi summu+fjölda í option (karp_spa_<topic>) + spá notanda í user meta.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/spa', array(
        array('methods' => 'GET',  'permission_callback' => '__return_true',                            'callback' => 'karp_spa_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_spa_post'),
    ));
});
function karp_spa_get($req) {
    $topic = sanitize_key($req->get_param('topic'));
    if (!$topic) {
        return new WP_Error('karp_notopic', 'Vantar efni.', array('status' => 400));
    }
    $agg = get_option('karp_spa_' . $topic);
    if (!is_array($agg)) {
        $agg = array('sum' => 0, 'count' => 0);
    }
    $mine = is_user_logged_in() ? get_user_meta(get_current_user_id(), 'karp_spa_' . $topic, true) : '';
    $avg = ($agg['count'] > 0) ? round($agg['sum'] / $agg['count'], 2) : null;
    return array('avg' => $avg, 'count' => (int) $agg['count'], 'mine' => ($mine === '' ? null : (float) $mine));
}
function karp_spa_post($req) {
    $uid = get_current_user_id();
    if (!$uid) {
        return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401));
    }
    $p = $req->get_json_params();
    $topic = sanitize_key(isset($p['topic']) ? $p['topic'] : '');
    $val = isset($p['value']) ? (float) $p['value'] : null;
    if (!$topic || $val === null || !is_finite($val)) {
        return new WP_Error('karp_bad', 'Ógilt efni eða gildi.', array('status' => 400));
    }
    $val = max(-100, min(1000, $val));
    $agg = get_option('karp_spa_' . $topic);
    if (!is_array($agg)) {
        $agg = array('sum' => 0, 'count' => 0);
    }
    $prev = get_user_meta($uid, 'karp_spa_' . $topic, true);
    if ($prev === '' || $prev === false) {
        $agg['sum'] += $val;
        $agg['count']++;
    } else {
        $agg['sum'] += ($val - (float) $prev); // uppfærsla — ekki ný talning
    }
    update_option('karp_spa_' . $topic, $agg, false);
    update_user_meta($uid, 'karp_spa_' . $topic, $val);
    $avg = ($agg['count'] > 0) ? round($agg['sum'] / $agg['count'], 2) : null;
    return array('avg' => $avg, 'count' => (int) $agg['count'], 'mine' => $val);
}

/**
 * Umræða — athugasemdir við þingmál — GET/POST /wp-json/karp/v1/comments?bill=X
 * Geymt í option karp_cmts_<bill>. Innskráðir geta skrifað (sanitize + lengdarþak).
 * ATH: einföld hófsemd (innskráning + lengd + þak). Fyrir opna síðu er mælt með
 * viðbótar-hófsemd (t.d. tilkynna/eyða-viðmót eða ruslsía) — sjá LESTU-MIG.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/comments', array(
        array('methods' => 'GET',  'permission_callback' => '__return_true',                            'callback' => 'karp_cmts_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_cmts_post'),
    ));
});
function karp_cmts_get($req) {
    $bill = sanitize_key($req->get_param('bill'));
    if (!$bill) {
        return new WP_Error('karp_nobill', 'Vantar mál.', array('status' => 400));
    }
    $c = get_option('karp_cmts_' . $bill);
    return array('comments' => is_array($c) ? array_values($c) : array());
}
function karp_cmts_post($req) {
    $uid = get_current_user_id();
    if (!$uid) {
        return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401));
    }
    $p = $req->get_json_params();
    $bill = sanitize_key(isset($p['bill']) ? $p['bill'] : '');
    $text = isset($p['text']) ? trim(sanitize_textarea_field($p['text'])) : '';
    if (!$bill || $text === '') {
        return new WP_Error('karp_bad', 'Tóm athugasemd eða mál vantar.', array('status' => 400));
    }
    if (function_exists('mb_substr') && mb_strlen($text) > 800) {
        $text = mb_substr($text, 0, 800);
    }
    $c = get_option('karp_cmts_' . $bill);
    if (!is_array($c)) {
        $c = array();
    }
    $u = wp_get_current_user();
    array_unshift($c, array('uid' => $uid, 'name' => $u->display_name, 'text' => $text, 't' => time()));
    $c = array_slice($c, 0, 200);
    update_option('karp_cmts_' . $bill, $c, false);
    return array('ok' => true, 'comments' => array_values($c));
}

/**
 * Karp-kannanir (eigin kannanir) — GET /polls · POST /pollvote · /pollcreate · /polldelete
 * --------------------------------------------------------------------------
 * GET  /polls                 → { polls:[{id,q,opts,[voted,mine,counts,total]}] }  (opið;
 *                                tölur AÐEINS ef innskráð(ur) OG búið að kjósa — "kjóstu til að sjá".)
 * POST /pollvote {id,opt}      → skráir/breytir atkvæði (innskráning + nonce)
 * POST /pollcreate {q,opts[]}  → býr til könnun (AÐEINS stjórnandi: manage_options)
 * POST /polldelete {id}        → eyðir könnun (AÐEINS stjórnandi)
 * Geymsla: listinn í wp_option karp_polls; talning í karp_pollc_<id>; atkvæði í user meta karp_pollvote_<id>.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/polls', array(
        array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'karp_polls_get'),
    ));
    register_rest_route('karp/v1', '/pollvote', array(
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_pollvote_post'),
    ));
    register_rest_route('karp/v1', '/pollcreate', array(
        array('methods' => 'POST', 'permission_callback' => function () { return current_user_can('manage_options'); }, 'callback' => 'karp_pollcreate_post'),
    ));
    register_rest_route('karp/v1', '/polldelete', array(
        array('methods' => 'POST', 'permission_callback' => function () { return current_user_can('manage_options'); }, 'callback' => 'karp_polldelete_post'),
    ));
});
function karp_polls_list() {
    $p = get_option('karp_polls');
    return is_array($p) ? $p : array();
}
function karp_poll_counts($id, $n) {
    $c = get_option('karp_pollc_' . $id);
    if (!is_array($c)) { $c = array(); }
    $out = array();
    for ($i = 0; $i < $n; $i++) { $out[$i] = isset($c[$i]) ? (int) $c[$i] : 0; }
    return $out;
}
function karp_polls_get($req) {
    $uid = is_user_logged_in() ? get_current_user_id() : 0;
    $out = array();
    foreach (karp_polls_list() as $poll) {
        if (empty($poll['id']) || empty($poll['opts'])) { continue; }
        $item = array('id' => $poll['id'], 'q' => $poll['q'], 'opts' => array_values($poll['opts']));
        $mine = $uid ? get_user_meta($uid, 'karp_pollvote_' . $poll['id'], true) : '';
        if ($mine !== '' && $mine !== false) {
            $counts = karp_poll_counts($poll['id'], count($poll['opts']));
            $item['voted']  = true;
            $item['mine']   = (int) $mine;
            $item['counts'] = array_values($counts);
            $item['total']  = array_sum($counts);
        } else {
            $item['voted'] = false;
        }
        $out[] = $item;
    }
    return array('polls' => $out);
}
function karp_pollvote_post($req) {
    $uid = get_current_user_id();
    if (!$uid) { return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401)); }
    $p = $req->get_json_params();
    $id  = isset($p['id']) ? sanitize_key($p['id']) : '';
    $opt = isset($p['opt']) ? (int) $p['opt'] : -1;
    $poll = null;
    foreach (karp_polls_list() as $pl) { if ($pl['id'] === $id) { $poll = $pl; break; } }
    if (!$poll) { return new WP_Error('karp_bad', 'Könnun fannst ekki.', array('status' => 404)); }
    $n = count($poll['opts']);
    if ($opt < 0 || $opt >= $n) { return new WP_Error('karp_bad', 'Ógilt val.', array('status' => 400)); }
    $prev = get_user_meta($uid, 'karp_pollvote_' . $id, true);
    $counts = karp_poll_counts($id, $n);
    if ($prev === '' || (int) $prev !== $opt) {
        if ($prev !== '' && isset($counts[(int) $prev])) { $counts[(int) $prev] = max(0, $counts[(int) $prev] - 1); }
        $counts[$opt] = $counts[$opt] + 1;
        update_option('karp_pollc_' . $id, $counts, false);
        update_user_meta($uid, 'karp_pollvote_' . $id, $opt);
    }
    return array('ok' => true, 'mine' => $opt, 'counts' => array_values($counts), 'total' => array_sum($counts));
}
function karp_pollcreate_post($req) {
    if (!current_user_can('manage_options')) { return new WP_Error('karp_noauth', 'Aðeins stjórnandi.', array('status' => 403)); }
    $p = $req->get_json_params();
    $q = isset($p['q']) ? trim(sanitize_text_field($p['q'])) : '';
    $opts_in = (isset($p['opts']) && is_array($p['opts'])) ? $p['opts'] : array();
    $opts = array();
    foreach ($opts_in as $o) { $o = trim(sanitize_text_field($o)); if ($o !== '') { $opts[] = $o; } }
    $opts = array_slice($opts, 0, 8);
    if (strlen($q) < 3 || count($opts) < 2) { return new WP_Error('karp_bad', 'Spurning + a.m.k. 2 svör.', array('status' => 400)); }
    $id = 'p' . substr(md5(uniqid('', true)), 0, 9);
    $polls = karp_polls_list();
    array_unshift($polls, array('id' => $id, 'q' => $q, 'opts' => $opts, 'created' => time()));
    $polls = array_slice($polls, 0, 50);
    update_option('karp_polls', $polls, false);
    return array('ok' => true, 'id' => $id);
}
function karp_polldelete_post($req) {
    if (!current_user_can('manage_options')) { return new WP_Error('karp_noauth', 'Aðeins stjórnandi.', array('status' => 403)); }
    $p = $req->get_json_params();
    $id = isset($p['id']) ? sanitize_key($p['id']) : '';
    $polls = array_values(array_filter(karp_polls_list(), function ($pl) use ($id) { return $pl['id'] !== $id; }));
    update_option('karp_polls', $polls, false);
    delete_option('karp_pollc_' . $id);
    return array('ok' => true);
}

/**
 * Lykilorð + prófílmynd BEINT í mælaborðinu (svo ekki þurfi Ultimate Member-síðu).
 * --------------------------------------------------------------------------
 * POST /changepass {current,new} → staðfestir núverandi lykilorð, setur nýtt, heldur innskráningu.
 * POST /avatar     {img:dataURL} → endur-kóðar mynd (GD, max 512px PNG → strípar allt óþarft), vistar
 *                                  í uploads, geymir slóð í user meta karp_avatar; filter lætur hana ráða.
 * Bæði krefjast innskráningar + X-WP-Nonce.
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/changepass', array(
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_changepass'),
    ));
    register_rest_route('karp/v1', '/avatar', array(
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_avatar_save'),
    ));
});
function karp_changepass($req) {
    $uid = get_current_user_id();
    if (!$uid) { return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401)); }
    $p   = $req->get_json_params();
    $cur = isset($p['current']) ? (string) $p['current'] : '';
    $new = isset($p['new']) ? (string) $p['new'] : '';
    $user = get_user_by('id', $uid);
    if (!$user || !wp_check_password($cur, $user->user_pass, $uid)) {
        return new WP_Error('karp_badpass', 'Núverandi lykilorð er rangt.', array('status' => 403));
    }
    if (strlen($new) < 8) {
        return new WP_Error('karp_weak', 'Nýtt lykilorð þarf að vera a.m.k. 8 stafir.', array('status' => 400));
    }
    wp_set_password($new, $uid);          // eyðir öllum lotum notandans
    wp_clear_auth_cookie();               // … svo við endur-auðkennum ÞESSA lotu strax
    wp_set_current_user($uid);
    wp_set_auth_cookie($uid, true);
    return array('ok' => true, 'nonce' => wp_create_nonce('wp_rest')); // nýtt nonce fyrir framhaldið
}
function karp_avatar_save($req) {
    $uid = get_current_user_id();
    if (!$uid) { return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401)); }
    if (!function_exists('imagecreatefromstring')) {
        return new WP_Error('karp_nogd', 'Myndvinnsla (GD) ekki tiltæk á netþjóni.', array('status' => 500));
    }
    $p   = $req->get_json_params();
    $img = isset($p['img']) ? (string) $p['img'] : '';
    if (!preg_match('#^data:image/(png|jpe?g|webp);base64,#i', $img)) {
        return new WP_Error('karp_badimg', 'Ógild mynd (þarf PNG, JPG eða WEBP).', array('status' => 400));
    }
    $data = base64_decode(substr($img, strpos($img, ',') + 1));
    if ($data === false || strlen($data) < 100) {
        return new WP_Error('karp_badimg', 'Ógild mynd.', array('status' => 400));
    }
    if (strlen($data) > 5 * 1024 * 1024) {
        return new WP_Error('karp_big', 'Myndin er of stór (hámark 5 MB).', array('status' => 413));
    }
    $src = @imagecreatefromstring($data);   // sannreynir + les; mistekst á öðru en mynd
    if (!$src) { return new WP_Error('karp_badimg', 'Skráin er ekki gild mynd.', array('status' => 400)); }
    $w = imagesx($src); $h = imagesy($src); $max = 512; $nw = $w; $nh = $h;
    if ($w > $max || $h > $max) {
        if ($w >= $h) { $nw = $max; $nh = (int) round($h * $max / $w); }
        else { $nh = $max; $nw = (int) round($w * $max / $h); }
    }
    $dst = imagecreatetruecolor($nw, $nh);
    imagealphablending($dst, false); imagesavealpha($dst, true);
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    ob_start(); imagepng($dst); $out = ob_get_clean();   // endur-kóðun → strípar EXIF/innfellt
    imagedestroy($src); imagedestroy($dst);
    $name = 'karp-avatar-' . $uid . '-' . time() . '.png';
    $upd  = wp_upload_bits($name, null, $out);
    if (!empty($upd['error'])) { return new WP_Error('karp_up', 'Upphleðsla mistókst.', array('status' => 500)); }
    $prev = get_user_meta($uid, 'karp_avatar_path', true);
    if ($prev && $prev !== $upd['file'] && file_exists($prev)) { @unlink($prev); }
    update_user_meta($uid, 'karp_avatar', esc_url_raw($upd['url']));
    update_user_meta($uid, 'karp_avatar_path', $upd['file']);
    return array('ok' => true, 'url' => $upd['url']);
}
// karp_avatar (notandi-upphlaðin mynd) ræður yfir Gravatar/UM ef hún er til.
add_filter('get_avatar_url', 'karp_avatar_url_filter', 99, 2);
function karp_avatar_url_filter($url, $id_or_email) {
    $uid = 0;
    if (is_numeric($id_or_email)) { $uid = (int) $id_or_email; }
    elseif (is_object($id_or_email) && !empty($id_or_email->user_id)) { $uid = (int) $id_or_email->user_id; }
    elseif (is_string($id_or_email)) { $u = get_user_by('email', $id_or_email); if ($u) { $uid = $u->ID; } }
    if ($uid) { $a = get_user_meta($uid, 'karp_avatar', true); if ($a) { return $a; } }
    return $url;
}

/**
 * Burst Statistics — heimsóknartölfræði fyrir STJÓRNANDA á „Mitt svæði".
 * --------------------------------------------------------------------------
 * GET /wp-json/karp/v1/burst → { available, today:{pageviews,visitors}, week:{...}, top:[{url,pv}] }
 * AÐEINS stjórnandi (manage_options). Les beint úr Burst-töflunni (burst_statistics): `time` er
 * UNIX-sek, `uid` = einkvæmur gestur, flettingar = COUNT(DISTINCT ID). (Staðfest gegn Burst 3.5.1.)
 * Ef Burst er ekki uppsett → { available:false } (engin villa).
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/burst', array(
        array('methods' => 'GET', 'permission_callback' => function () { return current_user_can('manage_options'); }, 'callback' => 'karp_burst_stats'),
    ));
});
function karp_burst_stats($req) {
    if (!current_user_can('manage_options')) { return new WP_Error('karp_noauth', 'Aðeins stjórnandi.', array('status' => 403)); }
    global $wpdb;
    $t = $wpdb->prefix . 'burst_statistics';
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) {
        return array('available' => false);
    }
    $tz = wp_timezone();
    $today_start = (new DateTimeImmutable('today', $tz))->getTimestamp();
    $now         = time();
    $week_start  = (new DateTimeImmutable('today -6 days', $tz))->getTimestamp(); // síðustu 7 dagar með í dag
    $totals = $wpdb->get_row($wpdb->prepare(
        "SELECT
            COUNT(DISTINCT CASE WHEN `time` > %d AND `time` < %d THEN ID  END) AS pv_today,
            COUNT(DISTINCT CASE WHEN `time` > %d AND `time` < %d THEN uid END) AS uv_today,
            COUNT(DISTINCT CASE WHEN `time` > %d AND `time` < %d THEN ID  END) AS pv_7d,
            COUNT(DISTINCT CASE WHEN `time` > %d AND `time` < %d THEN uid END) AS uv_7d
         FROM `$t` WHERE `time` > %d AND `time` < %d",
        $today_start, $now, $today_start, $now, $week_start, $now, $week_start, $now, $week_start, $now
    ));
    $top = $wpdb->get_results($wpdb->prepare(
        "SELECT page_url, COUNT(DISTINCT ID) AS pageviews FROM `$t` WHERE `time` > %d AND `time` < %d GROUP BY page_url ORDER BY pageviews DESC LIMIT 6",
        $week_start, $now
    ));
    $top_pages = array();
    foreach ((array) $top as $r) { $top_pages[] = array('url' => $r->page_url, 'pv' => (int) $r->pageviews); }
    return array(
        'available' => true,
        'today' => array('pageviews' => (int) $totals->pv_today, 'visitors' => (int) $totals->uv_today),
        'week'  => array('pageviews' => (int) $totals->pv_7d, 'visitors' => (int) $totals->uv_7d),
        'top'   => $top_pages,
    );
}

/**
 * Stefnupróf — vista niðurstöðu notanda (þvert á tæki) + nafnlausan samfélags-samanburð.
 * GET  /wp-json/karp/v1/quizresult → { mine:{ans,top,pct,bucket,t}|null, agg:{buckets:{key:n},total} }
 * POST /wp-json/karp/v1/quizresult { ans:{nr:-1|0|1}, top:[kóðar], pct, bucket } → vistar + uppfærir samtölu.
 * Niðurstaða notanda er í HANS EIGIN user meta (aðeins hann/stjórnandi sér). Samtalan geymir
 * EINGÖNGU nafnlausa flokks-talningu (engin tenging við notanda, engin hrá svör).
 */
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/quizresult', array(
        array('methods' => 'GET',  'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_quiz_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_quiz_post'),
    ));
});
function karp_quiz_agg_read() {
    $agg = get_option('karp_quiz_agg');
    if (!is_array($agg)) { $agg = array(); }
    $total = 0;
    foreach ($agg as $n) { $total += (int) $n; }
    return array('buckets' => $agg, 'total' => $total);
}
function karp_quiz_get($req) {
    $uid = get_current_user_id();
    $mine = get_user_meta($uid, 'karp_quizresult', true);
    if (!is_array($mine)) { $mine = null; }
    return array('mine' => $mine, 'agg' => karp_quiz_agg_read());
}
function karp_quiz_post($req) {
    $uid = get_current_user_id();
    if (!$uid) { return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401)); }
    $p = $req->get_json_params();
    $top = (isset($p['top']) && is_array($p['top'])) ? array_slice(array_map('sanitize_text_field', $p['top']), 0, 6) : array();
    $pct = isset($p['pct']) ? max(0, min(100, (int) $p['pct'])) : 0;
    $bucket = isset($p['bucket']) ? substr(preg_replace('/[^A-Za-z\-]/', '', $p['bucket']), 0, 30) : '';
    if (!$bucket || !count($top)) { return new WP_Error('karp_bad', 'Ógild niðurstaða.', array('status' => 400)); }
    // hreinsa svör: lykill = mál-nr (int), gildi í {-1,0,1}
    $clean = array();
    if (isset($p['ans']) && is_array($p['ans'])) {
        foreach ($p['ans'] as $k => $v) {
            $ki = (int) $k; $vi = (int) $v;
            if ($ki > 0 && $vi >= -1 && $vi <= 1) { $clean[(string) $ki] = $vi; }
        }
    }
    // uppfæra nafnlausa samtölu — færa úr fyrri flokki ef notandi hefur tekið áður
    $agg = get_option('karp_quiz_agg');
    if (!is_array($agg)) { $agg = array(); }
    $prev = get_user_meta($uid, 'karp_quizresult', true);
    if (is_array($prev) && !empty($prev['bucket']) && isset($agg[$prev['bucket']])) {
        $agg[$prev['bucket']] = max(0, (int) $agg[$prev['bucket']] - 1);
        if ($agg[$prev['bucket']] === 0) { unset($agg[$prev['bucket']]); }
    }
    $agg[$bucket] = (isset($agg[$bucket]) ? (int) $agg[$bucket] : 0) + 1;
    update_option('karp_quiz_agg', $agg, false);
    $rec = array('ans' => $clean, 'top' => $top, 'pct' => $pct, 'bucket' => $bucket, 't' => time());
    update_user_meta($uid, 'karp_quizresult', $rec);
    return array('mine' => $rec, 'agg' => karp_quiz_agg_read());
}

/**
 * Þröskuldsvaktir — notandi fær tölvupóst þegar hagvísir fer yfir/undir viðmið.
 * --------------------------------------------------------------------------
 * GET  /wp-json/karp/v1/vaktir                                  → { vaktir:[{id,metric,area,dir,threshold,now,...}] }
 * POST /wp-json/karp/v1/vaktir { metric, area, dir, threshold } → stofnar vakt (innskráning + nonce)
 * POST /wp-json/karp/v1/vaktirdelete { id }                     → eyðir vakt
 * Cron (karp_vaktir_check, daglega): les BÖKUÐ gögn (karp-data.txt — sömu og mælaborðið),
 *   metur hverja vakt og sendir póst þegar hún fer FYRST yfir/undir viðmið (state-breyting → ekki spam).
 *   Bökuðu gögnin uppfærast þegar nýtt karp-data.txt er hlaðið upp (mánaðarlega fyrir atvinnuleysi o.fl.).
 *
 * Slóð gagnaskrár: sjálfgefið /wp-content/uploads/2026/06/karp-data.txt (sama og embed notar).
 *   Breyta má með  define('KARP_DATA_URL', '...');  ofar í wp-config eða snippet.
 */
if (!defined('KARP_DATA_URL')) {
    define('KARP_DATA_URL', content_url('/uploads/2026/06/karp-data.txt'));
}
function karp_vaktir_metrics() {
    return array(
        'atvinnuleysi_sv'  => array('label' => 'Atvinnuleysi sveitarfélags', 'unit' => '%', 'area' => 'sveitarfelag', 'dec' => 1),
        'atvinnuleysi'     => array('label' => 'Atvinnuleysi (allt landið)', 'unit' => '%', 'area' => false, 'dec' => 1),
        'fasteignaverd_sv' => array('label' => 'Fasteignaverð sveitarfélags', 'unit' => ' þús/m²', 'area' => 'sveitarfelag', 'dec' => 0),
        'afbrot_lh'        => array('label' => 'Afbrot (landshluti)', 'unit' => ' brot/10þ', 'area' => 'landshluti', 'dec' => 1),
    );
}
function karp_vaktir_data() {
    static $d = null;
    if ($d !== null) { return $d; }
    $r = wp_remote_get(KARP_DATA_URL, array('timeout' => 15));
    $body = is_wp_error($r) ? '' : wp_remote_retrieve_body($r);
    $d = $body ? json_decode($body, true) : array();
    if (!is_array($d)) { $d = array(); }
    return $d;
}
function karp_vaktir_value($metric, $area) {
    $d = karp_vaktir_data();
    switch ($metric) {
        case 'atvinnuleysi':     return isset($d['ATVINNULEYSI']['latest']) ? (float) $d['ATVINNULEYSI']['latest'] : null;
        case 'atvinnuleysi_sv':  return isset($d['ATVINNULEYSI']['byMuni'][$area]['rate']) ? (float) $d['ATVINNULEYSI']['byMuni'][$area]['rate'] : null;
        case 'fasteignaverd_sv': return isset($d['FASTEIGNIR']['byMuni'][$area]['m2']) ? (float) $d['FASTEIGNIR']['byMuni'][$area]['m2'] : null;
        case 'afbrot_lh':        return isset($d['GLAEPIR']['byRegion'][$area]['hegn']) ? (float) $d['GLAEPIR']['byRegion'][$area]['hegn'] : null;
    }
    return null;
}
function karp_vaktir_num($v, $dec = 1) {
    return number_format((float) $v, $dec, ',', '.');
}
function karp_vaktir_list($uid) {
    $v = get_user_meta($uid, 'karp_vaktir', true);
    return is_array($v) ? $v : array();
}
function karp_vaktir_state($cur, $dir, $threshold) {
    if ($cur === null) { return 0; }
    return (($dir === 'yfir' && $cur >= $threshold) || ($dir === 'undir' && $cur <= $threshold)) ? 1 : 0;
}
add_action('rest_api_init', function () {
    register_rest_route('karp/v1', '/vaktir', array(
        array('methods' => 'GET',  'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_vaktir_get'),
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_vaktir_post'),
    ));
    register_rest_route('karp/v1', '/vaktirdelete', array(
        array('methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in(); }, 'callback' => 'karp_vaktir_delete'),
    ));
});
function karp_vaktir_get($req) {
    $uid = get_current_user_id();
    $out = array();
    foreach (karp_vaktir_list($uid) as $w) {
        $w['now'] = karp_vaktir_value($w['metric'], isset($w['area']) ? $w['area'] : '');
        $out[] = $w;
    }
    return array('vaktir' => $out);
}
function karp_vaktir_post($req) {
    $uid = get_current_user_id();
    if (!$uid) { return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401)); }
    $p = $req->get_json_params();
    $metrics = karp_vaktir_metrics();
    $metric = isset($p['metric']) ? sanitize_text_field($p['metric']) : '';
    if (!isset($metrics[$metric])) { return new WP_Error('karp_bad', 'Óþekktur mælikvarði.', array('status' => 400)); }
    $area = isset($p['area']) ? sanitize_text_field($p['area']) : '';
    if ($metrics[$metric]['area'] && $area === '') { return new WP_Error('karp_bad', 'Vantar svæði.', array('status' => 400)); }
    if (!$metrics[$metric]['area']) { $area = ''; }
    $dir = (isset($p['dir']) && $p['dir'] === 'undir') ? 'undir' : 'yfir';
    $threshold = isset($p['threshold']) ? (float) $p['threshold'] : null;
    if ($threshold === null || !is_finite($threshold)) { return new WP_Error('karp_bad', 'Ógilt viðmið.', array('status' => 400)); }
    $list = karp_vaktir_list($uid);
    if (count($list) >= 30) { return new WP_Error('karp_max', 'Hámark 30 vaktir.', array('status' => 400)); }
    $cur = karp_vaktir_value($metric, $area);
    // last = núverandi staða svo við sendum EKKI póst strax ef það er þegar yfir/undir — bara við næstu breytingu
    $w = array('id' => 'v' . substr(md5(uniqid('', true)), 0, 9), 'metric' => $metric, 'area' => $area, 'dir' => $dir,
        'threshold' => $threshold, 'last' => karp_vaktir_state($cur, $dir, $threshold), 'created' => time());
    array_unshift($list, $w);
    update_user_meta($uid, 'karp_vaktir', array_slice($list, 0, 30));
    $w['now'] = $cur;
    return array('ok' => true, 'vakt' => $w);
}
function karp_vaktir_delete($req) {
    $uid = get_current_user_id();
    if (!$uid) { return new WP_Error('karp_noauth', 'Ekki innskráð(ur).', array('status' => 401)); }
    $p = $req->get_json_params();
    $id = isset($p['id']) ? sanitize_text_field($p['id']) : '';
    $list = array_values(array_filter(karp_vaktir_list($uid), function ($w) use ($id) { return $w['id'] !== $id; }));
    update_user_meta($uid, 'karp_vaktir', $list);
    return array('ok' => true);
}
// --- Cron: meta vaktir daglega og senda póst við breytingu ---------------
add_action('karp_vaktir_check', 'karp_vaktir_run');
add_action('init', function () {
    if (!wp_next_scheduled('karp_vaktir_check')) {
        wp_schedule_event(time() + 300, 'daily', 'karp_vaktir_check');
    }
});
function karp_vaktir_run() {
    $metrics = karp_vaktir_metrics();
    $users = get_users(array('meta_key' => 'karp_vaktir', 'fields' => array('ID', 'user_email', 'display_name')));
    foreach ($users as $u) {
        $list = karp_vaktir_list($u->ID);
        if (!$list) { continue; }
        $changed = false; $hits = array();
        foreach ($list as &$w) {
            $cur = karp_vaktir_value($w['metric'], isset($w['area']) ? $w['area'] : '');
            if ($cur === null) { continue; }
            $now = karp_vaktir_state($cur, $w['dir'], $w['threshold']);
            $prev = isset($w['last']) ? (int) $w['last'] : 0;
            if ($now !== $prev) { $w['last'] = $now; $changed = true; if ($now) { $hits[] = array('w' => $w, 'cur' => $cur); } }
        }
        unset($w);
        if ($changed) { update_user_meta($u->ID, 'karp_vaktir', $list); }
        if ($hits && $u->user_email) { karp_vaktir_email($u, $hits, $metrics); }
    }
}
function karp_vaktir_email($u, $hits, $metrics) {
    $rows = '';
    foreach ($hits as $h) {
        $w = $h['w']; $m = $metrics[$w['metric']];
        $label = esc_html($m['label'] . ($w['area'] ? ' — ' . $w['area'] : ''));
        $cond = ($w['dir'] === 'yfir' ? 'yfir' : 'undir') . ' ' . karp_vaktir_num($w['threshold'], $m['dec']) . esc_html($m['unit']);
        $rows .= '<tr><td style="padding:13px 16px;border-bottom:1px solid #1d2733;color:#cdd6e6;font-size:15px">' . $label
            . '<br><span style="color:#8a93a8;font-size:13px">viðmið: ' . $cond . '</span></td>'
            . '<td style="padding:13px 16px;border-bottom:1px solid #1d2733;text-align:right;color:#2ee6c8;font-weight:800;font-size:20px;white-space:nowrap">'
            . karp_vaktir_num($h['cur'], $m['dec']) . esc_html($m['unit']) . '</td></tr>';
    }
    $url = 'https://karp.is/mitt-svaedi/'; // LEIÐ A: appið er aðalvefurinn
    $n = count($hits);
    $h1 = $n === 1 ? 'Vakt náði marki' : ($n . ' vaktir náðu marki');
    $html = '<div style="background:#0a0e14;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
        . '<div style="max-width:520px;margin:0 auto;background:#0e1420;border:1px solid #1d2733;border-radius:16px;overflow:hidden">'
        . '<div style="padding:22px 24px 6px"><div style="color:#19d3c5;font-weight:800;font-size:13px;letter-spacing:1px">🔔 KARP-VAKT</div>'
        . '<div style="color:#eaf1fb;font-size:21px;font-weight:800;margin-top:6px">' . esc_html($h1) . '</div>'
        . '<div style="color:#8a93a8;font-size:14px;margin-top:4px">Hagvísir sem þú vaktar fór yfir viðmiðið þitt.</div></div>'
        . '<table style="width:100%;border-collapse:collapse;margin-top:14px">' . $rows . '</table>'
        . '<div style="padding:20px 24px 24px"><a href="' . esc_url($url) . '" style="display:inline-block;background:#19d3c5;color:#06121a;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Skoða á mælaborðinu →</a>'
        . '<div style="color:#5c6678;font-size:12px;margin-top:18px;line-height:1.5">Þú færð þennan póst því þú stofnaðir vakt á karp.is. Þú getur eytt vöktum hvenær sem er undir „Vaktir" á mælaborðinu.</div></div>'
        . '</div></div>';
    $subject = $n === 1
        ? 'Karp-vakt: ' . $metrics[$hits[0]['w']['metric']]['label'] . ($hits[0]['w']['area'] ? ' — ' . $hits[0]['w']['area'] : '')
        : 'Karp-vaktir: ' . $n . ' viðmið náðu marki';
    $ctype = function () { return 'text/html; charset=UTF-8'; };
    add_filter('wp_mail_content_type', $ctype);
    wp_mail($u->user_email, $subject, $html);
    remove_filter('wp_mail_content_type', $ctype);
}
