<?php
/**
 * KARP Fréttir — RSS-safnari fyrir Hagvísir-mælaborðið.
 * Uppsetning: límdu í NÝTT WPCode PHP-snippet (Run Everywhere / Auto Insert), eða í functions.php.
 *   ATH: í WPCode á að SLEPPA fyrstu línunni <?php (WPCode bætir henni við sjálft).
 * Endapunktur:  /wp-json/karp/v1/frettir?efni=<flokkur>&fjoldi=<n>
 *           eða  /wp-json/karp/v1/frettir?q=<heiti,samheiti,...>&fjoldi=<n>  (fyrirtækjavöktun)
 * Skilar JSON:  { "efni":"...", "items":[ {"title","link","date","source"} ] }
 * Notar innbyggt SimplePie WordPress (fetch_feed) + transient-cache (3 mín). ATH: WP cache-ar RSS sjálft
 *   í 12 klst sjálfgefið — við lækkum það í 5 mín með wp_feed_cache_transient_lifetime svo fréttir séu ferskar.
 * Skilar AÐEINS fyrirsögnum + hlekkjum (engin endurbirting) — löglegt og einfalt.
 *
 * Veitur (karp_frettir_feeds): hver færsla er annaðhvort
 *   - RSS-slóð (strengur)  → allar greinar teknar, eða
 *   - array('slóð','pol')  → aðeins greinar sem standast lyklaorðasíuna 'pol' (sjá karp_frettir_keywords).
 * Dauðar/lokaðar slóðir eru einfaldlega hunsaðar (SimplePie sleppir þeim).
 */

add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/frettir', array(
    'methods'             => 'GET',
    'permission_callback' => '__return_true',
    'callback'            => 'karp_frettir_callback',
  ));
});

function karp_frettir_feeds() {
  $M   = 'https://www.mbl.is/feeds/';
  $V   = 'https://www.visir.is/rss/';
  $R   = 'https://www.ruv.is/rss/';
  $S   = 'https://www.stjornarradid.is/extensions/news/rss/';
  $SED = 'https://sedlabanki.is/api/documents/views/greinasafn-si/RSS/Frettatilkynningar'; // Seðlabanki — fréttatilkynningar (nýtt API; eldra GetRSSFeed.aspx var úrelt og uppfærðist ekki)
  $HEIM = 'https://heimildin.is/rss/'; // Heimildin (Kjarninn+Stundin)
  $VB  = 'https://vb.is/rss/';         // Viðskiptablaðið — eitt RSS (án www, staðfest); best-effort + vafra-UA ef bot-vörn
  return array(
    // flokkur => listi af RSS-veitum. 'pol' = beita stjórnmála-lyklaorðasíu á þá veitu.
    'efnahagur'    => array($M.'vidskipti/', $V.'vidskipti', $V.'innherji', $VB, $SED, $S.'fjarmala-og-efnahagsraduneytid.rss'),
    'stjornmal'    => array(array($M.'innlent/', 'pol'), array($R.'innlent', 'pol'), array($V.'innlent', 'pol'), $S.'forsaetisraduneytid.rss'),
    'sveitarfelog' => array($M.'innlent/', $S.'innvidaraduneytid.rss'),
    'althjoda'     => array($M.'erlent/', $R.'erlent', $S.'utanrikisraduneytid.rss'),
    'samfelag'     => array($R.'efni/heilbrigdismal', $HEIM, $S.'heilbrigdisraduneytid.rss'),
    'allt'         => array($M.'fp/', $R.'frettir', $V.'frettir', $M.'vidskipti/', $HEIM),
  );
}

// Lyklaorðasíur (lágstafir, UTF-8). 'pol' = þrengir breiðar innlendar veitur niður í pólitík.
// Bættu við/fjarlægðu að vild — substring-leit á fyrirsögn (t.d. 'ráðherra' nær líka 'fjármálaráðherra').
function karp_frettir_keywords() {
  return array(
    'pol' => array(
      'alþing','þingmað','þingmenn','þingflokk','þingfund','þingmál','þingsálykt','þingrof','þingnefnd','þingsetning',
      'frumvarp','ríkisstjórn','ráðherra','ráðuneyt','stjórnarandst','stjórnarflokk','stjórnarmeirihlut','stjórnarsáttmál',
      'kosning','atkvæðagreiðsl','vantraust','fjárlög','fjárauka','landsfund','þjóðaratkv',
      'sjálfstæðisflokk','samfylking','framsókn','viðreisn','miðflokk','pírat','sósíalist','vinstri græn','vinstrihreyf','flokks fólksins','flokkur fólks',
    ),
  );
}

function karp_title_has_kw($title_lc, $kw) {
  foreach ($kw as $w) { if ($w !== '' && strpos($title_lc, $w) !== false) return true; }
  return false;
}

// Stillingar fyrir feed-sókn. Lengri timeout (sumar veitur, t.d. Seðlabanka .aspx, eru hægar).
// Vafra-UA AÐEINS á vb.is (sem hafnar default WP/SimplePie UA). Aðrar veitur halda default-UA
// svo við breytum ekki hegðun þar sem ekkert var að (Seðlabanki o.fl. hafna "Chrome úr gagnaveri").
function karp_frettir_feed_opts($feed, $url = '') {
  $feed->set_timeout(12);
  if (strpos($url, 'vb.is') !== false) {
    $feed->set_useragent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  }
}

// LYKILATRIÐI fyrir ferskleika: WordPress cache-ar hvert RSS-streymi sjálft í 12 KLST sjálfgefið (í gegnum
// SimplePie). Þess vegna birtust fréttir margra klst gamlar þótt okkar eigin transient væri stuttur. Hér
// lækkum við þann WP-RSS-cache niður í 5 mín svo fetch_feed sæki í raun ný gögn margfalt oftar.
function karp_frettir_feed_ttl($seconds) { return 5 * MINUTE_IN_SECONDS; }

function karp_frettir_callback($req) {
  $fjoldi = min(40, max(1, intval($req->get_param('fjoldi')) ?: 14));
  // Fyrirtækjavöktun: ?q=<heiti,samheiti> → leitar að færslum sem nefna fyrirtækið (titill+lýsing).
  $q = $req->get_param('q');
  if ($q !== null && $q !== '') {
    return karp_frettir_company($q, $fjoldi);
  }
  $efni   = sanitize_key($req->get_param('efni'));
  $feeds  = karp_frettir_feeds();
  $KW     = karp_frettir_keywords();
  if (!$efni || !isset($feeds[$efni])) $efni = 'allt';

  $cache_key = 'karp_frettir_v4_' . $efni; // hækkaðu útgáfuna (v5, v6…) þegar veitum/síum er breytt → hreinsar gamla cache strax
  $cached = get_transient($cache_key);
  if ($cached !== false) {
    return new WP_REST_Response(array('efni'=>$efni, 'cached'=>true, 'items'=>array_slice($cached, 0, $fjoldi)));
  }

  if (!function_exists('fetch_feed')) include_once(ABSPATH . WPINC . '/feed.php');
  add_action('wp_feed_options', 'karp_frettir_feed_opts', 10, 2); // timeout + vafra-UA (aðeins vb.is)
  add_filter('wp_feed_cache_transient_lifetime', 'karp_frettir_feed_ttl'); // lækka WP-RSS-cache úr 12 klst → 5 mín
  $items = array();
  foreach ($feeds[$efni] as $f) {
    // veita má vera strengur (allt) eða array('slóð','síulykill')
    $kwkey = '';
    if (is_array($f)) { $url = $f[0]; $kwkey = isset($f[1]) ? $f[1] : ''; }
    else { $url = $f; }
    $kw = ($kwkey && isset($KW[$kwkey])) ? $KW[$kwkey] : null;

    $feed = fetch_feed($url);
    if (is_wp_error($feed)) continue;
    $src = $feed->get_title();
    if (!$src) $src = parse_url($url, PHP_URL_HOST);

    // síaðar veitur: sækjum fleiri greinar svo nógu margar standist síuna
    $limit = $kw ? 20 : 8;
    foreach ($feed->get_items(0, $limit) as $it) {
      $title = wp_strip_all_tags($it->get_title());
      if ($kw) {
        $tl = function_exists('mb_strtolower') ? mb_strtolower($title, 'UTF-8') : strtolower($title);
        if (!karp_title_has_kw($tl, $kw)) continue;
      }
      $link = esc_url_raw($it->get_permalink());
      if (!$link) continue;
      $items[] = array(
        'title'  => $title,
        'link'   => $link,
        'date'   => $it->get_date('c'),
        'ts'     => intval($it->get_date('U')),
        'source' => $src,
      );
    }
  }
  // raða nýjast efst + fjarlægja tvítekningar
  usort($items, function($a, $b) { return $b['ts'] - $a['ts']; });
  $seen = array(); $out = array();
  foreach ($items as $it) {
    if (isset($seen[$it['link']])) continue;
    $seen[$it['link']] = 1;
    unset($it['ts']);
    $out[] = $it;
  }
  set_transient($cache_key, $out, 3 * MINUTE_IN_SECONDS);
  return new WP_REST_Response(array('efni'=>$efni, 'cached'=>false, 'items'=>array_slice($out, 0, $fjoldi)));
}

