<?php
/**
 * Karp — native auðkenningarsíður (LEIÐ A).
 * --------------------------------------------------------------------------
 * Karp-síðurnar /innskra/, /nyskraning/ og /endurstilla/ (Astro á karp.is) POST-a
 * beint (top-level form) á wp-login.php á wp.karp.is. Þetta snippet lætur VILLUR og
 * ÁRANGUR skila sér AFTUR á Karp-síðurnar (í stað óstílaðrar wp-login.php) og skráir
 * skilmála-samþykki þegar notandi skráir sig gegnum Karp-nýskráningarformið.
 *
 * Uppsetning: WPCode → Add Snippet → PHP Snippet → límdu innihaldið (SLEPPTU fyrstu
 *   <?php línunni — WPCode bætir henni við) → Active · Auto Insert · Run Everywhere · Save.
 *
 * ÖRYGGI: allar endurvísanir gerast AÐEINS þegar falinn reitur `karp_auth=1` er í POST
 *   (Karp-formin senda hann) svo venjuleg wp-admin-/UM-innskráning raskist EKKI. Notar
 *   wp_safe_redirect → aðeins hvítlistaðir hýslar (karp-user.php: allowed_redirect_hosts
 *   leyfir karp.is / www.karp.is).
 *
 * ⚠ FORSENDA fyrir nýskráningu: WP → Settings → General → „Anyone can register" = á,
 *   og „New User Default Role" = Subscriber. Ef Ultimate Member vísar wp-login.php?action=
 *   register á UM-síðuna þarf að slökkva á þeirri UM-endurvísun (annars grípur UM formið).
 *
 * Systkina-snippet: karp-terms-consent.php sér um skilmálana á UM-leiðinni; hér er sama
 * gert fyrir wp-login-leiðina, með SAMA meta-lykli (karp_terms_accepted).
 */
if (!defined('ABSPATH')) { exit; }

if (!defined('KARP_LOGIN_URL'))    { define('KARP_LOGIN_URL',    'https://karp.is/innskra/'); }
if (!defined('KARP_REGISTER_URL')) { define('KARP_REGISTER_URL', 'https://karp.is/nyskraning/'); }
if (!defined('KARP_RESET_URL'))    { define('KARP_RESET_URL',    'https://karp.is/endurstilla/'); }

/** Kemur þetta POST frá Karp-auðkenningarformi? (falinn reitur karp_auth=1). */
if (!function_exists('karp_auth_is_ours')) {
    function karp_auth_is_ours() {
        return isset($_POST['karp_auth']) && $_POST['karp_auth'] === '1';
    }
}

/** Örugg endurvísun aftur á Karp-síðu með query-args (wp_safe_redirect + exit). */
if (!function_exists('karp_auth_bounce')) {
    function karp_auth_bounce($base, $args) {
        wp_safe_redirect(add_query_arg($args, $base));
        exit;
    }
}

/* ── INNSKRÁNING ─────────────────────────────────────────────────────────── */

// (a) Árangur: þvinga OKKAR redirect_to (verst gegn því að UM/annað yfirskrifi hann).
//     Forgangur 99 svo þetta keyri EFTIR aðra login_redirect-hooka. Aðeins Karp-innskr.
add_filter('login_redirect', function ($redirect_to, $requested, $user) {
    if (!karp_auth_is_ours() || is_wp_error($user)) { return $redirect_to; }
    $req = isset($_REQUEST['redirect_to']) ? $_REQUEST['redirect_to'] : '';
    return $req ? $req : 'https://karp.is/mitt-svaedi/';
}, 99, 3);

// (b) Villa: í stað þess að wp-login.php endurteikni óstílað → aftur á /innskra/?villa=
add_action('wp_login_failed', function ($username, $error = null) {
    if (!karp_auth_is_ours()) { return; }
    $code = 'failed';
    if (is_wp_error($error)) {
        $codes = $error->get_error_codes();
        if (!empty($codes)) { $code = $codes[0]; }
    }
    $args = array('villa' => $code, 'log' => rawurlencode(wp_unslash((string) $username)));
    if (!empty($_POST['redirect_to'])) {
        $args['redirect_to'] = rawurlencode(wp_unslash((string) $_POST['redirect_to']));
    }
    karp_auth_bounce(KARP_LOGIN_URL, $args);
}, 10, 2);

/* ── NÝSKRÁNING (wp-login.php?action=register) ───────────────────────────── */

