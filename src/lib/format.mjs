// format.mjs — pure Icelandic formatting helpers. No DOM, no globals.
// Faithful to dashboard.html: esc (l.3698), fmt (l.3702), MON (l.2035),
// thousands-group (fmtN l.3447). Extracted 2026-07-01 (#2 Á1).

export const MON      = ['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des'];
export const MON_LONG = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];

// HTML-escape — nákvæmlega eins og esc() í mælaborðinu.
export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Íslenskur tugabrotsstafur: "3.5" → "3,5".
export const fmt = (n) => String(n).replace('.', ',');

// Þúsundataglaskil með punkti: 1234567 → "1.234.567".
export const groupThousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Heiltala með íslenskum þúsundaskilum + tugabrot með kommu: 1234.5 → "1.234,5".
export const fmtNum = (n, dec = 1) => {
  const s = Number(n).toFixed(dec);
  const [int, frac] = s.split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec > 0 ? g + ',' + frac : g;
};

// Hagstofu-mánuðarlykill → læsilegt: "2026M06" → "jún 2026". (Notað í Á0.)
export const monthLabel = (t) => {
  const m = /^(\d{4})M(\d{2})$/.exec(String(t));
  return m ? `${MON[+m[2] - 1]} ${m[1]}` : String(t);
};