/**
 * Fyrirtækjavöktun — leitar í breiðu mengi frétta-veitna að færslum sem nefna fyrirtækið.
 * $q = kommu-aðskilinn listi heita/samheita (t.d. "Sýn,Vodafone,Stöð 2"). Leitar í titli + lýsingu,
 * lágstöfum, substring. Skilar nýjustu fyrst, án tvítekninga. Cache 5 mín per fyrirspurn.
 */
// Orðamarka-samsvörun: samheiti verður að vera HEILT orð (ekki hluti af lengra orði).
// Kemur í veg fyrir „vís"→„vísir/vísitala", „sýn"→„sýnir", „festi"→„festir". $hay + $aliases lágstafir.
function karp_match_aliases($hay, $aliases) {
  foreach ($aliases as $a) {
    if ((function_exists('mb_strlen') ? mb_strlen($a) : strlen($a)) < 3) continue;
    if (preg_match('/(?:^|[^\p{L}\p{N}])' . preg_quote($a, '/') . '(?:[^\p{L}\p{N}]|$)/u', $hay)) return true;
  }
  return false;
}
function karp_frettir_company($q, $fjoldi) {
  $aliases = array();
  foreach (explode(',', (string) $q) as $a) {
    $a = trim(wp_strip_all_tags($a));
    if ($a === '') continue;
    $al = function_exists('mb_strtolower') ? mb_strtolower($a, 'UTF-8') : strtolower($a);
    if (function_exists('mb_strlen') ? mb_strlen($al) >= 2 : strlen($al) >= 2) $aliases[] = $al;
  }
  if (!$aliases) return new WP_REST_Response(array('q'=>'', 'items'=>array()));
  $aliases = array_slice(array_values(array_unique($aliases)), 0, 12);

  $cache_key = 'karp_co_v1_' . md5(implode('|', $aliases));
  $cached = get_transient($cache_key);
  if ($cached !== false) {
    return new WP_REST_Response(array('q'=>$q, 'cached'=>true, 'items'=>array_slice($cached, 0, $fjoldi)));
  }

  if (!function_exists('fetch_feed')) include_once(ABSPATH . WPINC . '/feed.php');
  add_action('wp_feed_options', 'karp_frettir_feed_opts', 10, 2);
  add_filter('wp_feed_cache_transient_lifetime', 'karp_frettir_feed_ttl');
  $M = 'https://www.mbl.is/feeds/'; $V = 'https://www.visir.is/rss/'; $R = 'https://www.ruv.is/rss/';
  $VB = 'https://vb.is/rss/'; $HEIM = 'https://heimildin.is/rss/';
  // breitt mengi: viðskipti + almennar innlendar fréttir (fyrirtæki birtast víða)
  $feeds = array($M.'vidskipti/', $V.'vidskipti', $V.'innherji', $VB, $M.'fp/', $M.'innlent/', $R.'frettir', $V.'frettir', $HEIM);
  $items = array();
  foreach ($feeds as $url) {
    $feed = fetch_feed($url);
    if (is_wp_error($feed)) continue;
    $src = $feed->get_title();
    if (!$src) $src = parse_url($url, PHP_URL_HOST);
    foreach ($feed->get_items(0, 30) as $it) {
      $title = wp_strip_all_tags($it->get_title());
      $desc  = wp_strip_all_tags($it->get_description());
      $hay   = function_exists('mb_strtolower') ? mb_strtolower($title.' '.$desc, 'UTF-8') : strtolower($title.' '.$desc);
      if (!karp_match_aliases($hay, $aliases)) continue;
      $link = esc_url_raw($it->get_permalink());
      if (!$link) continue;
      $items[] = array('title'=>$title, 'link'=>$link, 'date'=>$it->get_date('c'), 'ts'=>intval($it->get_date('U')), 'source'=>$src);
    }
  }
  usort($items, function($a, $b) { return $b['ts'] - $a['ts']; });
  $seen = array(); $out = array();
  foreach ($items as $it) {
    if (isset($seen[$it['link']])) continue;
    $seen[$it['link']] = 1;
    unset($it['ts']);
    $out[] = $it;
  }
  set_transient($cache_key, $out, 5 * MINUTE_IN_SECONDS);
  return new WP_REST_Response(array('q'=>$q, 'cached'=>false, 'items'=>array_slice($out, 0, $fjoldi)));
}

/* ============================================================================
 * FRÉTTASAFN (gagnagrunnur) — safnar fréttum yfir tíma svo hægt sé að sýna
 * umfjöllun-yfir-tíma, algeng orð og sögulega leit um fyrirtæki (eins og Vaktarinn).
 * Tafla wp_karp_news + safnara-cron (klukkutíma fresti) + endapunktur /firma.
 * Safnið BYRJAR TÓMT og vex jafnt og þétt. ATH: WP-cron keyrir á umferð — á rólegum
 * vef má tengja alvöru cron (DISABLE_WP_CRON + system cron) fyrir áreiðanleika.
 * ========================================================================== */
function karp_news_table() { global $wpdb; return $wpdb->prefix . 'karp_news'; }

// Búa til töflu einu sinni (dbDelta), varið með option-fána.
add_action('init', function () {
  if (get_option('karp_news_db_v2') === '1') return;
  global $wpdb;
  $t = karp_news_table();
  $charset = $wpdb->get_charset_collate();
  require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
  // sentiment: -1/0/1 tónn fyrirsagnar (NULL = óskorað). dbDelta bætir dálkinum á töflur sem eru þegar til.
  $sql = "CREATE TABLE $t (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  ts int(11) NOT NULL DEFAULT 0,
  source varchar(120) NOT NULL DEFAULT '',
  title text NOT NULL,
  url varchar(700) NOT NULL DEFAULT '',
  url_hash char(32) NOT NULL DEFAULT '',
  body text NOT NULL,
  sentiment tinyint(4) DEFAULT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY url_hash (url_hash),
  KEY ts (ts),
  KEY sentiment (sentiment)
) $charset;";
  dbDelta($sql);
  update_option('karp_news_db_v2', '1', false);
  update_option('karp_news_db_v1', '1', false);
  if (!wp_next_scheduled('karp_news_collect')) {
    wp_schedule_single_event(time() + 30, 'karp_news_collect'); // fyrsta söfnun fljótt
  }
});

