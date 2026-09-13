// flokkar.mjs — EIN uppspretta fyrir bókstaf → flokksheiti.
//
// Áður á tveimur stöðum með ólíkri útkomu: build_spyrdu_context.js hafði töfluna harðkóðaða (og
// birti „Samfylkingin 26,2%"), meðan polls-færslan í worker.js las `j.parties` og bjóst við korti
// {S:{n:'Samfylkingin'}}. En polls.json geymir `parties` sem BERT FYLKI af stöfum — uppflettingin
// gat því aldrei heppnast og AUG-lagið féll alltaf í varaleiðina og sagði „S 26.2%".
// Spjallið sagði þannig ýmist flokksheiti eða stakan bókstaf eftir því hvort lagið svaraði.
//
// ⚠ Þetta er BIRTINGARTAFLA, ekki gagnaskrá: bókstafirnir koma úr polls.json og listi yfir flokka
//   breytist við kosningar. Bætist nýr listabókstafur við skilar heitiFlokks honum óbreyttum
//   (bókstafurinn er þá réttari en rangt nafn) — ekkert brotnar, en taflan þarf uppfærslu.
export const FLOKKAR = {
  S: 'Samfylkingin',
  D: 'Sjálfstæðisflokkurinn',
  M: 'Miðflokkurinn',
  C: 'Viðreisn',
  F: 'Flokkur fólksins',
  B: 'Framsóknarflokkurinn',
  V: 'Vinstri græn',
  J: 'Sósíalistaflokkurinn',
  P: 'Píratar',
};

/** Flokksheiti úr listabókstaf; óþekktur bókstafur skilar sér óbreyttur. */
export const heitiFlokks = (b) => FLOKKAR[b] || String(b || '');
