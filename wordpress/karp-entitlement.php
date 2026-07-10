<?php
/**
 * karp-entitlement.php — Áskriftar-aðgangsstýring (NÝ WPCode-snippet).
 * ---------------------------------------------------------------------------
 * Bætir við karp-user.php (sem geymir karp_tier/karp_reports/karp_follows):
 *   1) Virkt þrep (effective tier) — eigin þrep EÐA erft frá teymis-eiganda (seats).
 *   2) Skýrslu-kvóti (5/20 á mán) — teljari sem núllstillist mánaðarlega.
 *   3) Viðskiptamannavakt (kt-listi) — cap eftir þrepi.
 *   4) Seats/teymi — eigandi bætir við netföngum meðlima (cap eftir þrepi).
 *   5) Server-hlið hlið-hjálpari fyrir Fjölmiðlavakt o.fl.
 *
 * UPPSETNING: (a) límdu þennan snippet í WPCode (PHP, "Run everywhere").
 *             (b) í karp-user.php: bættu `karp_entitlement_augment($data, $u->ID);`
 *                 rétt á undan `return $data;` í /me-handler, og kalli á
 *                 `karp_follows_enforce_limit()` í karp_follows_post (sjá comment neðst).
 *
 * MÖRK speglast við web/src/data/lausnir.js (LIMITS). -1 = ótakmarkað.
 */
if (!defined('ABSPATH')) exit;

function karp_tier_limits($tier, $is_admin = false) {
    if ($is_admin) return array('reportsMonth' => -1, 'follows' => -1, 'ktWatch' => -1, 'seats' => -1, 'fjolmidlavakt' => true);
    $L = array(
        'grunnur'         => array('reportsMonth' => 0,  'follows' => 10, 'ktWatch' => 0,   'seats' => 2,  'fjolmidlavakt' => false),
        'fyrirtaeki'      => array('reportsMonth' => 5,  'follows' => 50, 'ktWatch' => 25,  'seats' => 5,  'fjolmidlavakt' => true),
        'fyrirtaeki_plus' => array('reportsMonth' => 20, 'follows' => -1, 'ktWatch' => 100, 'seats' => 15, 'fjolmidlavakt' => true),
    );
    return isset($L[$tier]) ? $L[$tier] : array('reportsMonth' => 0, 'follows' => 3, 'ktWatch' => 0, 'seats' => 1, 'fjolmidlavakt' => false);
}
function karp_tier_rank($tier) { $r = array('grunnur' => 1, 'fyrirtaeki' => 2, 'fyrirtaeki_plus' => 3); return isset($r[$tier]) ? $r[$tier] : 0; }

/** Eigin virkt þrep notandans (karp_tier ef ekki útrunnið). */
function karp_own_tier($uid) {
    $until = (int) get_user_meta($uid, 'karp_tier_until', true);
    return ($until > time()) ? (string) get_user_meta($uid, 'karp_tier', true) : '';
}

/**
 * VIRKT ÞREP (effective) = hærra af eigin þrepi og erfðu þrepi frá teymis-eiganda.
 * Seats-líkan: eigandi geymir karp_team_members = fylki netfanga. Meðlimur erfir þrep eiganda.
 */
function karp_effective_tier($uid) {
    if (user_can($uid, 'manage_options')) return 'fyrirtaeki_plus';   // admin = hæst (rank-lega)
    $own = karp_own_tier($uid);
    $best = $own; $bestRank = karp_tier_rank($own);
    $user = get_userdata($uid);
    if ($user && $user->user_email) {
        $email = strtolower($user->user_email);
        // Finna eigendur sem hafa BÆTT þessu netfangi í teymið sitt (og hafa virkt þrep).
        $owners = get_users(array(
            'meta_key' => 'karp_team_members',
            'meta_compare' => 'EXISTS',
            'fields' => array('ID'),
            'number' => 50,
        ));
        foreach ($owners as $o) {
            $members = (array) ( get_user_meta($o->ID, 'karp_team_members', true) ?: array() );
            if (!in_array($email, array_map('strtolower', $members), true)) continue;
            $ot = karp_own_tier($o->ID);
            if (karp_tier_rank($ot) > $bestRank) { $best = $ot; $bestRank = karp_tier_rank($ot); }
        }
    }
    return $best;
}