// Allar veitur flatt (úr karp_frettir_feeds) — safnarinn tekur ALLT (engin pol-sía).
function karp_news_all_feeds() {
  $all = array();
  foreach (karp_frettir_feeds() as $list) {
    foreach ($list as $f) { $all[] = is_array($f) ? $f[0] : $f; }
  }
  return array_values(array_unique($all));
}

// Safnara-cron (klukkutíma fresti) — sækir veitur, vistar nýjar færslur (dedup á url_hash).
add_action('karp_news_collect', 'karp_news_collect_run');
add_action('init', function () {
  if (!wp_next_scheduled('karp_news_collect')) {
    wp_schedule_event(time() + 120, 'hourly', 'karp_news_collect');
  }
});
function karp_news_collect_run() {
  global $wpdb;
  $t = karp_news_table();
  if (!function_exists('fetch_feed')) include_once(ABSPATH . WPINC . '/feed.php');
  add_action('wp_feed_options', 'karp_frettir_feed_opts', 10, 2);
  add_filter('wp_feed_cache_transient_lifetime', 'karp_frettir_feed_ttl');
  $added = 0;
  foreach (karp_news_all_feeds() as $url) {
    $feed = fetch_feed($url);
    if (is_wp_error($feed)) continue;
    $src = $feed->get_title();
    if (!$src) $src = parse_url($url, PHP_URL_HOST);
    foreach ($feed->get_items(0, 40) as $it) {
      $link = esc_url_raw($it->get_permalink());
      if (!$link) continue;
      $title = wp_strip_all_tags($it->get_title());
      if ($title === '') continue;
      $desc = wp_strip_all_tags($it->get_description());
      $body = function_exists('mb_strtolower') ? mb_strtolower($title . ' ' . $desc, 'UTF-8') : strtolower($title . ' ' . $desc);
      if (function_exists('mb_substr')) $body = mb_substr($body, 0, 600);
      $ts = intval($it->get_date('U')); if (!$ts) $ts = time();
      $wpdb->query($wpdb->prepare(
        "INSERT IGNORE INTO $t (ts, source, title, url, url_hash, body) VALUES (%d, %s, %s, %s, %s, %s)",
        $ts, $src, $title, $link, md5($link), $body
      ));
      if ($wpdb->rows_affected) $added++;
    }
  }
  // halda töflunni í skefjum: henda eldra en ~18 mánaða
  $wpdb->query($wpdb->prepare("DELETE FROM $t WHERE ts < %d", time() - 550 * 86400));
  update_option('karp_news_last', array('t' => time(), 'added' => $added), false);
}

