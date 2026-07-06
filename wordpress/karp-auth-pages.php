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

// (b) Skrá samþykki (heimild) þegar Karp-notandi verður til — sami meta-lykill og UM-leiðin.
add_action('user_register', function ($user_id) {
    if (karp_auth_is_ours() && !empty($_POST['karp_terms'])) {
        update_user_meta($user_id, 'karp_terms_accepted', current_time('mysql'));
    }
});

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
