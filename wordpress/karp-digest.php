<?php
/**
 * Karp — vikulegt yfirlit í tölvupósti.
 * --------------------------------------------------------------------------
 * Sendir áskrifendum (notendur með user meta digest = "1") vikulegan póst.
 * Áskrift er kveikt/slökkt í prófílnum (Breyta → „Fá vikulegt yfirlit").
 *
 * UPPSETNING (WPCode): Add Snippet → PHP Snippet → límdu (slepptu fyrstu <?php) →
 *   Active · Auto Insert · Run Everywhere · Save.
 *
 * ⚠ AFHENDING (mikilvægt): wp_mail() notar sjálfgefið PHP mail() sem lendir oft
 *   í ruslpósti eða er hafnað. Fyrir áreiðanlega afhendingu settu upp SMTP-viðbót
 *   (t.d. „WP Mail SMTP") og tengdu hana við póstþjónustu. Án þess gæti pósturinn
 *   ekki skilað sér.
 *
 * ⚠ STÆRÐ: sendir í einni cron-keyrslu. Fyrir mjög marga áskrifendur ætti að
 *   senda í lotum (batch) — látið vita ef notendur verða margir.
 */

/* 1) Tryggja að 'weekly' tíðni sé til (er í WP-kjarna frá 5.4, en til öryggis). */
add_filter('cron_schedules', function ($s) {
    if (!isset($s['weekly'])) {
        $s['weekly'] = array('interval' => 7 * DAY_IN_SECONDS, 'display' => 'Vikulega');
    }
    return $s;
});

/* 2) Skrá vikulegan cron-atburð (einu sinni). */
add_action('init', function () {
    if (!wp_next_scheduled('karp_weekly_digest')) {
        wp_schedule_event(time() + 300, 'weekly', 'karp_weekly_digest');
    }
});

/* 3) Senda póstinn. */
add_action('karp_weekly_digest', 'karp_send_weekly_digest');
function karp_send_weekly_digest() {
    $users = get_users(array(
        'meta_key'   => 'digest',
        'meta_value' => '1',
        'fields'     => array('ID', 'user_email', 'display_name'),
    ));
    if (empty($users)) {
        return;
    }
    $home    = home_url('/');
    $subject = 'Vikan á Karp — kíktu á nýjustu þingmálin';
    foreach ($users as $u) {
        if (empty($u->user_email) || !is_email($u->user_email)) {
            continue;
        }
        $name = $u->display_name ? $u->display_name : 'Hæ';
        $body =
            'Hæ ' . $name . "!\n\n" .
            "Vikulegt yfirlit frá Karp — Hagvísi Íslands.\n\n" .
            "• Skoðaðu nýjustu þingmálin og kjóstu með eða á móti\n" .
            "• Sjáðu hvaða flokki þú ert sammála\n" .
            "• Taktu þátt í umræðunni og spáðu fyrir um hagtölurnar\n\n" .
            'Opna mælaborðið: ' . $home . "\n\n" .
            "— Karp\n\n" .
            "—\n" . 'Til að hætta áskrift: opnaðu prófílinn þinn, Breyta, og taktu hakið af reitnum.';
        wp_mail($u->user_email, $subject, $body);
    }
}