// /wp-json/karp/v1/firma?q=<heiti,samheiti>&days=180 → { ready, total, items[], timeline[{d,n}], words[{w,n}] }
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/firma', array(
    array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'karp_firma_get'),
  ));
});
function karp_news_stopwords() {
  static $s = null;
  if ($s !== null) return $s;
  $w = array('og','að','er','í','á','um','en','með','það','sem','til','fyrir','við','úr','þá','þó','svo','ekki','var','eru','hafa','hefur','verður','vera','þetta','þessi','þeir','þær','þau','hann','hún','sig','sér','þeirra','eftir','frá','eða','þann','þeim','þess','sína','sinni','sínum','þegar','milli','yfir','undir','meira','mikið','margir','allir','allt','einn','ein','eitt','tveir','nýtt','nýr','gæti','verið','vegna','þurfa','meðal','annað','aðrir','hér','þar','nú','bara','líka','enn','aftur','samkvæmt','segir','sagði','kemur','koma','fær','fékk','this','the','and','for','milljón','milljarða','prósent','hf','ehf',
    // víkkað: algeng sagnorð, atviksorð, fornöfn, lýsingarorð, magnorð (sía burt „skrifar/gegn/fram…" suð)
    'skrifar','skrifa','skrifaði','gegn','fram','framar','segja','sagt','segðu','sögðu','vill','vilja','viljað','verði','verða','varð','vorum','vóru','áfram','niður','upp','uppi','inn','inní','kemur','kom','komið','komin','kominn','fá','fáir','gera','gerir','gerði','gert','getur','geta','get','gátu','þarf','þurfti','þurftu','mun','muni','munu','má','mátti','mega','ætla','ætlar','ætlaði','ætluðu','voru','hafði','höfðu','hafi','hafið','sé','séu','eins','mjög','mest','flestir','fleiri','fleira','hvað','hver','hvaða','hvar','hvernig','hvers','hvort','því','þannig','jafnvel','samt','hins','vegar','þrátt','einnig','hjá','innan','utan','ásamt','gæti','gætu','ætti','átti','áttu','báðir','bæði','hingað','þangað','aðeins','sérstaklega','jafnframt','heldur','þótt','meðan','síðan','síðast','síðasta','fyrst','fyrsta','fyrr','annars','annar','önnur','þriðja','milljónir','milljarðar','milljarður','milljónum','íslandi','ísland','íslands','íslenska','íslenskir','íslenskur','íslenskt','íslensku','góð','góður','gott','góðu','stór','stóra','stórt','stóran','nýja','nýju','nýjan','gamla','gamlir','sína','sinni','sinn','sín','sitt','sínu','sína','okkar','okkur','ykkar','þér','mér','mig','þig','hans','hennar','þetta','þessa','þessu','þessum','þennan','þeirri','allra','öllum','öll','allan','sumir','marga','margra','þessar','þessir','meiri','minni','helst','allra','enginn','ekkert','engin','engir','eftir','samkvæmt','vegna','tæplega','rúmlega','um það bil','alls','þessum','þeirra','sjálfur','sjálf','sjálft','okkar','milli','orðið','aldrei','maður','menn','manns','grein','greinar','mynd','myndir','svona','víða','fólk','fólki','fólks','fimm','þrír','þrjú','fjórir','fjögur','sex','sjö','átta','níu','tíu','tólf','tuttugu','hundruð','þúsund','tveimur','þremur','fjórum','báðar','báðir','annarra');
  $s = array();
  foreach ($w as $x) { $s[$x] = 1; }
  return $s;
}
function karp_firma_get($req) {
  global $wpdb;
  $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) {
    return new WP_REST_Response(array('ready' => false, 'total' => 0, 'items' => array(), 'timeline' => array(), 'words' => array()));
  }
  $aliases = array();
  foreach (explode(',', (string) $req->get_param('q')) as $a) {
    $a = trim(wp_strip_all_tags($a));
    if ($a === '') continue;
    $al = function_exists('mb_strtolower') ? mb_strtolower($a, 'UTF-8') : strtolower($a);
    if ((function_exists('mb_strlen') ? mb_strlen($al) : strlen($al)) >= 2) $aliases[] = $al;
  }
  if (!$aliases) return new WP_REST_Response(array('ready' => true, 'total' => 0, 'items' => array(), 'timeline' => array(), 'words' => array()));
  $aliases = array_slice(array_values(array_unique($aliases)), 0, 12);
  // valfrjáls 'and' = annað samheita-mengi sem VERÐUR líka að passa (t.d. aðili × málefni).
  $andAliases = array();
  foreach (explode(',', (string) $req->get_param('and')) as $a) {
    $a = trim(wp_strip_all_tags($a)); if ($a === '') continue;
    $la = function_exists('mb_strtolower') ? mb_strtolower($a, 'UTF-8') : strtolower($a);
    if ((function_exists('mb_strlen') ? mb_strlen($la) : strlen($la)) >= 2) $andAliases[] = $la;
  }
  $andAliases = array_slice(array_values(array_unique($andAliases)), 0, 12);
  $days = min(400, max(7, intval($req->get_param('days')) ?: 180));
  $since = time() - $days * 86400;
  $ckey = 'karp_firma_' . md5(implode('|', $aliases) . '#' . implode('|', $andAliases) . '#' . $days);
  $cc = get_transient($ckey);
  if ($cc !== false) return new WP_REST_Response($cc);

  $likes = array(); $params = array();
  foreach ($aliases as $a) { $likes[] = 'body LIKE %s'; $params[] = '%' . $wpdb->esc_like($a) . '%'; }
  $where = '(' . implode(' OR ', $likes) . ')';
  if ($andAliases) {
    $al2 = array();
    foreach ($andAliases as $a) { $al2[] = 'body LIKE %s'; $params[] = '%' . $wpdb->esc_like($a) . '%'; }
    $where .= ' AND (' . implode(' OR ', $al2) . ')';
  }
  $where .= ' AND ts >= ' . intval($since);
  // LIKE sækir frambjóðendur (getur ofmatchað stutt samheiti); orðamarka-sía í PHP hreinsar svo.
  $rows = $wpdb->get_results($wpdb->prepare("SELECT ts, source, title, url, body, sentiment FROM $t WHERE $where ORDER BY ts DESC LIMIT 5000", $params));
  $rows = array_slice(array_values(array_filter((array) $rows, function ($r) use ($aliases, $andAliases) { return karp_match_aliases($r->body, $aliases) && (!$andAliases || karp_match_aliases($r->body, $andAliases)); })), 0, 3000);
  $total = count($rows);

  $items = array();
  foreach (array_slice((array) $rows, 0, 30) as $r) {
    $items[] = array('title' => $r->title, 'link' => $r->url, 'source' => $r->source, 'date' => gmdate('c', (int) $r->ts));
  }
  // tímalína: vikuleg talning + vikulegt viðhorf (lykill = mánudagur vikunnar)
  $tl = array();
  foreach ((array) $rows as $r) {
    $ts = (int) $r->ts;
    $monday = $ts - ((int) gmdate('N', $ts) - 1) * 86400;
    $key = gmdate('Y-m-d', $monday);
    if (!isset($tl[$key])) $tl[$key] = array('n' => 0, 'ss' => 0, 'sn' => 0);
    $tl[$key]['n']++;
    if ($r->sentiment !== null) { $tl[$key]['ss'] += intval($r->sentiment); $tl[$key]['sn']++; }
  }
  ksort($tl);
  $timeline = array();
  foreach ($tl as $d => $v) { $timeline[] = array('d' => $d, 'n' => $v['n'], 'idx' => ($v['sn'] ? (int) round($v['ss'] / $v['sn'] * 100) : null), 'scored' => $v['sn']); }
  // algeng orð úr titlum
  $stop = karp_news_stopwords();
  $wc = array();
  foreach ((array) $rows as $r) {
    $lc = function_exists('mb_strtolower') ? mb_strtolower($r->title, 'UTF-8') : strtolower($r->title);
    $toks = preg_split('/[^\p{L}0-9]+/u', $lc, -1, PREG_SPLIT_NO_EMPTY);
    foreach ((array) $toks as $w) {
      if ((function_exists('mb_strlen') ? mb_strlen($w) : strlen($w)) < 3) continue;
      if (isset($stop[$w])) continue;
      $wc[$w] = isset($wc[$w]) ? $wc[$w] + 1 : 1;
    }
  }
  arsort($wc);
  $words = array(); $i = 0;
  foreach ($wc as $w => $n) { if ($i++ >= 28 || $n < 2) break; $words[] = array('w' => $w, 'n' => (int) $n); }

  // Vaktarinn-yfirlit: dreifing miðla, orð/fyrirsögn, færslur/dag
  $srcCount = array(); $wordSum = 0; $minTs = PHP_INT_MAX; $maxTs = 0;
  foreach ((array) $rows as $r) {
    $srcCount[$r->source] = isset($srcCount[$r->source]) ? $srcCount[$r->source] + 1 : 1;
    $wordSum += count((array) preg_split('/\s+/u', trim($r->title), -1, PREG_SPLIT_NO_EMPTY));
    $ts = (int) $r->ts; if ($ts < $minTs) $minTs = $ts; if ($ts > $maxTs) $maxTs = $ts;
  }
  arsort($srcCount);
  $sources = array(); foreach ($srcCount as $sname => $sn) { $sources[] = array('s' => $sname, 'n' => (int) $sn); }
  $daysSpan = ($total > 1 && $maxTs > $minTs) ? max(1, ($maxTs - $minTs) / 86400) : 1;
  $stats = array(
    'perDay'   => $total ? round($total / $daysSpan, 1) : 0,
    'avgWords' => $total ? round($wordSum / $total, 1) : 0,
    'sources'  => array_slice($sources, 0, 10),
  );
  // Viðhorf: meðaltal tóns yfir þær fréttir sem passa OG eru skoraðar (sentiment != NULL) — heild + eftir miðli.
  $sSum = 0; $sN = 0; $sPos = 0; $sNeu = 0; $sNeg = 0; $bySrc = array();
  foreach ((array) $rows as $r) {
    if ($r->sentiment === null) continue;
    $sv = intval($r->sentiment); $sSum += $sv; $sN++;
    if ($sv > 0) $sPos++; elseif ($sv < 0) $sNeg++; else $sNeu++;
    $sk = $r->source;
    if (!isset($bySrc[$sk])) $bySrc[$sk] = array('sum' => 0, 'n' => 0, 'pos' => 0, 'neu' => 0, 'neg' => 0);
    $bySrc[$sk]['sum'] += $sv; $bySrc[$sk]['n']++;
    if ($sv > 0) $bySrc[$sk]['pos']++; elseif ($sv < 0) $bySrc[$sk]['neg']++; else $bySrc[$sk]['neu']++;
  }
  $sentiment = $sN ? array(
    'idx' => (int) round($sSum / $sN * 100), 'n' => $sN, 'pos' => $sPos, 'neu' => $sNeu, 'neg' => $sNeg,
    'scored' => $sN, 'total' => $total,
  ) : array('idx' => 0, 'n' => 0, 'pos' => 0, 'neu' => 0, 'neg' => 0, 'scored' => 0, 'total' => $total);
  // Tónn eftir miðli (a.m.k. 3 skoraðar fréttir per miðil til að tölfræðin sé marktæk).
  $bySource = array();
  foreach ($bySrc as $sk => $v) {
    if ($v['n'] < 3) continue;
    $bySource[] = array('s' => $sk, 'n' => $v['n'], 'idx' => (int) round($v['sum'] / $v['n'] * 100), 'pos' => $v['pos'], 'neu' => $v['neu'], 'neg' => $v['neg']);
  }
  usort($bySource, function ($a, $b) { return $b['n'] - $a['n']; });
  $sentiment['bySource'] = array_slice($bySource, 0, 10);
  $resp = array('ready' => true, 'total' => $total, 'items' => $items, 'timeline' => $timeline, 'words' => $words, 'stats' => $stats, 'sentiment' => $sentiment);
  set_transient($ckey, $resp, 8 * MINUTE_IN_SECONDS);
  return new WP_REST_Response($resp);
}

