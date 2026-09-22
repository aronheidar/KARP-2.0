// cto_verkflaedi.mjs — öryggisreglur CTO-verkflæðisins (.github/workflows/cto.yml), lesnar úr þáttaðri
// YAML. Engin CI-athugun las verkflæðisskrár áður, svo breyting á þeim hafði enga sönnun (21.9).
// Reglurnar lýsa MÖRKUNUM, ekki útfærslunni:
//   · job sem keyrir líkanið hefur ekkert leyndarmál nema ANTHROPIC_API_KEY, les-aðgang einan og engin
//     vistuð git-skilríki;
//   · job sem keyrir kóða úr repo-inu eða patchinu hefur ekkert leyndarmál og les-aðgang einan;
//   · job sem hefur skrifaðgang eða admin-lykil keyrir hvorki líkanið né kóða úr repo-inu, nema
//     grunnútgáfu síunnar — og hana ÁÐUR en nokkru er beitt;
//   · ekkert `${{ }}` inni í `run:` — gildi fara um env, annars verður texti úr beiðninni að skeljarkóða;
//   · farmur atburðarins fer ALDREI í `env:`/`with:` nema númer beiðnarinnar: GitHub prentar env-gildi
//     í opinbera keyrsluskrá, og farmurinn ber lykil og texta (rýnin 22.9);
//   · engin réttindi á workflow-stigi (hvert job tilgreinir sín).
// Tvær reglur ná til ALLRA workflow, ekki aðeins cto.yml: likanBrot (fyrsta reglan hér að ofan) og
// skyndiminniBrot (ekkert job með réttindi endurheimtir skyndiminni).
// Hrein eining: tekur hlutinn sem js-yaml skilar.