/** Skýrslur notaðar í yfirstandandi mánuði (núllstillist við mánaðamót). */
function karp_reports_used_this_month($uid) {
    $month = gmdate('Y-m');
    if ((string) get_user_meta($uid, 'karp_reports_month', true) !== $month) return 0;
    return (int) get_user_meta($uid, 'karp_reports_used', true);
}

/** Bætir entitlement-reitum við /me-farminn (kallað úr karp-user.php rétt fyrir return). */
function karp_entitlement_augment(&$data, $uid) {
    $is_admin = user_can($uid, 'manage_options');
    $eff = karp_effective_tier($uid);
    $lim = karp_tier_limits($eff, $is_admin);
    $used = karp_reports_used_this_month($uid);
    $data['effectiveTier'] = $eff ?: null;                 // virkt þrep (eigin eða erft)
    $data['limits'] = $lim;                                // mörk þessa þreps
    $data['reportsUsed'] = $used;
    $data['reportsRemaining'] = ($lim['reportsMonth'] < 0) ? -1 : max(0, $lim['reportsMonth'] - $used);
    $data['ktWatch'] = array_values((array) ( get_user_meta($uid, 'karp_kt_watch', true) ?: array() ));
    $data['teamMembers'] = array_values((array) ( get_user_meta($uid, 'karp_team_members', true) ?: array() ));
    // Fjöldi co:-fylgja (fyrir client-UX "10/50 notuð").
    $fl = (array) ( get_user_meta($uid, 'karp_follows', true) ?: array() );
    $data['followsCount'] = count(array_filter($fl, function ($k) { return strpos((string) $k, 'co:') === 0; }));
}

// ── Nýir endapunktar ────────────────────────────────────────────────────────
add_action('rest_api_init', function () {
    $auth = function () { return is_user_logged_in(); };

    // POST /reports/open {key,title} — kvóta-athugun: á/kvóti → grant · annars needPay.
    register_rest_route('karp/v1', '/reports/open', array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => 'karp_reports_open'));

    // Viðskiptamannavakt (kt-listi). GET → listi. POST {kt,action:add|remove}.
    register_rest_route('karp/v1', '/ktwatch', array(
        array('methods' => 'GET',  'permission_callback' => $auth, 'callback' => 'karp_ktwatch_get'),
        array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => 'karp_ktwatch_post'),
    ));

    // Seats/teymi. GET → meðlimir + cap. POST {email,action:add|remove}.
    register_rest_route('karp/v1', '/team', array(
        array('methods' => 'GET',  'permission_callback' => $auth, 'callback' => 'karp_team_get'),
        array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => 'karp_team_post'),
    ));
});

function karp_reports_open($req) {
    $uid = get_current_user_id();
    $key = sanitize_text_field((string) $req->get_param('key'));
    $title = sanitize_text_field((string) $req->get_param('title'));
    if ($key === '') return new WP_REST_Response(array('ok' => false, 'error' => 'nokey'), 400);
    $rep = (array) ( get_user_meta($uid, 'karp_reports', true) ?: array() );
    foreach ($rep as $r) { if ((is_array($r) ? ($r['key'] ?? '') : $r) === $key) return array('ok' => true, 'owned' => true); }
    $is_admin = user_can($uid, 'manage_options');
    $lim = karp_tier_limits(karp_effective_tier($uid), $is_admin);
    $used = karp_reports_used_this_month($uid);
    if ($lim['reportsMonth'] >= 0 && $used >= $lim['reportsMonth']) {
        return array('ok' => false, 'needPay' => true, 'remaining' => 0, 'price' => 990);
    }
    // Grant: bæta í reports + hækka mánaðar-teljara (nema ótakmarkað).
    $rep[] = array('key' => $key, 'title' => $title ?: $key, 'ts' => time(), 'via' => 'kvoti');
    update_user_meta($uid, 'karp_reports', $rep);
    if ($lim['reportsMonth'] >= 0) {
        if ((string) get_user_meta($uid, 'karp_reports_month', true) !== gmdate('Y-m')) { update_user_meta($uid, 'karp_reports_month', gmdate('Y-m')); $used = 0; }
        update_user_meta($uid, 'karp_reports_used', $used + 1);
    }
    return array('ok' => true, 'granted' => true, 'remaining' => ($lim['reportsMonth'] < 0 ? -1 : max(0, $lim['reportsMonth'] - $used - 1)));
}