// /wp-json/karp/v1/firmacompare?days=30 → { ready, companies:[{name,n}] } — samanburður umfjöllunar milli félaga.
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/firmacompare', array(
    array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'karp_firmacompare_get'),
  ));
});
// Sami félagalisti og FYRIRTAEKI í dashboard.html (heiti → samheiti). Uppfæra ef listanum er breytt þar.
function karp_firma_companies() {
  return array(
    array('Arion banki', array('Arion banki', 'Arion')), array('Íslandsbanki', array('Íslandsbanki', 'Islandsbanki')),
    array('Kvika banki', array('Kvika')), array('Sjóvá', array('Sjóvá', 'Sjova')), array('Skagi (VÍS)', array('Skagi hf', 'VÍS', 'Vátryggingafélag Íslands')),
    array('Síminn', array('Síminn hf', 'Símans hf', 'Sjónvarp Símans', 'Síminn Sport', 'Síminn Pay')), array('Sýn', array('Sýn hf', 'Vodafone', 'Stöð 2')), array('Nova', array('Nova')),
    array('Hagar', array('Hagar hf', 'Bónus', 'Hagkaup')), array('Festi', array('Festi hf', 'Elko', 'Krónunni')), array('Skel', array('Skel fjárfesting', 'Skeljungur', 'Orkan', 'Olís', 'Heimkaup')),
    array('Ölgerðin', array('Ölgerðin', 'Egils')), array('Brim', array('Brim hf', 'Brim í')), array('Síldarvinnslan', array('Síldarvinnslan')),
    array('Hampiðjan', array('Hampiðjan')), array('Icelandair', array('Icelandair', 'Flugleiðir')), array('Eimskip', array('Eimskip')),
    array('JBT Marel', array('Marel')), array('Reitir', array('Reitir fasteigna')), array('Eik', array('Eik fasteigna')),
    array('Alvotech', array('Alvotech')), array('Amaroq', array('Amaroq')),
    array('Landsvirkjun', array('Landsvirkjun', 'Landsvirkjunar')), array('Isavia', array('Isavia')), array('Orkuveita Reykjavíkur', array('Orkuveit', 'Veitur', 'Orka náttúrunnar')),
    array('Landsnet', array('Landsnet')), array('Samkaup', array('Samkaup', 'Nettó', 'Kjörbúðin')), array('Costco', array('Costco')), array('IKEA', array('IKEA')),
    array('Norðurál', array('Norðurál', 'Nordural')), array('Rio Tinto (ISAL)', array('Rio Tinto', 'álverið í Straumsvík', 'ISAL')),
    array('Play', array('Fly Play', 'PLAY flug')), array('CCP Games', array('CCP Games', 'EVE Online')), array('Össur', array('Össur')),
    array('Indó', array('Indó banki', 'Indó')),
  );
}
// POST /wp-json/karp/v1/newsimport — fjöldainnflutningur/auðgun í wp_karp_news.
// Body: { items:[{ts,source,title,url,body?}] }. Ef 'body' fylgir (titill + lýsing) er hann notaður í leitar-
// textann (annars titillinn einn). UPSERT: ný grein bætist við, EN ef url er til fyrir er 'body' uppfærður
// (svo bakvistun megi auðga með lýsingu). Heimild: WP-stjórnandi EÐA innflutnings-lyklaorð (karp_score_authed).
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/newsimport', array(
    array('methods' => 'POST', 'permission_callback' => 'karp_score_authed', 'callback' => 'karp_news_import'),
  ));
});
function karp_news_import($req) {
  if (!karp_score_authed($req)) return new WP_Error('karp_noauth', 'Aðeins stjórnandi eða gilt innflutnings-lyklaorð.', array('status' => 403));
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_Error('karp_notable', 'Tafla vantar — opnaðu Umfjöllun-síðuna fyrst svo hún verði til.', array('status' => 400));
  $p = $req->get_json_params();
  $items = (isset($p['items']) && is_array($p['items'])) ? $p['items'] : array();
  $added = 0;
  foreach ($items as $it) {
    $url = isset($it['url']) ? esc_url_raw($it['url']) : '';
    $title = isset($it['title']) ? wp_strip_all_tags($it['title']) : '';
    if (!$url || $title === '') continue;
    $ts = isset($it['ts']) ? intval($it['ts']) : time();
    $src = isset($it['source']) ? sanitize_text_field($it['source']) : '';
    $bodyIn = isset($it['body']) ? wp_strip_all_tags($it['body']) : '';
    $bodySrc = ($bodyIn !== '') ? $bodyIn : $title;
    $body = function_exists('mb_strtolower') ? mb_strtolower($bodySrc, 'UTF-8') : strtolower($bodySrc);
    if (function_exists('mb_substr')) $body = mb_substr($body, 0, 600);
    $wpdb->query($wpdb->prepare("INSERT INTO $t (ts, source, title, url, url_hash, body) VALUES (%d,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE body = VALUES(body)", $ts, $src, $title, $url, md5($url), $body));
    if ($wpdb->rows_affected) $added++;
  }
  return array('ok' => true, 'added' => $added, 'received' => count($items));
}

// Viðhorfs-skorun: heimild = WP-stjórnandi EÐA innflutnings-lyklaorð (SHA-256 borið saman; lykill aldrei í kóða).
// Sama vélbúnaður og bakvistunin notaði. Sent í hausnum 'X-Karp-Import-Key'.
if (!defined('KARP_IMPORT_HASH')) define('KARP_IMPORT_HASH', 'cdf9d9e2a9e2bff886cb998ac3f64e64eceef255cdbcdf16c545a156492bb123');
function karp_score_authed($req) {
  if (current_user_can('manage_options')) return true;
  $k = $req ? (string) $req->get_header('X-Karp-Import-Key') : '';
  return $k !== '' && hash_equals(KARP_IMPORT_HASH, hash('sha256', $k));
}
// GET /wp-json/karp/v1/newsunscored?limit=500 → { items:[{id,title}], remaining } — óskoraðar fréttir (sentiment IS NULL).
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/newsunscored', array(
    array('methods' => 'GET', 'permission_callback' => 'karp_score_authed', 'callback' => 'karp_news_unscored'),
  ));
  // POST /wp-json/karp/v1/newsscore  body { scores:[{id, s}] }  (s = -1/0/1) → UPDATE sentiment. → { updated }
  register_rest_route('karp/v1', '/newsscore', array(
    array('methods' => 'POST', 'permission_callback' => 'karp_score_authed', 'callback' => 'karp_news_score'),
  ));
});
function karp_news_unscored($req) {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_Error('karp_notable', 'Tafla vantar.', array('status' => 400));
  $limit = min(1000, max(1, intval($req->get_param('limit')) ?: 500));
  $rows = $wpdb->get_results($wpdb->prepare("SELECT id, title FROM $t WHERE sentiment IS NULL ORDER BY ts DESC LIMIT %d", $limit));
  $remaining = intval($wpdb->get_var("SELECT COUNT(*) FROM $t WHERE sentiment IS NULL"));
  $items = array();
  foreach ((array) $rows as $r) { $items[] = array('id' => intval($r->id), 'title' => $r->title); }
  return array('items' => $items, 'remaining' => $remaining);
}
function karp_news_score($req) {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_Error('karp_notable', 'Tafla vantar.', array('status' => 400));
  $p = $req->get_json_params();
  $scores = (isset($p['scores']) && is_array($p['scores'])) ? $p['scores'] : array();
  $updated = 0;
  foreach ($scores as $sc) {
    if (!isset($sc['id'])) continue;
    $id = intval($sc['id']);
    $s = max(-1, min(1, intval($sc['s'])));
    $wpdb->query($wpdb->prepare("UPDATE $t SET sentiment = %d WHERE id = %d", $s, $id));
    $updated++;
  }
  return array('ok' => true, 'updated' => $updated, 'received' => count($scores));
}