// (a) Skilmála-skylda + villu-vísun. registration_errors keyrir í register_new_user()
//     ÁÐUR en notandi verður til. Forgangur 99 svo villur annarra viðbóta séu teknar með.
add_filter('registration_errors', function ($errors, $sanitized_user_login, $user_email) {
    if (!karp_auth_is_ours()) { return $errors; }
    if (empty($_POST['karp_terms'])) {
        $errors->add('karp_terms', 'Þú þarft að samþykkja skilmálana.');
    }
    if (is_wp_error($errors) && $errors->has_errors()) {
        $codes = $errors->get_error_codes();
        karp_auth_bounce(KARP_REGISTER_URL, array(
            'villa' => $codes[0],
            'log'   => rawurlencode(wp_unslash((string) $sanitized_user_login)),
            'email' => rawurlencode(wp_unslash((string) $user_email)),
        ));
    }
    return $errors;
}, 99, 3);

// (b) Skrá samþykki (heimild) + merkja netfang ÓSTAÐFEST þegar Karp-notandi verður til.
add_action('user_register', function ($user_id) {
    if (!karp_auth_is_ours()) { return; }
    if (!empty($_POST['karp_terms'])) {
        update_user_meta($user_id, 'karp_terms_accepted', current_time('mysql'));   // sami meta-lykill og UM-leiðin
    }
    update_user_meta($user_id, 'karp_email_activated', '0');   // NETFANGS-STAÐFESTING: óvirkur þar til hlekkur smelltur
});

/* ── NETFANGS-STAÐFESTING (activation link) ──────────────────────────────── */
// Nýskráður Karp-notandi er ÓVIRKUR þar til hann smellir á hlekkinn í „stilltu lykilorð"-póstinum
// sem WP sendir sjálfkrafa við nýskráningu (= sannar eignarhald á netfanginu) og velur lykilorð.
// Enginn auka-póstur. Innskráning er BLOKKUÐ þar til. Gleymdur hlekkur → /endurstilla/ sendir nýjan.

// (c) Blokka innskráningu óstaðfestra. Forgangur 30 → EFTIR lykilorðs-athugun WP-kjarna (20),
//     svo „rangt lykilorð" komi á undan. Aðeins EXPLICIT '0' blokkar → eldri notendur (vantandi
//     meta = '') og admin haldast ÓSNERTIR (engin læsing á núverandi aðgöngum). Gildir alls staðar.
add_filter('authenticate', function ($user, $username, $password) {
    if (is_wp_error($user) || !($user instanceof WP_User)) { return $user; }
    if (get_user_meta($user->ID, 'karp_email_activated', true) === '0') {
        return new WP_Error('karp_unactivated', 'Þú átt eftir að staðfesta netfangið þitt — smelltu á hlekkinn í póstinum sem við sendum (eða endurstilltu lykilorðið til að fá nýjan hlekk).');
    }
    return $user;
}, 30, 3);

// (d) Virkja við fyrstu lykilorðs-setningu (hlekkurinn úr staðfestingar-/nýskráningar-póstinum)
//     + SJÁLFVIRK INNSKRÁNING og fara á NATIVE Mitt svæði (í stað óstílaðrar wp-login-staðfestingar
//     eða gömlu wp.karp.is-forsíðunnar). Forgangur 1 → keyrir á undan UM-endurvísun (exit vinnur).
add_action('after_password_reset', function ($user) {
    if (!($user instanceof WP_User)) { return; }
    update_user_meta($user->ID, 'karp_email_activated', '1');   // netfang staðfest → aðgangur virkur
    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);
    wp_safe_redirect('https://karp.is/mitt-svaedi/');
    exit;
}, 1);

