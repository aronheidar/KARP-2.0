// karp-entitlement.php - Askriftar-adgangsstyring (WPCode PHP snippet).
// -----------------------------------------------------------------------------
// WPCODE: Ekki hafa <?php taggid med - WPCode keyrir kodann i PHP-samhengi nu thegar.
// Baetir vid karp-user.php (sem geymir karp_tier / karp_reports / karp_follows):
//   1) Virkt threp (effective tier) - eigin threp EDA erft fra teymis-eiganda (seats).
//   2) Skyrslu-kvoti (5/20 a man) - teljari sem nullstillist manadarlega.
//   3) Vidskiptamannavakt (kt-listi) - cap eftir threpi.
//   4) Seats/teymi - eigandi baetir vid netfongum medlima (cap eftir threpi).
//   5) Server-hlid hjalpari fyrir Fjolmidlavakt o.fl.
//
// UPPSETNING: (a) limdu thennan snippet i WPCode (PHP, "Run everywhere").
//             (b) i karp-user.php: baettu karp_entitlement_augment($data, $u->ID);
//                 rett a undan return $data; i /me-handler, og kalli a
//                 karp_follows_enforce_limit() i karp_follows_post (sja comment nedst).
//
// MORK speglast vid web/src/data/lausnir.js (LIMITS). -1 = otakmarkad.

if (!defined('ABSPATH')) exit;

function karp_tier_limits($tier, $is_admin = false) {
    if ($is_admin) return array('reportsMonth' => -1, 'follows' => -1, 'ktWatch' => -1, 'seats' => -1, 'fjolmidlavakt' => true);
    // VERDUR ad spegla LIMITS i web/src/data/lausnir.js NAKVAEMLEGA (verd-endurskipulag 11.7.2026):
    // reportsMonth 2/10/20, seats 1/5/10 - annars faer kaupandi minna en verdskrain lofar.
    $L = array(
        'grunnur'         => array('reportsMonth' => 2,  'follows' => 10, 'ktWatch' => 0,   'seats' => 1,  'fjolmidlavakt' => false),
        'fyrirtaeki'      => array('reportsMonth' => 10, 'follows' => 50, 'ktWatch' => 25,  'seats' => 5,  'fjolmidlavakt' => true),
        'fyrirtaeki_plus' => array('reportsMonth' => 20, 'follows' => -1, 'ktWatch' => 100, 'seats' => 10, 'fjolmidlavakt' => true),
    );
    return isset($L[$tier]) ? $L[$tier] : array('reportsMonth' => 0, 'follows' => 3, 'ktWatch' => 0, 'seats' => 1, 'fjolmidlavakt' => false);
}
function karp_tier_rank($tier) { $r = array('grunnur' => 1, 'fyrirtaeki' => 2, 'fyrirtaeki_plus' => 3); return isset($r[$tier]) ? $r[$tier] : 0; }

// Eigin virkt threp notandans (karp_tier ef ekki utrunnid).
function karp_own_tier($uid) {
    $until = (int) get_user_meta($uid, 'karp_tier_until', true);
    return ($until > time()) ? (string) get_user_meta($uid, 'karp_tier', true) : '';
}

// VIRKT THREP (effective) = haerra af eigin threpi og erfdu threpi fra teymis-eiganda.
// Seats-likan: eigandi geymir karp_team_members = fylki netfanga. Medlimur erfir threp eiganda.
function karp_effective_tier($uid) {
    if (user_can($uid, 'manage_options')) return 'fyrirtaeki_plus';   // admin = haest (rank-lega)
    $own = karp_own_tier($uid);
    $best = $own; $bestRank = karp_tier_rank($own);
    $user = get_userdata($uid);
    if ($user && $user->user_email) {
        $email = strtolower($user->user_email);
        // Finna eigendur sem hafa BAETT thessu netfangi i teymid sitt (og hafa virkt threp).
        $owners = get_users(array(
            'meta_key' => 'karp_team_members',
            'meta_compare' => 'EXISTS',
            'fields' => array('ID'),
            'number' => 200,
        ));
        foreach ($owners as $o) {
            $members = array_map('strtolower', (array) ( get_user_meta($o->ID, 'karp_team_members', true) ?: array() ));
            $ot = karp_own_tier($o->ID);
            if (!$ot) continue;
            // Adeins fyrstu (seats-1) netfongin gilda - nidurfaersla threps klippir umfram-saeti sjalfkrafa.
            $olim = karp_tier_limits($ot, false);
            $cap = ($olim['seats'] < 0) ? count($members) : max(0, $olim['seats'] - 1);
            $gild = array_slice($members, 0, $cap);
            if (!in_array($email, $gild, true)) continue;
            if (karp_tier_rank($ot) > $bestRank) { $best = $ot; $bestRank = karp_tier_rank($ot); }
        }
    }
    return $best;
}

