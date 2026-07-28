// Leikslok-verðlaunapeningar/titlar. HREINT. rounds = [{round, kpis, roundScore, stability, policies, crisis}] (öll umferðar-úrslit).
export function awardMedals(rounds = []) {
  if (!rounds.length) return [];
  const s = rounds.slice().sort((a, b) => a.round - b.round);
  const final = s[s.length - 1], fk = final.kpis || {}, pol = final.policies || {};
  const num = (r, k, d) => { const v = (r.kpis || {})[k]; return typeof v === 'number' ? v : d; };
  const m = [];
  // Verðstöðugleiki nær allan leikinn
  const inflOk = s.filter((r) => { const v = num(r, 'verdbolga', 99); return v >= 1.5 && v <= 3.5; }).length;
  if (inflOk >= Math.min(6, s.length)) m.push({ icon: '🎯', title: 'Verðbólgu-baninn', desc: 'Hélt verðbólgu við markmið nær allan leikinn.' });
  // Skuldlaus ríkissjóður í lokin
  if (typeof fk.skuldir === 'number' && fk.skuldir < 45) m.push({ icon: '💰', title: 'Skuldlausi', desc: 'Skildi ríkissjóð eftir með skuldir undir 45% af VLF.' });
  // Loftslag: losun í skefjum á loftslags-árunum
  const climate = s.filter((r) => r.round >= 6);
  if (climate.length >= 2 && climate.every((r) => num(r, 'losun', 999) <= 106)) m.push({ icon: '🌱', title: 'Græna byltingin', desc: 'Hélt losun í skefjum á loftslags-árunum.' });
  // Lifði af bankahrunið (KT3) með sóma
  const kt3 = s.find((r) => r.round === 3);
  if (kt3 && (kt3.roundScore || 0) >= 55) m.push({ icon: '🛡️', title: 'Kreppu-kappinn', desc: 'Stýrði þjóðinni gegnum bankahrunið 2008 með sóma.' });
  // Naut trausts allan leikinn
  const avgApp = s.reduce((a, r) => a + ((r.stability && typeof r.stability.approval === 'number') ? r.stability.approval : 50), 0) / s.length;
  if (avgApp >= 55) m.push({ icon: '🗳️', title: 'Fólksins maður', desc: 'Naut trausts þjóðarinnar öll árin (meðal-fylgi yfir 55%).' });
  // Sjálfbær sjávarútvegur
  if (typeof fk.fiskistofn === 'number' && fk.fiskistofn >= 100) m.push({ icon: '🐟', title: 'Sjálfbæri', desc: 'Skildi fiskistofninn eftir heilbrigðan fyrir næstu kynslóð.' });
  // Byggða-jöfnuður
  if (typeof fk.byggdajofnudur === 'number' && fk.byggdajofnudur >= 100) m.push({ icon: '🗺️', title: 'Landsbyggðar-vinurinn', desc: 'Dreifði velsæld um landið allt.' });
  // Framúrskarandi heildar-árangur
  const avgScore = s.reduce((a, r) => a + (r.roundScore || 0), 0) / s.length;
  if (avgScore >= 80) m.push({ icon: '🏆', title: 'Efnahags-snillingurinn', desc: 'Framúrskarandi heildar-árangur öll kjörtímabilin.' });
  // Enginn kreppu-/uppreisnar-atburður
  const stable = s.every((r) => (!r.crisis) && (!r.stability || r.stability.level === 'stable'));
  if (stable) m.push({ icon: '⚖️', title: 'Stöðugleika-stjórnin', desc: 'Hvorki kreppa né uppreisn allan leikinn — traust og stöðug hagstjórn.' });
  // Fullveldis-val (Icesave hafnað)
  if (pol.icesave === 'reject') m.push({ icon: '🇮🇸', title: 'Fullveldis-hetjan', desc: 'Hafnaði Icesave — með þjóðinni.' });
  return m;
}