const SIA = 'skriptur/lib/cto_sia.mjs';
const skref = (job) => (Array.isArray(job && job.steps) ? job.steps : []).filter(Boolean);
const runStrengir = (job) => skref(job).map((s) => String(s.run || ''));
// „claude -p" eitt og sér missti af `claude --print`, tvöföldu bili og umbúðum. Hvert merki telst.
const keyrirLikan = (job) => runStrengir(job).some((r) => /(^|\s)claude\s[^\n]*?(-p\b|--print\b)|bypassPermissions|@anthropic-ai\/claude-code/.test(r));
const leyndarmal = (job) => [...new Set((JSON.stringify(job || {}).match(/secrets\.[A-Z0-9_]+/g) || []).map((s) => s.slice(8)))];
const checkoutSkref = (job) => skref(job).filter((s) => /^actions\/checkout@/.test(String(s.uses || '')));
// Kóði á vélinni: checkout, klón eða sótt artifact. ⚠ Rýnin 22.9: að krefjast checkout slapp framhjá
//   `git clone … && npm ci`.
const hefurKoda = (job) => checkoutSkref(job).length > 0
  || skref(job).some((s) => /^actions\/download-artifact@/.test(String(s.uses || '')))
  || runStrengir(job).some((r) => /(^|[\s;&|(])(git clone|gh repo clone)\s/.test(r));
// Túlkur keyrður á skrá (ekki -e/-c): node, bash, sh, python, deno, ruby, perl.
const skriptur = (job) => runStrengir(job).flatMap((r) => [...r.matchAll(/(^|[\s;&|(])(node|bash|sh|python3?|deno|ruby|perl)\s+(?!-[epc]\b)(\S+)/g)]
  .map((m) => m[3].replace(/^["']|["']$/g, '')));
const pakkastjori = (job) => runStrengir(job).some((r) => /(^|[\s;&|(])(npm|npx|pnpm|yarn|bun|bunx)\s/.test(r.replace(/npm i -g @anthropic-ai\/claude-code/g, '')));
// Kóði úr repo-inu keyrir: pakkastjóri (hvar sem er — hann sækir og keyrir kóða), eða túlkur á skrá þar
// sem kóði er á vélinni, nema grunnútgáfa síunnar. Án kóða á vélinni keyrir túlkur aðeins það sem
// skrefið skrifaði sjálft.
const keyrirRepoKoda = (job) => pakkastjori(job) || (hefurKoda(job) && skriptur(job).some((f) => f !== SIA));

/** Réttindi jobs; `permissions` á job-stigi ræður, annars workflow-stigið. */
function rettindi(wf, job) {
  const p = job && Object.prototype.hasOwnProperty.call(job, 'permissions') ? job.permissions : wf && wf.permissions;
  if (p == null) return { sjalfgefid: true };            // ekkert tilgreint = sjálfgefin réttindi (oft skrifaðgangur)
  if (typeof p === 'string') return { allt: p };         // read-all / write-all
  return p;
}
const skrifar = (r) => !!(r.sjalfgefid || r.allt === 'write-all' || Object.values(r).some((v) => v === 'write'));

/** Farmur í env/with: aðeins client_payload.ticket má standa þar. */
function farmurIEnv(hlutur) {
  const t = JSON.stringify(hlutur || {});
  const brot = [];
  for (const m of t.matchAll(/github\.event\.client_payload(\.[A-Za-z0-9_]+)?/g)) if (m[1] !== '.ticket') brot.push(m[0]);
  if (/github\.event\s*\[/.test(t)) brot.push('github.event[…]');   // rýnin 22.9: hornklofaritháttur
  if (/toJSON\(\s*github\.event|toJson\(\s*github\.event/i.test(t)) brot.push('toJson(github.event)');
  if (/\binputs\.verk\b|github\.event\.inputs/.test(t)) brot.push('inputs.verk');
  // ⚠ Rýnin 22.9: úttak annars job-s í env prentast líka. Fyrsta skiptingin sendi promptið þannig á milli
  //   (base64 er engin vörn), og allur texti beiðninnar lá í opinberri skrá.
  for (const m of t.matchAll(/needs\.[A-Za-z0-9_-]+\.outputs\.[A-Za-z0-9_-]+/g)) brot.push(m[0]);
  return brot;
}

/**
 * Skyndiminni í job með réttindi, í HVAÐA workflow sem er (rýnin 22.9). CTO-keyrslurnar keyra ótraustan
 * kóða (líkanið, og kóða úr patchinu í profa) í skyndiminnis-umfangi sjálfgefnu greinarinnar, og það sem
 * vistað er þar getur hver keyrsla á hvaða grein sem er endurheimt. `permissions:` stýrir því ekki. Job
 * með skrifaðgang eða leyndarmál má því ekki endurheimta skyndiminni, annars væri þrískiptingin í cto.yml
 * sniðgengin um annað workflow.
 * @returns {string[]} brot — tómt ef ekkert job með réttindi endurheimtir skyndiminni
 */
export function skyndiminniBrot(wf, skra = 'workflow') {
  const brot = [];
  const wfLeyn = leyndarmal({ env: wf && wf.env });
  for (const [nafn, job] of Object.entries((wf && wf.jobs) || {})) {
    if (!skrifar(rettindi(wf, job)) && !leyndarmal(job).length && !wfLeyn.length) continue;
    for (const s of skref(job)) {
      const uses = String(s.uses || ''), w = s.with || {};
      if (/^actions\/cache(\/restore)?@/.test(uses)) brot.push(skra + ': ' + nafn + ': ' + uses + ' endurheimtir skyndiminni í job með réttindi');
      // setup-go vistar og endurheimtir sjálfgefið; hin aðeins ef `cache:` er gefið
      else if (/^actions\/setup-go@/.test(uses) ? w.cache !== false : (/^actions\/setup-[a-z]+@/.test(uses) && w.cache)) brot.push(skra + ': ' + nafn + ': ' + uses + ' með skyndiminni í job með réttindi');
    }
  }
  return brot;
}

/** Mörk job-s sem keyrir líkanið: ekkert leyndarmál nema ANTHROPIC_API_KEY (líka ekki erft af workflow-
 *  stiginu), ekki skrifaðgangur, og engin vistuð git-skilríki. */
function likanJobBrot(wf, nafn, job) {
  const brot = [];
  const onnur = [...new Set(leyndarmal(job).concat(leyndarmal({ env: wf && wf.env })))].filter((x) => x !== 'ANTHROPIC_API_KEY');
  if (onnur.length) brot.push(nafn + ': líkanið keyrir í job með leyndarmálinu ' + onnur.join(', '));
  if (skrifar(rettindi(wf, job))) brot.push(nafn + ': líkanið keyrir í job með skrifaðgang');
  for (const c of checkoutSkref(job)) if (!(c.with && c.with['persist-credentials'] === false)) brot.push(nafn + ': checkout vistar git-skilríki þar sem líkanið keyrir');
  return brot;
}

/**
 * Líkanið í HVAÐA workflow sem er (22.9). markadsefni.yml keyrði Claude í sama job og POSTIZ_API_KEY og
 * KARP_ADMIN_KEY, á skrefum á eftir líkaninu, sama mynstur og cto.yml var lagað frá. Þessi regla nær því
 * til allra workflow, svo næsta workflow sem keyrir líkanið fái mörkin frá byrjun.
 * @returns {string[]} brot — tómt ef hvert job sem keyrir líkanið stenst mörkin
 */
export function likanBrot(wf, skra = 'workflow') {
  const brot = [];
  for (const [nafn, job] of Object.entries((wf && wf.jobs) || {}))
    if (keyrirLikan(job)) for (const b of likanJobBrot(wf, nafn, job)) brot.push(skra + ': ' + b);
  return brot;
}

/** @returns {string[]} brot á reglunum — tómt ef allt stenst */
export function ctoBrot(wf) {
  const brot = [];
  const jobs = (wf && wf.jobs) || {};
  const wr = rettindi(wf, {});
  if (wr.sjalfgefid) brot.push('workflow: engin permissions á workflow-stigi (sjálfgefin réttindi erfast)');
  else if (skrifar(wr)) brot.push('workflow: skrifaðgangur á workflow-stigi erfist til allra job-a');
  for (const f of farmurIEnv(wf && wf.env)) brot.push('workflow: ' + f + ' í env prentast í opinbera keyrsluskrá');
  for (const [nafn, job] of Object.entries(jobs)) {
    const r = rettindi(wf, job), leyn = leyndarmal(job), likan = keyrirLikan(job), repoKodi = keyrirRepoKoda(job);
    for (const s of runStrengir(job)) if (/\$\{\{/.test(s)) { brot.push(nafn + ': ${{ }} inni í run — gildi eiga að fara um env'); break; }
    const envHlutar = [job && job.env, job && job.outputs].concat(skref(job).map((s) => [s.env, s.with]));
    for (const f of new Set(farmurIEnv(envHlutar))) brot.push(nafn + ': ' + f + ' í env/with/outputs prentast í opinbera keyrsluskrá');
    if (likan) {
      brot.push(...likanJobBrot(wf, nafn, job));
    } else if (repoKodi) {
      if (leyn.length) brot.push(nafn + ': kóði úr repo-inu keyrir í job með leyndarmálinu ' + leyn.join(', '));
      if (skrifar(r)) brot.push(nafn + ': kóði úr repo-inu keyrir í job með skrifaðgang');
    }
    if ((skrifar(r) || leyn.includes('KARP_ADMIN_KEY')) && hefurKoda(job)) {
      const runs = runStrengir(job).join('\n');
      const sia = runs.indexOf(SIA), beita = runs.indexOf('git apply');
      if (beita >= 0 && (sia < 0 || sia > beita)) brot.push(nafn + ': patchinu beitt áður en sían keyrir');
    }
  }
  return brot;
}