// Skyrslur notadar i yfirstandandi manudi (nullstillist vid manadamot).
function karp_reports_used_this_month($uid) {
    $month = gmdate('Y-m');
    if ((string) get_user_meta($uid, 'karp_reports_month', true) !== $month) return 0;
    return (int) get_user_meta($uid, 'karp_reports_used', true);
}

// Fasteignamata-kvoti: 20/man fyrir 'fasteign'-askrifendur (admin otakmarkad -1, annars 0 = borgar per mat).
function karp_fasteign_quota($uid) {
    if (user_can($uid, 'manage_options')) return -1;
    $until = (int) get_user_meta($uid, 'karp_sub_fasteign_until', true);
    return ($until > time()) ? 20 : 0;
}
// Fasteignamot notud i yfirstandandi manudi (nullstillist vid manadamot).
function karp_fasteign_used_this_month($uid) {
    $month = gmdate('Y-m');
    if ((string) get_user_meta($uid, 'karp_fasteign_month', true) !== $month) return 0;
    return (int) get_user_meta($uid, 'karp_fasteign_used', true);
}
// Fyrsti dagur naesta manadar (unix) — hvenaer kvotinn nullstillist.
function karp_fasteign_reset_ts() {
    $y = (int) gmdate('Y'); $m = (int) gmdate('n') + 1;
    if ($m > 12) { $m = 1; $y++; }
    return gmmktime(0, 0, 0, $m, 1, $y);
}

// Baetir entitlement-reitum vid /me-farminn (kallad ur karp-user.php rett fyrir return).
function karp_entitlement_augment(&$data, $uid) {
    $is_admin = user_can($uid, 'manage_options');
    $eff = karp_effective_tier($uid);
    $lim = karp_tier_limits($eff, $is_admin);
    $used = karp_reports_used_this_month($uid);
    $data['effectiveTier'] = $eff ?: null;                 // virkt threp (eigin eda erft)
    $data['limits'] = $lim;                                // mork thessa threps
    $data['reportsUsed'] = $used;
    $data['reportsRemaining'] = ($lim['reportsMonth'] < 0) ? -1 : max(0, $lim['reportsMonth'] - $used);
    // Fasteignamata-kvoti (sér-askrift 'fasteign'): teljari vid Meta-takkann + 990-gatt vid 0.
    $fq = karp_fasteign_quota($uid);
    $fused = karp_fasteign_used_this_month($uid);
    $data['fasteignQuota'] = $fq;                            // 20 = askrifandi, -1 = admin/otakm., 0 = ekki askrifandi
    $data['fasteignUsed'] = $fused;
    $data['fasteignRemaining'] = ($fq < 0) ? -1 : max(0, $fq - $fused);
    $data['fasteignResets'] = karp_fasteign_reset_ts();
    $data['ktWatch'] = array_values((array) ( get_user_meta($uid, 'karp_kt_watch', true) ?: array() ));
    $data['teamMembers'] = array_values((array) ( get_user_meta($uid, 'karp_team_members', true) ?: array() ));
    // Fjoldi co:-fylgja (fyrir client-UX "10/50 notud").
    $fl = (array) ( get_user_meta($uid, 'karp_follows', true) ?: array() );
    $data['followsCount'] = count(array_filter($fl, function ($k) { return strpos((string) $k, 'co:') === 0; }));
}

