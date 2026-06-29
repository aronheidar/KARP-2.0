<?php
/**
 * Karp — samþykki skilmála við nýskráningu (Ultimate Member).
 * Bætir SKYLDU-gátreit neðst í nýskráningarformið sem tengir á skilmála-/persónuverndarsíðuna,
 * stöðvar skráningu ef óhakað, og vistar tímastimpil samþykkis á notandann (heimild fyrir samþykki).
 *
 * Uppsetning: WPCode → Add Snippet → PHP Snippet → límdu innihaldið (SLEPPTU fyrstu <?php línunni) →
 *   Active · Auto Insert · Run Everywhere · Save.  Þarf Ultimate Member.
 *
 * Slóð á skilmála: síðan er á /skilmalar-personuvernd/ (id 5651). /skilmalar/ vísar þangað líka.
 * Breyttu KARP_TERMS_URL ef þú endurnefnir slóðina.
 *
 * ATH: krefst þess að skilmála-síðan sé til (búin til 2026-06-27). Ef hook-arnir virka ekki
 * á þinni UM-útgáfu er stuðningshæfa leiðin: Ultimate Member → Forms → Register → bæta við
 * „Checkbox“-reit (skyldu) með sama texta — þá þarf þetta snippet ekki.
 */
if (!defined('KARP_TERMS_URL')) {
    define('KARP_TERMS_URL', '/skilmalar-personuvernd/');
}

// 1) Birta gátreitinn neðst í NÝSKRÁNINGAR-forminu
add_action('um_after_form_fields', 'karp_terms_render', 950, 1);
function karp_terms_render($args) {
    $mode = isset($args['mode']) ? $args['mode'] : '';
    if ($mode !== 'register') { return; }
    $checked = !empty($_POST['karp_terms_agree']) ? ' checked' : '';
    echo '<div class="um-field karp-terms-field" style="margin:4px 0 16px">'
       . '<label style="display:flex;gap:9px;align-items:flex-start;font-size:13.5px;line-height:1.45;cursor:pointer">'
       . '<input type="checkbox" name="karp_terms_agree" value="1"' . $checked . ' style="margin-top:2px;flex:none;width:16px;height:16px" /> '
       . '<span>Ég samþykki <a href="' . esc_url(KARP_TERMS_URL) . '" target="_blank" rel="noopener">skilmála og persónuverndarstefnu</a> Karp.</span>'
       . '</label></div>';
}

// 2) Staðfesta við sendingu — villa ef óhakað (virkar fyrir AJAX og venjulega sendingu)
add_action('um_submit_form_errors_hook', 'karp_terms_validate', 950, 1);
function karp_terms_validate($args) {
    $mode = isset($args['mode']) ? $args['mode'] : (isset($_POST['mode']) ? $_POST['mode'] : '');
    if ($mode !== 'register') { return; }
    if (empty($_POST['karp_terms_agree'])) {
        if (function_exists('UM') && UM()->form()) {
            UM()->form()->add_error('karp_terms_agree', 'Þú þarft að samþykkja skilmála og persónuverndarstefnu til að stofna aðgang.');
        }
    }
}

// 3) Vista tímastimpil samþykkis á notandann við skráningu
add_action('um_registration_complete', 'karp_terms_save', 10, 2);
function karp_terms_save($user_id, $args) {
    update_user_meta($user_id, 'karp_terms_accepted', current_time('mysql'));
}