function karp_ktwatch_get() {
    $uid = get_current_user_id();
    $lim = karp_tier_limits(karp_effective_tier($uid), user_can($uid, 'manage_options'));
    return array('kt' => array_values((array) ( get_user_meta($uid, 'karp_kt_watch', true) ?: array() )), 'cap' => $lim['ktWatch']);
}
function karp_ktwatch_post($req) {
    $uid = get_current_user_id();
    $kt = preg_replace('/\D/', '', (string) $req->get_param('kt'));
    $action = (string) $req->get_param('action');
    if (strlen($kt) !== 10) return new WP_REST_Response(array('ok' => false, 'error' => 'kt'), 400);
    $lim = karp_tier_limits(karp_effective_tier($uid), user_can($uid, 'manage_options'));
    if ($lim['ktWatch'] === 0) return array('ok' => false, 'error' => 'tier', 'needTier' => 'fyrirtaeki');
    $list = array_values((array) ( get_user_meta($uid, 'karp_kt_watch', true) ?: array() ));
    if ($action === 'remove') { $list = array_values(array_diff($list, array($kt))); }
    else {
        if (in_array($kt, $list, true)) return array('ok' => true, 'kt' => $list);
        if ($lim['ktWatch'] >= 0 && count($list) >= $lim['ktWatch']) return array('ok' => false, 'error' => 'cap', 'cap' => $lim['ktWatch']);
        $list[] = $kt;
    }
    update_user_meta($uid, 'karp_kt_watch', $list);
    return array('ok' => true, 'kt' => $list);
}

function karp_team_get() {
    $uid = get_current_user_id();
    $lim = karp_tier_limits(karp_effective_tier($uid), user_can($uid, 'manage_options'));
    $members = array_values((array) ( get_user_meta($uid, 'karp_team_members', true) ?: array() ));
    return array('members' => $members, 'cap' => ($lim['seats'] < 0 ? -1 : max(0, $lim['seats'] - 1)));   // -1 vegna eiganda-sætis
}
function karp_team_post($req) {
    $uid = get_current_user_id();
    $email = strtolower(sanitize_email((string) $req->get_param('email')));
    $action = (string) $req->get_param('action');
    if (!is_email($email)) return new WP_REST_Response(array('ok' => false, 'error' => 'email'), 400);
    $lim = karp_tier_limits(karp_own_tier($uid), user_can($uid, 'manage_options'));   // aðeins eigin þrep má bjóða seats
    $cap = ($lim['seats'] < 0) ? -1 : max(0, $lim['seats'] - 1);
    if ($cap === 0) return array('ok' => false, 'error' => 'tier');
    $list = array_map('strtolower', array_values((array) ( get_user_meta($uid, 'karp_team_members', true) ?: array() )));
    if ($action === 'remove') { $list = array_values(array_diff($list, array($email))); }
    else {
        if (in_array($email, $list, true)) return array('ok' => true, 'members' => $list);
        if ($cap >= 0 && count($list) >= $cap) return array('ok' => false, 'error' => 'cap', 'cap' => $cap);
        $list[] = $email;
    }
    update_user_meta($uid, 'karp_team_members', $list);
    return array('ok' => true, 'members' => array_values($list));
}

/** Server-hlið: má notandi (uid) skoða Fjölmiðlavakt? (þrep>=2 EÐA paywall slökkt). Kallað úr karp-frettir.php. */
function karp_can_fjolmidlavakt($uid = 0) {
    if (get_option('karp_paywall') !== '1') return true;                 // frítt í bili
    $uid = $uid ?: get_current_user_id();
    if (!$uid) return false;
    return karp_tier_limits(karp_effective_tier($uid), user_can($uid, 'manage_options'))['fjolmidlavakt'] === true;
}

/**
 * FYLGJA-MÖRK — kallaðu þessa í karp_follows_post (karp-user.php) ÁÐUR en þú vistar
 * nýja lista, til að þvinga co:-fjölda eftir þrepi. Skilar true ef leyfilegt:
 *
 *   if (!karp_follows_enforce_limit($uid, $next)) return new WP_REST_Response(
 *       array('ok'=>false,'error'=>'cap'), 200);
 */
function karp_follows_enforce_limit($uid, $next_list) {
    if (get_option('karp_paywall') !== '1') return true;                 // frítt í bili
    $lim = karp_tier_limits(karp_effective_tier($uid), user_can($uid, 'manage_options'));
    if ($lim['follows'] < 0) return true;
    $co = count(array_filter((array) $next_list, function ($k) { return strpos((string) $k, 'co:') === 0; }));
    return $co <= $lim['follows'];
}