// -- Nyir endapunktar --------------------------------------------------------
add_action('rest_api_init', function () {
    $auth = function () { return is_user_logged_in(); };

    // POST /reports/open {key,title} - kvota-athugun: a/kvoti -> grant, annars needPay.
    register_rest_route('karp/v1', '/reports/open', array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => 'karp_reports_open'));

    // POST /fasteign/meta {key} - fasteignamata-kvota: a/kvoti -> granted (eydir 1, endurmat sama heimilisfangs i man frítt),
    // annars needPay (990). Nullstillist vid manadamot. Adeins 'fasteign'-askrifendur (annars nosub -> client synir 990-gatt).
    register_rest_route('karp/v1', '/fasteign/meta', array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => 'karp_fasteign_meta'));

    // Vidskiptamannavakt (kt-listi). GET -> listi. POST {kt,action:add|remove}.
    register_rest_route('karp/v1', '/ktwatch', array(
        array('methods' => 'GET',  'permission_callback' => $auth, 'callback' => 'karp_ktwatch_get'),
        array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => 'karp_ktwatch_post'),
    ));

    // Seats/teymi. GET -> medlimir + cap. POST {email,action:add|remove}.
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
    // Grant: baeta i reports + haekka manadar-teljara (nema otakmarkad).
    $rep[] = array('key' => $key, 'title' => $title ?: $key, 'ts' => time(), 'via' => 'kvoti');
    update_user_meta($uid, 'karp_reports', $rep);
    if ($lim['reportsMonth'] >= 0) {
        if ((string) get_user_meta($uid, 'karp_reports_month', true) !== gmdate('Y-m')) { update_user_meta($uid, 'karp_reports_month', gmdate('Y-m')); $used = 0; }
        update_user_meta($uid, 'karp_reports_used', $used + 1);
    }
    return array('ok' => true, 'granted' => true, 'remaining' => ($lim['reportsMonth'] < 0 ? -1 : max(0, $lim['reportsMonth'] - $used - 1)));
}