// ===== Sjálfvirk viðhorfsskorun (server-megin, cron) =====
// Skorar óskoraðar fréttir í litlum bútum á klst. fresti svo viðhorf haldist ferskt án handvirkrar keyrslu.
// Þarf Anthropic-lykil: settu  define('KARP_ANTHROPIC_KEY', 'sk-ant-...');  í wp-config.php (EKKI í þennan
// snippet) — eða option 'karp_anthropic_key'. Án lykils sleppir cron-ið HLJÓÐLAUST (ekkert brotnar).
// Notaðu FERSKAN lykil (ekki þann sem var límdur í spjall). Líkan: Claude Haiku (ódýrt).
function karp_anthropic_key() {
  if (defined('KARP_ANTHROPIC_KEY') && KARP_ANTHROPIC_KEY) return KARP_ANTHROPIC_KEY;
  $o = get_option('karp_anthropic_key', ''); return is_string($o) ? trim($o) : '';
}
add_action('karp_news_score_cron', 'karp_news_score_cron_run');
add_action('init', function () {
  if (!wp_next_scheduled('karp_news_score_cron')) wp_schedule_event(time() + 300, 'hourly', 'karp_news_score_cron');
});
function karp_news_score_cron_run() {
  $key = karp_anthropic_key();
  if (!$key) return;
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return;
  $rows = $wpdb->get_results("SELECT id, title FROM $t WHERE sentiment IS NULL ORDER BY ts DESC LIMIT 100");
  if (!$rows) return;
  $sys = 'Þú metur heildartón íslenskra frétta-fyrirsagna fyrir hlutlausa fjölmiðlavöktun. '
    . 'Gefðu hverri fyrirsögn: +1 ef JÁKVÆÐ frétt (vöxtur, hagnaður, árangur, verðlaun, samningar, opnun, framfarir, sigrar), '
    . '-1 ef NEIKVÆÐ (tap, gagnrýni, rannsókn, uppsagnir, slys, glæpur, sektir, deilur, hörmungar, andlát, veikindi), '
    . '0 ef HLUTLAUS/fréttnæm án skýrrar afstöðu. '
    . 'Svaraðu AÐEINS með JSON-fylki af tölum (-1, 0 eða 1), einni fyrir hverja fyrirsögn í sömu röð. Ekkert annað.';
  $updated = 0;
  foreach (array_chunk($rows, 25) as $chunk) {
    $user = "Fyrirsagnir:\n"; $i = 0;
    foreach ($chunk as $r) { $i++; $user .= $i . '. ' . $r->title . "\n"; }
    $resp = wp_remote_post('https://api.anthropic.com/v1/messages', array(
      'timeout' => 30,
      'headers' => array('content-type' => 'application/json', 'x-api-key' => $key, 'anthropic-version' => '2023-06-01'),
      'body' => wp_json_encode(array('model' => 'claude-haiku-4-5', 'max_tokens' => 700, 'system' => $sys, 'messages' => array(array('role' => 'user', 'content' => $user)))),
    ));
    if (is_wp_error($resp) || wp_remote_retrieve_response_code($resp) !== 200) continue;
    $body = json_decode(wp_remote_retrieve_body($resp), true);
    $txt = isset($body['content'][0]['text']) ? $body['content'][0]['text'] : '';
    if (!preg_match('/\[[\s\S]*\]/', $txt, $m)) continue;
    $arr = json_decode($m[0], true);
    if (!is_array($arr)) continue;
    $j = 0;
    foreach ($chunk as $r) {
      $s = isset($arr[$j]) ? max(-1, min(1, intval($arr[$j]))) : 0;
      $wpdb->query($wpdb->prepare("UPDATE $t SET sentiment = %d WHERE id = %d", $s, intval($r->id)));
      $updated++; $j++;
    }
  }
  update_option('karp_news_score_last', array('t' => time(), 'scored' => $updated), false);
}

// /wp-json/karp/v1/newsstatus → staðfesting á RSS-söfnun: { ready, count, sources, oldest, newest, last:{t,added}, next, feeds }
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/newsstatus', array(
    array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'karp_news_status'),
  ));
});
function karp_news_status() {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_REST_Response(array('ready' => false));
  $count = intval($wpdb->get_var("SELECT COUNT(*) FROM $t"));
  $oldest = intval($wpdb->get_var("SELECT MIN(ts) FROM $t"));
  $newest = intval($wpdb->get_var("SELECT MAX(ts) FROM $t"));
  $sources = intval($wpdb->get_var("SELECT COUNT(DISTINCT source) FROM $t"));
  $last = get_option('karp_news_last', array());
  $next = wp_next_scheduled('karp_news_collect');
  return new WP_REST_Response(array(
    'ready' => true,
    'count' => $count,
    'sources' => $sources,
    'oldest' => $oldest ?: null,
    'newest' => $newest ?: null,
    'last' => array('t' => isset($last['t']) ? intval($last['t']) : null, 'added' => isset($last['added']) ? intval($last['added']) : null),
    'next' => $next ? intval($next) : null,
    'feeds' => count(karp_news_all_feeds()),
    'unscored' => intval($wpdb->get_var("SELECT COUNT(*) FROM $t WHERE sentiment IS NULL")),
    'score_auto' => (karp_anthropic_key() !== ''),
    'score_last' => get_option('karp_news_score_last', null),
  ));
}
function karp_firmacompare_get($req) {
  global $wpdb;
  $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_REST_Response(array('ready' => false, 'companies' => array()));
  $days = min(365, max(7, intval($req->get_param('days')) ?: 30));
  $since = time() - $days * 86400;
  $ckey = 'karp_cmp_v1_' . $days;
  $cached = get_transient($ckey);
  if ($cached !== false) return new WP_REST_Response(array('ready' => true, 'days' => $days, 'cached' => true, 'companies' => $cached));
  $out = array();
  foreach (karp_firma_companies() as $co) {
    $al = array();
    foreach ($co[1] as $a) { $la = mb_strtolower($a, 'UTF-8'); if (mb_strlen($la) >= 3) $al[] = $la; }
    if (!$al) continue;
    $likes = array(); $params = array();
    foreach ($al as $a) { $likes[] = 'body LIKE %s'; $params[] = '%' . $wpdb->esc_like($a) . '%'; }
    $where = '(' . implode(' OR ', $likes) . ') AND ts >= ' . intval($since);
    $rows = $wpdb->get_results($wpdb->prepare("SELECT body FROM $t WHERE $where LIMIT 6000", $params));
    $n = 0;
    foreach ((array) $rows as $r) { if (karp_match_aliases($r->body, $al)) $n++; }
    if ($n) $out[] = array('name' => $co[0], 'n' => $n);
  }
  usort($out, function ($a, $b) { return $b['n'] - $a['n']; });
  set_transient($ckey, $out, 30 * MINUTE_IN_SECONDS);
  return new WP_REST_Response(array('ready' => true, 'days' => $days, 'cached' => false, 'companies' => $out));
}

