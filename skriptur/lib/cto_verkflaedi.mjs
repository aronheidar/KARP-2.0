// cto_verkflaedi.mjs — öryggisreglur CTO-verkflæðisins (.github/workflows/cto.yml), lesnar úr þáttaðri
// YAML. Engin CI-athugun las verkflæðisskrár áður, svo breyting á þeim hafði enga sönnun (21.9).
// Reglurnar lýsa MÖRKUNUM, ekki útfærslunni:
//   · job sem keyrir líkanið (`claude -p`) hefur ekkert leyndarmál nema ANTHROPIC_API_KEY, les-aðgang
//     einan og engin vistuð git-skilríki;
//   · job sem keyrir kóða úr repo-inu eða patchinu (npm/npx) hefur ekkert leyndarmál og les-aðgang einan;
//   · job sem hefur skrifaðgang eða admin-lykil keyrir hvorki líkanið né npm/npx, og keyrir engar
//     node-skriptur úr repo-inu nema síuna — og hana ÁÐUR en nokkru er beitt;
//   · ekkert `${{ }}` inni í `run:` — gildi fara um env, annars verður texti úr beiðninni að skeljarkóða;
//   · engin réttindi á workflow-stigi (hvert job tilgreinir sín).
// Hrein eining: tekur hlutinn sem js-yaml skilar.

const SIA = 'skriptur/lib/cto_sia.mjs';
const skref = (job) => (Array.isArray(job && job.steps) ? job.steps : []).filter(Boolean);
const runStrengir = (job) => skref(job).map((s) => String(s.run || ''));
// ⚠ Rýnin 22.9: „claude -p" eitt og sér missti af `claude --print`, tvöföldu bili og umbúðum. Hvert
//   merki um líkanið telst: skipunin, uppsetning pakkans eða heimildarhamurinn.
const keyrirLikan = (job) => runStrengir(job).some((r) => /(^|\s)claude\s[^\n]*?(-p\b|--print\b)|bypassPermissions|@anthropic-ai\/claude-code/.test(r));
const leyndarmal = (job) => [...new Set((JSON.stringify(job || {}).match(/secrets\.[A-Z0-9_]+/g) || []).map((s) => s.slice(8)))];
const checkoutSkref = (job) => skref(job).filter((s) => /^actions\/checkout@/.test(String(s.uses || '')));
const nodeSkriptur = (job) => runStrengir(job).flatMap((r) => [...r.matchAll(/(^|[\s;&|(])node\s+(?!-[ep]\b)(\S+)/g)].map((m) => m[2].replace(/^["']|["']$/g, '')));
// Kóði úr repo-inu keyrir: pakkastjóri (npm/npx/pnpm/yarn/bun), eða node-skripta — nema grunnútgáfa
// síunnar. Án checkout er ekkert repo á vélinni, og þá getur node aðeins keyrt það sem skrefið skrifaði.
const keyrirRepoKoda = (job) => checkoutSkref(job).length > 0 && (
  runStrengir(job).some((r) => /(^|[\s;&|(])(npm|npx|pnpm|yarn|bun|bunx)\s/.test(r.replace(/npm i -g @anthropic-ai\/claude-code/g, '')))
  || nodeSkriptur(job).some((f) => f !== SIA));

/** Réttindi jobs; `permissions` á job-stigi ræður, annars workflow-stigið. */
function rettindi(wf, job) {
  const p = job && Object.prototype.hasOwnProperty.call(job, 'permissions') ? job.permissions : wf && wf.permissions;
  if (p == null) return { sjalfgefid: true };            // ekkert tilgreint = sjálfgefin réttindi (oft skrifaðgangur)
  if (typeof p === 'string') return { allt: p };         // read-all / write-all
  return p;
}
const skrifar = (r) => !!(r.sjalfgefid || r.allt === 'write-all' || Object.values(r).some((v) => v === 'write'));

/** @returns {string[]} brot á reglunum — tómt ef allt stenst */
export function ctoBrot(wf) {
  const brot = [];
  const jobs = (wf && wf.jobs) || {};
  const wr = rettindi(wf, {});
  if (wr.sjalfgefid) brot.push('workflow: engin permissions á workflow-stigi (sjálfgefin réttindi erfast)');
  else if (skrifar(wr)) brot.push('workflow: skrifaðgangur á workflow-stigi erfist til allra job-a');
  for (const [nafn, job] of Object.entries(jobs)) {
    const r = rettindi(wf, job), leyn = leyndarmal(job), likan = keyrirLikan(job), pakkar = keyrirRepoKoda(job);
    for (const s of runStrengir(job)) if (/\$\{\{/.test(s)) { brot.push(nafn + ': ${{ }} inni í run — gildi eiga að fara um env'); break; }
    if (likan) {
      const onnur = leyn.filter((x) => x !== 'ANTHROPIC_API_KEY');
      if (onnur.length) brot.push(nafn + ': líkanið keyrir í job með leyndarmálinu ' + onnur.join(', '));
      if (skrifar(r)) brot.push(nafn + ': líkanið keyrir í job með skrifaðgang');
      for (const c of checkoutSkref(job)) if (!(c.with && c.with['persist-credentials'] === false)) brot.push(nafn + ': checkout vistar git-skilríki þar sem líkanið keyrir');
    } else if (pakkar) {
      if (leyn.length) brot.push(nafn + ': kóði úr repo-inu keyrir í job með leyndarmálinu ' + leyn.join(', '));
      if (skrifar(r)) brot.push(nafn + ': kóði úr repo-inu keyrir í job með skrifaðgang');
    }
    if (skrifar(r) || leyn.includes('KARP_ADMIN_KEY')) {
      if (checkoutSkref(job).length) {
        const adrar = nodeSkriptur(job).filter((f) => f !== SIA);
        if (adrar.length) brot.push(nafn + ': job með skrifaðgang eða admin-lykil keyrir skriptu úr repo-inu: ' + adrar.join(', '));
        const runs = runStrengir(job).join('\n');
        const sia = runs.indexOf(SIA), beita = runs.indexOf('git apply');
        if (beita >= 0 && (sia < 0 || sia > beita)) brot.push(nafn + ': patchinu beitt áður en sían keyrir');
      }
    }
  }
  return brot;
}
