<?php
/**
 * KARP — leyfa .txt (og .json) upphleðslu í WordPress myndasafnið.
 * Settu þetta í NÝTT WPCode-snippet:  Code Type = "PHP Snippet",
 * Insertion = "Auto Insert" / "Run Everywhere", og ýttu á Activate.
 * (EKKI hafa <?php taggann með ef WPCode bætir honum sjálfkrafa við — sumar
 *  útgáfur vilja kóðann án opnunar-taggans. Ef villa kemur, fjarlægðu línuna "<?php".)
 */

// 1) Bæta .txt og .json á lista yfir leyfðar skráartýpur.
add_filter( 'upload_mimes', function ( $mimes ) {
	$mimes['txt']  = 'text/plain';
	$mimes['json'] = 'application/json';
	return $mimes;
} );

// 2) Láta "raunverulega skráartýpu"-prófun WordPress samþykkja þær líka
//    (annars getur upphleðsla fallið með "file type does not match").
add_filter( 'wp_check_filetype_and_ext', function ( $data, $file, $filename, $mimes ) {
	if ( ! empty( $data['ext'] ) && ! empty( $data['type'] ) ) {
		return $data; // þegar samþykkt
	}
	$ext = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
	if ( 'txt' === $ext ) {
		$data['ext']  = 'txt';
		$data['type'] = 'text/plain';
	} elseif ( 'json' === $ext ) {
		$data['ext']  = 'json';
		$data['type'] = 'application/json';
	}
	return $data;
}, 10, 4 );