/* ── EIGIN NÝSKRÁNINGAR-HANDLER (admin-post → FRAMHJÁ Ultimate Member) ────── */
// /nyskraning/ POST-ar á admin-post.php?action=karp_register (EKKI wp-login.php) svo UM grípi EKKI
// nýskráninguna og hendi notandanum á sína eigin síðu. Handlerinn kallar register_new_user() = SAMA
// kjarna-flæði og wp-login.php?action=register, svo ALLIR hookar að ofan keyra óbreyttir:
//   registration_errors → skilmála-skylda + villu-bounce; user_register → terms + email_activated=0.
// Á villu bounce-ar registration_errors-hookinn + exit; hér meðhöndlum við aðeins ÁRANGUR (+ varnagla).
// ⚠ Krefst „Anyone can register"=á (register_new_user gátar users_can_register). Enginn nonce —
//   sama og opinber wp-login-nýskráning (opið signup þegar users_can_register er á).
function karp_register_handler() {
    if (!karp_auth_is_ours()) { karp_auth_bounce(KARP_REGISTER_URL, array('villa' => 'failed')); }
    if (is_user_logged_in()) { wp_safe_redirect('https://karp.is/mitt-svaedi/'); exit; }
    $login = isset($_POST['user_login']) ? wp_unslash((string) $_POST['user_login']) : '';
    $email = isset($_POST['user_email']) ? wp_unslash((string) $_POST['user_email']) : '';
    $result = register_new_user($login, $email);   // kjarna-flæði; OKKAR registration_errors-hook bounce-ar á villu
    if (is_wp_error($result)) {   // varnagli (ef hook fjarlægður): bounce með fyrsta villukóða
        $codes = $result->get_error_codes();
        karp_auth_bounce(KARP_REGISTER_URL, array(
            'villa' => !empty($codes) ? $codes[0] : 'failed',
            'log'   => rawurlencode($login),
            'email' => rawurlencode($email),
        ));
    }
    karp_auth_bounce(KARP_REGISTER_URL, array('skrad' => '1'));   // árangur → „athugaðu póstinn"
}
add_action('admin_post_nopriv_karp_register', 'karp_register_handler');
add_action('admin_post_karp_register', 'karp_register_handler');

/* ── GLEYMT LYKILORÐ (wp-login.php?action=lostpassword) ──────────────────── */

// Villa (tómt eða óþekkt netfang) → aftur á /endurstilla/?villa=. Árangur notar
// redirect_to formsins (?sent=1). ATH: „óþekkt notandanafn sem er EKKI netfang"
// (invalidcombo) bætist við EFTIR þetta filter í WP-kjarna → sá sjaldgæfi jaðar lendir
// enn á wp-login.php; netfangs-tilvikin (empty_username/invalid_email) grípast hér.
add_filter('lostpassword_errors', function ($errors, $user_data) {
    if (karp_auth_is_ours() && is_wp_error($errors) && $errors->has_errors()) {
        $codes = $errors->get_error_codes();
        karp_auth_bounce(KARP_RESET_URL, array('villa' => $codes[0]));
    }
    return $errors;
}, 10, 2);

/* ── KARP-ÚTLIT Á wp-login.php SÍÐUM (rp/resetpass o.fl.) ─────────────────── */
// „Stilltu lykilorð"-hlekkurinn úr póstinum opnast á wp-login.php?action=rp — hér er hann
// Karp-stílaður (dökkt + gyllt + KARP-orðmerki sem hlekkur á karp.is) svo hann sé ekki í hráu
// WP-útliti. Gildir á ÖLLUM wp-login-skjám (skaðlaust; wp-admin innskráning fær sömu vörumerki).
add_filter('login_headerurl', function () { return 'https://karp.is/'; });
add_filter('login_headertext', function () { return 'KARP'; });
add_action('login_enqueue_scripts', function () {
    // ÖRUGG stílun: dökkur bakgrunnur + gyllt merki/hnappur, en HVÍT kort með SJÁLFGEFNUM (dökkum)
    // texta látin óbreytt → aldrei hvítt-á-hvítt (WP/plugin þröngvar hvítum kortum; ekki barist gegn því).
    echo '<style>
      body.login{background:#0b111e}
      #login{padding-top:6%}
      .login h1 a{background:none!important;width:auto!important;height:auto!important;text-indent:0!important;overflow:visible!important;
        font:800 34px/1 system-ui,"Segoe UI",Arial,sans-serif!important;color:#f6b13b!important;letter-spacing:.20em!important;padding-left:.20em}
      .wp-core-ui .button-primary{background:#f6b13b!important;border-color:#e59e2b!important;color:#0b111e!important;
        text-shadow:none!important;box-shadow:none!important;border-radius:8px!important;font-weight:700!important}
      .login input:focus{border-color:#f6b13b!important;box-shadow:0 0 0 2px rgba(246,177,59,.3)!important}
      .login #nav a,.login #backtoblog a{color:#9fb0c8!important}
      .login #nav a:hover,.login #backtoblog a:hover,.login h1 a:hover{color:#f6b13b!important}
    </style>';
});
