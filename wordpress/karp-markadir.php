<?php
/**
 * KARP Markaðir — LIVE Nasdaq Iceland + gengi krónunnar frá Yahoo Finance.
 * Uppsetning: NÝTT WPCode PHP-snippet (Run Everywhere / Auto Insert). SLEPPA fyrstu línunni <?php í WPCode.
 * Endapunktur:  /wp-json/karp/v1/markadir  → { updated, live, indices, stocks, fx }
 * Sækir Yahoo v8 chart per tákn server-megin (engin crumb þörf, same-origin fyrir embed), transient-cache 20 mín.
 * Ríkisskuldabréf (RIKB/RIKS) eru EKKI á Yahoo — þau haldast bökuð í mælaborðinu.
 */

add_action('rest_api_init', function () {
  register_rest_route('karp/v1', '/markadir', array(
    'methods'             => 'GET',
    'permission_callback' => '__return_true',
    'callback'            => 'karp_markadir_callback',
  ));
});

function karp_markadir_catalog() {
  return array(
    // Yahoo-tákn => birtingarnafn. Hlutabréf fá ".IC" viðskeyti sjálfkrafa.
    'indices' => array('^OMXIPI' => 'OMXIPI — Heildarvísitala', '^OMXI15' => 'OMXI15 — Úrvalsvísitala'),
    'stocks'  => array(
      'ARION'=>'Arion banki','ISB'=>'Íslandsbanki','KVIKA'=>'Kvika banki','ALVO'=>'Alvotech',
      'AMRQ'=>'Amaroq Minerals','BRIM'=>'Brim','EIM'=>'Eimskip','EIK'=>'Eik fasteignafélag',
      'FESTI'=>'Festi','HAGA'=>'Hagar','HAMP'=>'Hampiðjan','ICEAIR'=>'Icelandair','KALD'=>'Kaldalón',
      'NOVA'=>'Nova','REITIR'=>'Reitir','SJOVA'=>'Sjóvá','SKEL'=>'Skel','SIMINN'=>'Síminn',
      'SOLID'=>'Solid Clouds','SVN'=>'Síldarvinnslan','SYN'=>'Sýn','VIS'=>'VÍS',
    ),
    'fx' => array(
      'EURISK=X'=>'Evra (EUR)','USDISK=X'=>'Bandaríkjadalur (USD)','GBPISK=X'=>'Sterlingspund (GBP)',
      'DKKISK=X'=>'Dönsk króna (DKK)','NOKISK=X'=>'Norsk króna (NOK)','SEKISK=X'=>'Sænsk króna (SEK)',
    ),
    'crypto' => array('BTC-USD'=>'Bitcoin','ETH-USD'=>'Ethereum','XRP-USD'=>'XRP','SOL-USD'=>'Solana','DOGE-USD'=>'Dogecoin','ADA-USD'=>'Cardano'),
    'metals' => array('GC=F'=>'Gull','SI=F'=>'Silfur','PL=F'=>'Platína'),
  );
}

function karp_markadir_fetch($ysym) {
  $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($ysym) . '?range=1mo&interval=1d';
  $r = wp_remote_get($url, array('timeout' => 6, 'redirection' => 3,
    'headers' => array('User-Agent' => 'Mozilla/5.0 (compatible; KARP-Hagvisir/1.0; +https://www.karp.is)', 'Accept' => 'application/json')));
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) != 200) return null;
  $j = json_decode(wp_remote_retrieve_body($r), true);
  if (!$j || empty($j['chart']['result'][0])) return null;
  $res  = $j['chart']['result'][0];
  $meta = isset($res['meta']) ? $res['meta'] : array();
  $price = isset($meta['regularMarketPrice']) ? $meta['regularMarketPrice'] : null;
  if ($price === null) return null;
  $hist = array();
  if (!empty($res['indicators']['quote'][0]['close'])) {
    foreach ($res['indicators']['quote'][0]['close'] as $v) { if ($v !== null) $hist[] = round((float)$v, 4); }
  }
  // Dagsbreyting: previousClose (gærlokun) fyrst; annars næst-síðasta dagslokun úr ferlinum;
  // chartPreviousClose er range-bundið (lokun fyrir 1 mán) svo aðeins þrautavari — annars sýnist mánaðarbreyting.
  $prev = isset($meta['previousClose']) ? $meta['previousClose'] : null;
  if ($prev === null && count($hist) >= 2) $prev = $hist[count($hist) - 2];
  if ($prev === null && isset($meta['chartPreviousClose'])) $prev = $meta['chartPreviousClose'];
  $chg = ($prev && $prev != 0) ? round(($price - $prev) / $prev * 100, 2) : 0;
  return array('price' => (float)$price, 'chgPct' => $chg, 'cur' => (isset($meta['currency']) ? $meta['currency'] : 'ISK'), 'hist' => $hist);
}

function karp_markadir_callback($req) {
  $cached = get_transient('karp_markadir_v2');
  if ($cached !== false) return new WP_REST_Response($cached);

  $cat = karp_markadir_catalog();
  $out = array('updated' => current_time('c'), 'live' => true, 'indices' => array(), 'stocks' => array(), 'fx' => array(), 'crypto' => array(), 'metals' => array());

  foreach ($cat['indices'] as $sym => $name) {
    $d = karp_markadir_fetch($sym);
    if ($d) $out['indices'][] = array('sym'=>$sym, 'name'=>$name, 'price'=>$d['price'], 'chgPct'=>$d['chgPct'], 'cur'=>$d['cur'], 'hist'=>$d['hist']);
  }
  foreach ($cat['stocks'] as $sym => $name) {
    $d = karp_markadir_fetch($sym . '.IC');
    if ($d) $out['stocks'][] = array('sym'=>$sym, 'name'=>$name, 'price'=>$d['price'], 'chgPct'=>$d['chgPct'], 'cur'=>$d['cur'], 'hist'=>$d['hist']);
  }
  foreach ($cat['fx'] as $sym => $name) {
    $d = karp_markadir_fetch($sym);
    if ($d) $out['fx'][] = array('sym'=>$sym, 'name'=>$name, 'price'=>$d['price'], 'chgPct'=>$d['chgPct'], 'cur'=>'ISK', 'hist'=>$d['hist']);
  }
  foreach ($cat['crypto'] as $sym => $name) {
    $d = karp_markadir_fetch($sym);
    if ($d) $out['crypto'][] = array('sym'=>$sym, 'name'=>$name, 'price'=>$d['price'], 'chgPct'=>$d['chgPct'], 'cur'=>$d['cur'], 'hist'=>$d['hist']);
  }
  foreach ($cat['metals'] as $sym => $name) {
    $d = karp_markadir_fetch($sym);
    if ($d) $out['metals'][] = array('sym'=>$sym, 'name'=>$name, 'price'=>$d['price'], 'chgPct'=>$d['chgPct'], 'cur'=>$d['cur'], 'hist'=>$d['hist']);
  }

  // Ef næst sambærilega lítið (Yahoo lokað/hægt) → stutt cache svo við reynum fljótt aftur.
  $ttl = (count($out['stocks']) >= 4) ? 20 * MINUTE_IN_SECONDS : 3 * MINUTE_IN_SECONDS;
  set_transient('karp_markadir_v2', $out, $ttl);
  return new WP_REST_Response($out);
}