// /wp-json/karp/v1/firmagraph?days=180 → tengslanet (Les-Misérables-stíl):
//   { ready, nodes:[{name,val}], links:[{source,target,value}] }  — hnútur = fyrirtæki (val = fjöldi frétta),
//   brún = fjöldi frétta sem nefna BÆÐI fyrirtækin (samnefnd umfjöllun). Cache 2 klst.
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/firmagraph', array(
    array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'karp_firmagraph_get'),
    array('methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => 'karp_firmagraph_post'),
  ));
});
// Sameiginleg samnefningar-útreikning: $cos = [{name, al:[lc-samheiti]}] → { nodes, links }.
function karp_graph_compute($cos, $days) {
  global $wpdb; $t = karp_news_table();
  $since = time() - $days * 86400;
  $allAliases = array();
  foreach ($cos as $c) foreach ($c['al'] as $a) $allAliases[$a] = true;
  if (!$allAliases) return array('nodes' => array(), 'links' => array());
  $likes = array(); $params = array();
  foreach (array_keys($allAliases) as $a) { $likes[] = 'body LIKE %s'; $params[] = '%' . $wpdb->esc_like($a) . '%'; }
  $where = '(' . implode(' OR ', $likes) . ') AND ts >= ' . intval($since);
  $rows = $wpdb->get_results($wpdb->prepare("SELECT body FROM $t WHERE $where ORDER BY ts DESC LIMIT 12000", $params));
  $counts = array(); $pair = array();
  foreach ((array) $rows as $r) {
    $hit = array();
    foreach ($cos as $c) { if (karp_match_aliases($r->body, $c['al'])) $hit[] = $c['name']; }
    if (!$hit) continue;
    foreach ($hit as $nm) $counts[$nm] = isset($counts[$nm]) ? $counts[$nm] + 1 : 1;
    $h = count($hit);
    if ($h >= 2) {
      sort($hit);
      for ($i = 0; $i < $h; $i++) for ($j = $i + 1; $j < $h; $j++) { $k = $hit[$i] . "\x1f" . $hit[$j]; $pair[$k] = isset($pair[$k]) ? $pair[$k] + 1 : 1; }
    }
  }
  $nodes = array(); $allow = array();
  foreach ($counts as $nm => $n) { if ($n >= 2) { $nodes[] = array('name' => $nm, 'val' => intval($n)); $allow[$nm] = true; } }
  $links = array();
  foreach ($pair as $k => $v) {
    if ($v < 1) continue;
    $p = explode("\x1f", $k);
    if (!isset($allow[$p[0]]) || !isset($allow[$p[1]])) continue;
    $links[] = array('source' => $p[0], 'target' => $p[1], 'value' => intval($v));
  }
  usort($nodes, function ($a, $b) { return $b['val'] - $a['val']; });
  usort($links, function ($a, $b) { return $b['value'] - $a['value']; });
  return array('nodes' => $nodes, 'links' => $links);
}
function karp_firmagraph_get($req) {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_REST_Response(array('ready' => false, 'nodes' => array(), 'links' => array()));
  $days = min(365, max(7, intval($req->get_param('days')) ?: 180));
  $ckey = 'karp_graph_v3_' . $days;
  $fresh = ($req->get_param('fresh') && karp_score_authed($req));
  if (!$fresh) { $cached = get_transient($ckey); if ($cached !== false) return new WP_REST_Response(array_merge(array('ready' => true, 'days' => $days, 'cached' => true), $cached)); }
  $cos = array();
  foreach (karp_firma_companies() as $co) {
    $al = array();
    foreach ($co[1] as $a) { $la = mb_strtolower($a, 'UTF-8'); if (mb_strlen($la) >= 3) $al[] = $la; }
    if ($al) $cos[] = array('name' => $co[0], 'al' => $al);
  }
  $out = karp_graph_compute($cos, $days);
  set_transient($ckey, $out, 2 * HOUR_IN_SECONDS);
  return new WP_REST_Response(array_merge(array('ready' => true, 'days' => $days, 'cached' => false), $out));
}
// POST /firmagraph  body { entities:[{n,a:[...]}], days } → tengslanet fyrir HVAÐA aðila-mengi (þingmenn, flokkar, stofnanir…).
function karp_firmagraph_post($req) {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_REST_Response(array('ready' => false, 'nodes' => array(), 'links' => array()));
  $p = $req->get_json_params();
  $ents = (isset($p['entities']) && is_array($p['entities'])) ? array_slice($p['entities'], 0, 120) : array();
  $days = min(365, max(7, intval(isset($p['days']) ? $p['days'] : 180) ?: 180));
  $cos = array(); $key = array();
  foreach ($ents as $e) {
    $nm = isset($e['n']) ? trim(wp_strip_all_tags($e['n'])) : ''; if ($nm === '') continue;
    $aliases = (isset($e['a']) && is_array($e['a']) && $e['a']) ? $e['a'] : array($nm);
    $al = array();
    foreach ($aliases as $a) { $la = mb_strtolower(trim(wp_strip_all_tags($a)), 'UTF-8'); if (mb_strlen($la) >= 3) $al[] = $la; }
    if ($al) { $cos[] = array('name' => $nm, 'al' => $al); $key[] = $nm; }
  }
  if (count($cos) < 2) return new WP_REST_Response(array('ready' => true, 'days' => $days, 'nodes' => array(), 'links' => array()));
  sort($key);
  $ckey = 'karp_graphp_v2_' . md5(implode('|', $key) . '#' . $days);
  $fresh = ($req->get_param('fresh') && karp_score_authed($req));
  if (!$fresh) { $cached = get_transient($ckey); if ($cached !== false) return new WP_REST_Response(array_merge(array('ready' => true, 'days' => $days, 'cached' => true), $cached)); }
  $out = karp_graph_compute($cos, $days);
  set_transient($ckey, $out, 2 * HOUR_IN_SECONDS);
  return new WP_REST_Response(array_merge(array('ready' => true, 'days' => $days, 'cached' => false), $out));
}