function karp_fasteign_meta($req) {
    $uid = get_current_user_id();
    $key = sanitize_text_field((string) $req->get_param('key'));
    if ($key === '') return new WP_REST_Response(array('ok' => false, 'error' => 'nokey'), 400);
    $q = karp_fasteign_quota($uid);
    if ($q === 0) return array('ok' => false, 'error' => 'nosub');            // ekki askrifandi -> client synir 990-gatt
    if ($q < 0) return array('ok' => true, 'granted' => true, 'remaining' => -1);  // admin otakmarkad
    $month = gmdate('Y-m');
    $storedMonth = (string) get_user_meta($uid, 'karp_fasteign_month', true);
    $used = ($storedMonth === $month) ? (int) get_user_meta($uid, 'karp_fasteign_used', true) : 0;
    $keys = ($storedMonth === $month) ? (array) ( get_user_meta($uid, 'karp_fasteign_keys', true) ?: array() ) : array();
    if (in_array($key, $keys, true)) {                                        // thegar metid i manudinum -> fritt endurmat
        return array('ok' => true, 'granted' => true, 'owned' => true, 'remaining' => max(0, $q - $used));
    }
    if ($used >= $q) {                                                        // kvoti buinn -> 990-gatt eda bida manadamota
        return array('ok' => false, 'needPay' => true, 'remaining' => 0, 'price' => 990, 'resets' => karp_fasteign_reset_ts());
    }
    if ($storedMonth !== $month) { update_user_meta($uid, 'karp_fasteign_month', $month); }  // nyr manudur -> nullstilla
    $keys[] = $key;
    if (count($keys) > 300) $keys = array_slice($keys, -300);
    update_user_meta($uid, 'karp_fasteign_keys', $keys);
    update_user_meta($uid, 'karp_fasteign_used', $used + 1);
    return array('ok' => true, 'granted' => true, 'remaining' => max(0, $q - $used - 1));
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
    // cap midast vid EIGID threp (ekki erft) - erfdur medlimur a ekki ad sja "Baeta vid"-form sem hafnar alltaf.
    $lim = karp_tier_limits(karp_own_tier($uid), user_can($uid, 'manage_options'));
    $list = array_values((array) ( get_user_meta($uid, 'karp_team_members', true) ?: array() ));
    // Stada per medlim: hefur netfangid thegar Karp-adgang? (eigandinn ser hvort bodid "tok")
    $members = array();
    foreach ($list as $em) { $members[] = array('email' => $em, 'skrad' => (bool) get_user_by('email', $em)); }
    return array('members' => $members, 'cap' => ($lim['seats'] < 0 ? -1 : max(0, $lim['seats'] - 1)));   // -1 vegna eiganda-saetis
}
function karp_team_post($req) {
    $uid = get_current_user_id();
    $email = strtolower(sanitize_email((string) $req->get_param('email')));
    $action = (string) $req->get_param('action');
    if (!is_email($email)) return new WP_REST_Response(array('ok' => false, 'error' => 'email'), 400);
    $lim = karp_tier_limits(karp_own_tier($uid), user_can($uid, 'manage_options'));   // adeins eigin threp ma bjoda seats
    $cap = ($lim['seats'] < 0) ? -1 : max(0, $lim['seats'] - 1);
    $list = array_map('strtolower', array_values((array) ( get_user_meta($uid, 'karp_team_members', true) ?: array() )));
    if ($action === 'remove') {
        // remove er ALLTAF leyft (lika med utrunnid threp - annars situr gamli listinn fastur)
        $list = array_values(array_diff($list, array($email)));
    } else {
        if ($cap === 0) return array('ok' => false, 'error' => 'tier');
        if (in_array($email, $list, true)) return array('ok' => true, 'members' => $list);
        if ($cap >= 0 && count($list) >= $cap) return array('ok' => false, 'error' => 'cap', 'cap' => $cap);
        $list[] = $email;
        // Bodspostur: annars veit vidkomandi ekki af adganginum og eigandinn heldur ad allt se klart.
        $owner = get_userdata($uid);
        $frax = $owner ? $owner->display_name : 'samstarfsadili thinn';
        wp_mail($email, 'Ther hefur verid bodinn adgangur ad Karp',
            "Saell/sael!\n\n" . $frax . " baetti netfanginu thinu vid Karp-askriftina sina (karp.is).\n\n"
            . "Til ad virkja adganginn skradu thig inn - eda stofnadu okeypis adgang - med THESSU netfangi:\n"
            . "https://karp.is/nyskraning/\n\n"
            . "Adgangurinn virkjast sjalfkrafa vid innskraningu.\n\nKvedja,\nKarp - karp.is");
    }
    update_user_meta($uid, 'karp_team_members', $list);
    return array('ok' => true, 'members' => array_values($list));
}

// Server-hlid: ma notandi (uid) skoda Fjolmidlavakt? (threp>=2 EDA paywall slokkt). Kallad ur karp-frettir.php.
function karp_can_fjolmidlavakt($uid = 0) {
    if (get_option('karp_paywall') !== '1') return true;                 // fritt i bili
    $uid = $uid ?: get_current_user_id();
    if (!$uid) return false;
    return karp_tier_limits(karp_effective_tier($uid), user_can($uid, 'manage_options'))['fjolmidlavakt'] === true;
}

// FYLGJA-MORK - kalladu thessa i karp_follows_post (karp-user.php) ADUR en thu vistar
// nyja lista, til ad thvinga co:-fjolda eftir threpi. Skilar true ef leyfilegt:
//   if (!karp_follows_enforce_limit($uid, $next)) return new WP_REST_Response(
//       array('ok'=>false,'error'=>'cap'), 200);
function karp_follows_enforce_limit($uid, $next_list) {
    if (get_option('karp_paywall') !== '1') return true;                 // fritt i bili
    $lim = karp_tier_limits(karp_effective_tier($uid), user_can($uid, 'manage_options'));
    if ($lim['follows'] < 0) return true;
    $co = count(array_filter((array) $next_list, function ($k) { return strpos((string) $k, 'co:') === 0; }));
    return $co <= $lim['follows'];
}
