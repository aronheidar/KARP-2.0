// samningar.mjs — HREIN eining: samningsbundinn aðgangur. Fyrirtæki sem semur við Karp utan Áskels
// (fast mánaðargjald, reikningur) fær réttindi fyrir starfsfólk sitt HÉÐAN, ekki úr sub_service.
//
// ⚠⚠ AF HVERJU EKKI sub_service. Stjórnborðið (worker/stjornbord.mjs) telur hverja virka röð þar á
//    listaverði í MRR og vistar töluna í daglegri MRR-sögu, og fjármálasamstemmingin (lib/fjarmal.mjs)
//    ber þær raðir saman við Áskel. Tíu starfsmenn Allt yrðu 39.000 kr „tekjur" sem berast aldrei um
//    Áskel. Samningurinn á sína eigin tölu (mánaðargjaldið), og hún er ekki listaverð.
// ⚠ AF HVERJU EKKI firma-account (parent_account_id). Meðlimir þar erfa ÞREP eigandans, og eigandinn
//    telst aðeins virkur með greitt þrep eða free_access. Hvort tveggja lekur: KYC, topplistar og
//    lobbývaktin gáta á accountOwner(), svo free_access á eiganda opnaði allt það fyrir alla meðlimi.
//    Samningur Allt nær til fasteignamatsins eins.
// ⚠ Engin I/O, ekkert Date.now(). `nu` (unix-sekúndur) kemur frá kallanda svo prófin séu föst í tíma.

/**
 * Lokaður listi. Nýr samningur kemur inn HÉR og hvergi annars staðar (sama regla og EMBED_LEN).
 * Notandi tengist samningi um dálkinn `users.samningur` (migration 0018), sem aðeins D1-skrift setur.
 *   nafn        — birt á Mitt svæði og á stjórnborði
 *   stutt       — nafn stofunnar í boðspóstinum („{{stofa}} og Karp gerðu samning…")
 *   thjonustur  — þjónustur sem samningurinn veitir, ótakmarkað (sama heiti og sub_service.service)
 *   tengilidur  — hver hjá Karp á sambandið; svör við boðspóstinum fara þangað (Reply-To), ekki í
 *                 hjálparborðið, því pósturinn er undirritaður af honum og segir „láttu mig vita"
 *   fra         — dagsetning samnings (skráning, ekki notuð í reikningi)
 *   til         — síðasti gildisdagur (UTC, að honum meðtöldum) eða null = ótímabundinn
 */
export const SAMNINGAR = {
  // Samið 17.9.2026. Frír aðgangur starfsfólks að fasteignaskýrslum (Aron: „þau fá ótakmarkaðan
  // aðgang að fasteignamatinu"), plugin á allt.is, fast mánaðargjald. ⚠ Repóið er opinbert: engin
  // nöfn starfsfólks hér. Hverjir eru á samningnum sést í D1 (users.samningur) og á stjórnborðinu.
  allt: { nafn: 'Allt fasteignasala', stutt: 'Allt', thjonustur: ['fasteign'], tengilidur: 'aron@karp.is', fra: '2026-09-17', til: null },
};

/** Virkur samningur notanda `u` á tímanum `nu`, eða null. */
export function samningurNotanda(u, nu, skra = SAMNINGAR) {
  const id = u && u.samningur;
  if (!id || !Object.prototype.hasOwnProperty.call(skra, id)) return null;
  const s = skra[id];
  if (s.til && nu > Date.parse(s.til + 'T23:59:59Z') / 1000) return null;
  return { id, nafn: s.nafn, stutt: s.stutt, thjonustur: s.thjonustur.slice(), tengilidur: s.tengilidur || null };
}

/** Þjónustur sem samningur notandans veitir núna (afrit), tómt ef enginn. */
export function samningsThjonustur(u, nu, skra = SAMNINGAR) {
  const s = samningurNotanda(u, nu, skra);
  return s ? s.thjonustur : [];
}

/** Aðgangur sem hefur aldrei fengið lykilorð (stofnaður handvirkt fyrir boð). Aðeins pbkdf2 telst lykilorð. */
export const anLykilords = (passHash) => !/^pbkdf2\$/.test(String(passHash || ''));

/** Boðshlekkurinn gildir í viku. ⚠ Sjálfgefni boðspósturinn (lib/emails.mjs 'bod') segir „í viku". */
export const BOD_GILDI_SEK = 7 * 86400;

/** Hlekkur á /endurstilla/ í boðs-ham (síðan segir „veldu lykilorð", ekki „gleymt lykilorð"). */
export const bodHlekkur = (token) => 'https://karp.is/endurstilla/?token=' + encodeURIComponent(token) + '&bod=1';

/** Fyrsta orð nafns („Ásgeir Þór Ásgeirsson" → „Ásgeir"), tómt ef ekkert nafn. */
export const fornafn = (nafn) => String(nafn || '').trim().split(/\s+/)[0] || '';

/**
 * Hvernig ein þjónustu-áskrift birtist á Mitt svæði. `u` er /me-svarið.
 * Samningsþjónusta er ótakmörkuð og henni verður ekki sagt upp af notandanum sjálfum: hún er
 * ekki í Áskeli, svo „Segja upp" gæti ekkert gert nema villa.
 * @returns {{ kvoti: string, uppsogn: boolean, samningur: string|null }}
 */
export function askriftarLina(svc, u) {
  const s = u && u.samningur;
  if (s && Array.isArray(s.thjonustur) && s.thjonustur.includes(svc)) {
    return { kvoti: 'ótakmörkuð verðmöt', uppsogn: false, samningur: s.nafn };
  }
  const q = u && u.svcQuota && u.svcQuota[svc];
  return { kvoti: q ? q.remaining + ' af ' + q.quota + ' eftir í mánuðinum' : '', uppsogn: true, samningur: null };
}