// POST /wp-json/karp/v1/agenda  body { topics:[{n,a:[...]}], days } → dagskrá: vikuleg talning per málefni + hreyfingar.
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/agenda', array(
    array('methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => 'karp_agenda_post'),
  ));
});
function karp_agenda_post($req) {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_REST_Response(array('ready' => false, 'topics' => array(), 'weekKeys' => array()));
  $p = $req->get_json_params();
  $topics = (isset($p['topics']) && is_array($p['topics'])) ? array_slice($p['topics'], 0, 40) : array();
  $days = min(365, max(28, intval(isset($p['days']) ? $p['days'] : 180) ?: 180));
  $cos = array(); $allAliases = array(); $key = array();
  foreach ($topics as $e) {
    $nm = isset($e['n']) ? trim(wp_strip_all_tags($e['n'])) : ''; if ($nm === '') continue;
    $aliases = (isset($e['a']) && is_array($e['a']) && $e['a']) ? $e['a'] : array($nm);
    $al = array();
    foreach ($aliases as $a) { $la = mb_strtolower(trim(wp_strip_all_tags($a)), 'UTF-8'); if (mb_strlen($la) >= 3) { $al[] = $la; $allAliases[$la] = true; } }
    if ($al) { $cos[] = array('n' => $nm, 'al' => $al); $key[] = $nm; }
  }
  if (!$cos) return new WP_REST_Response(array('ready' => true, 'topics' => array(), 'weekKeys' => array()));
  sort($key);
  $ckey = 'karp_agenda_' . md5(implode('|', $key) . '#' . $days);
  $fresh = ($req->get_param('fresh') && karp_score_authed($req));
  if (!$fresh) { $cc = get_transient($ckey); if ($cc !== false) return new WP_REST_Response(array_merge(array('ready' => true), $cc)); }
  $now = time(); $since = $now - $days * 86400; $cut30 = $now - 30 * 86400; $cut60 = $now - 60 * 86400;
  $likes = array(); $params = array();
  foreach (array_keys($allAliases) as $a) { $likes[] = 'body LIKE %s'; $params[] = '%' . $wpdb->esc_like($a) . '%'; }
  $where = '(' . implode(' OR ', $likes) . ') AND ts >= ' . intval($since);
  $rows = $wpdb->get_results($wpdb->prepare("SELECT ts, body FROM $t WHERE $where ORDER BY ts DESC LIMIT 20000", $params));
  $wk = array(); $r30 = array(); $p30 = array(); $tot = array(); $allWeeks = array();
  foreach ((array) $rows as $r) {
    $ts = (int) $r->ts; $monday = $ts - ((int) gmdate('N', $ts) - 1) * 86400; $wkk = gmdate('Y-m-d', $monday);
    foreach ($cos as $c) {
      if (!karp_match_aliases($r->body, $c['al'])) continue;
      $nm = $c['n'];
      if (!isset($wk[$nm])) $wk[$nm] = array();
      $wk[$nm][$wkk] = isset($wk[$nm][$wkk]) ? $wk[$nm][$wkk] + 1 : 1;
      $allWeeks[$wkk] = 1;
      $tot[$nm] = isset($tot[$nm]) ? $tot[$nm] + 1 : 1;
      if ($ts >= $cut30) $r30[$nm] = isset($r30[$nm]) ? $r30[$nm] + 1 : 1;
      elseif ($ts >= $cut60) $p30[$nm] = isset($p30[$nm]) ? $p30[$nm] + 1 : 1;
    }
  }
  ksort($allWeeks); $weekKeys = array_keys($allWeeks);
  $out = array();
  foreach ($cos as $c) {
    $nm = $c['n']; if (empty($tot[$nm])) continue;
    $weeks = array(); foreach ($weekKeys as $k) { $weeks[] = isset($wk[$nm][$k]) ? $wk[$nm][$k] : 0; }
    $out[] = array('n' => $nm, 'total' => intval($tot[$nm]), 'recent' => intval(isset($r30[$nm]) ? $r30[$nm] : 0), 'prior' => intval(isset($p30[$nm]) ? $p30[$nm] : 0), 'weeks' => $weeks);
  }
  usort($out, function ($a, $b) { return $b['total'] - $a['total']; });
  $resp = array('weekKeys' => $weekKeys, 'topics' => $out, 'days' => $days);
  set_transient($ckey, $resp, 2 * HOUR_IN_SECONDS);
  return new WP_REST_Response(array_merge(array('ready' => true), $resp));
}

// /wp-json/karp/v1/topwords?days=30 → { ready, words:[{w,n}] } — algengustu orð í fyrirsögnum (Í umræðunni). Cache 1 klst.
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/topwords', array(
    array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'karp_topwords_get'),
  ));
});
function karp_topwords_get($req) {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_REST_Response(array('ready' => false, 'words' => array()));
  $days = min(120, max(3, intval($req->get_param('days')) ?: 30));
  $ckey = 'karp_topwords_v3_' . $days; // v3: víkkaður stopword-listi (+ töluorð/myndir/o.fl.)
  $cached = get_transient($ckey);
  if ($cached !== false) return new WP_REST_Response(array('ready' => true, 'days' => $days, 'cached' => true, 'words' => $cached));
  $since = time() - $days * 86400;
  $rows = $wpdb->get_results($wpdb->prepare("SELECT title FROM $t WHERE ts >= %d ORDER BY ts DESC LIMIT 6000", $since));
  $stop = karp_news_stopwords();
  $wc = array();
  foreach ((array) $rows as $r) {
    $lc = function_exists('mb_strtolower') ? mb_strtolower($r->title, 'UTF-8') : strtolower($r->title);
    $toks = preg_split('/[^\p{L}0-9]+/u', $lc, -1, PREG_SPLIT_NO_EMPTY);
    foreach ((array) $toks as $w) {
      if ((function_exists('mb_strlen') ? mb_strlen($w) : strlen($w)) < 4) continue;
      if (isset($stop[$w])) continue;
      $wc[$w] = isset($wc[$w]) ? $wc[$w] + 1 : 1;
    }
  }
  arsort($wc);
  $words = array(); $i = 0;
  foreach ($wc as $w => $n) { if ($i++ >= 60 || $n < 3) break; $words[] = array('w' => $w, 'n' => (int) $n); }
  set_transient($ckey, $words, HOUR_IN_SECONDS);
  return new WP_REST_Response(array('ready' => true, 'days' => $days, 'cached' => false, 'words' => $words));
}

// /wp-json/karp/v1/yearreview → { ready, year, total, scored, months:[{m,n,scored,idx}], bySource:[{s,n}], best, worst }
// Heildaryfirlit fréttasafnsins 2026: magn + tónn eftir mánuðum (allt safnið, ekki eftir aðila). Cache 6 klst.
add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/yearreview', array(
    array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'karp_yearreview_get'),
  ));
});
function karp_yearreview_get($req) {
  global $wpdb; $t = karp_news_table();
  if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return new WP_REST_Response(array('ready' => false, 'months' => array()));
  $ckey = 'karp_yearreview_2026_v1';
  $fresh = ($req->get_param('fresh') && karp_score_authed($req));
  if (!$fresh) { $cc = get_transient($ckey); if ($cc !== false) return new WP_REST_Response(array_merge(array('ready' => true, 'cached' => true), $cc)); }
  $start = gmmktime(0, 0, 0, 1, 1, 2026); $end = gmmktime(0, 0, 0, 1, 1, 2027);
  $rows = $wpdb->get_results($wpdb->prepare("SELECT ts, sentiment, source FROM $t WHERE ts >= %d AND ts < %d", $start, $end));
  $mo = array(); $src = array(); $total = 0; $scored = 0;
  foreach ((array) $rows as $r) {
    $ts = (int) $r->ts; $k = gmdate('Y-m', $ts);
    if (!isset($mo[$k])) $mo[$k] = array('n' => 0, 'ss' => 0, 'sn' => 0);
    $mo[$k]['n']++; $total++;
    if ($r->sentiment !== null) { $mo[$k]['ss'] += intval($r->sentiment); $mo[$k]['sn']++; $scored++; }
    $s = $r->source ? $r->source : '—'; $src[$s] = isset($src[$s]) ? $src[$s] + 1 : 1;
  }
  ksort($mo);
  $months = array(); $best = null; $worst = null;
  foreach ($mo as $k => $v) {
    $idx = $v['sn'] ? (int) round($v['ss'] / $v['sn'] * 100) : null;
    $months[] = array('m' => $k, 'n' => intval($v['n']), 'scored' => intval($v['sn']), 'idx' => $idx);
    if ($idx !== null && $v['sn'] >= 50) {
      if ($best === null || $idx > $best['idx']) $best = array('m' => $k, 'idx' => $idx);
      if ($worst === null || $idx < $worst['idx']) $worst = array('m' => $k, 'idx' => $idx);
    }
  }
  arsort($src); $bySource = array(); $i = 0;
  foreach ($src as $s => $n) { if ($i++ >= 8) break; $bySource[] = array('s' => $s, 'n' => (int) $n); }
  $resp = array('year' => 2026, 'total' => $total, 'scored' => $scored, 'months' => $months, 'bySource' => $bySource, 'best' => $best, 'worst' => $worst);
  set_transient($ckey, $resp, 6 * HOUR_IN_SECONDS);
  return new WP_REST_Response(array_merge(array('ready' => true, 'cached' => false), $resp));
}
