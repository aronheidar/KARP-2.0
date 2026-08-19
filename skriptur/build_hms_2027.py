# -*- coding: utf-8 -*-
"""
build_hms_2027.py — vinnur opinbera „Fasteignamat 2027"-pakka HMS (xlsx, handsótt af hms.is 19.8.2026,
hráskrár í gogn/hms/raw/) í þrjú létt JSON:

  web/public/gogn/hms/matssvaedi_2027.json   ← 197 matssvæði íbúðarhúsnæðis + 76 undirmatssvæði:
                                               heiti, sérbýlis-/fjölbýlisstuðull, % breyting 2027, meðalverð á m²
                                               + nákvæmni gildandi fasteignamats (fmat vs kaupverð) úr sölu-úrtakinu
  gogn/hms/matssvaedi_punktar.json           ← þynnt sölu-úrtak [x, y, matssvæði] í ISN93 (EPSG:3057) fyrir
                                               k-NN vörpun heimilisfangs → matssvæði í build_hnit.js (EKKI shippað)
  gogn/hms_fasteignamat_2027.json            ← samantektir: fjöldi + fasteignamat 2026/2027 per tegund og per
                                               sveitarfélag×tegund (fyrir /fasteignir/, SSG um @gogn)

Sölu-úrtakið (2027_gagnasafn_ibudir2.xlsx, 49.656 sölur 2021-01→2026-02, 81 dálkar) er matslíkans-gagnasafn
HMS — ekki eignagrunnur. ⚠ est/aest eru EKKI verðmöt í kr (32–41% frávik á 2026-sölum, óþekkt eining) og eru
ekki notuð. `hverfi` = matssvæðis-Nr (staðfest: 189 kóðar, allir í matssvæða-töflunni).

KEYRSLA: python skriptur/build_hms_2027.py   (openpyxl; ~40 s)   → svo: node skriptur/build_hnit.js --from-disk
"""
import os, json, glob, datetime, statistics, collections
import openpyxl
import sys
try: sys.stdout.reconfigure(encoding='utf-8')   # Windows-konsóll (cp1252) þolir ekki ⚠/→ í print
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'gogn', 'hms', 'raw')
OUT_WEB = os.path.join(ROOT, 'web', 'public', 'gogn', 'hms')
OUT_GOGN = os.path.join(ROOT, 'gogn')
os.makedirs(OUT_WEB, exist_ok=True); os.makedirs(os.path.join(ROOT, 'gogn', 'hms'), exist_ok=True)

def finna(mynstur):
    m = glob.glob(os.path.join(RAW, '*' + mynstur + '*.xlsx'))
    if not m: raise SystemExit('vantar hráskrá: ' + mynstur + ' í ' + RAW)
    return m[0]

def num(v):
    try: return None if v is None or v == '' else float(v)
    except Exception: return None

def s(v): return str(v).strip() if v is not None else ''

NU = datetime.datetime.now().isoformat(timespec='seconds')

# ── 1) Matssvæði + undirmatssvæði ─────────────────────────────────────────────
wb = openpyxl.load_workbook(finna('Matssv'), read_only=True)
svaedi = {}
for r in list(wb['Íbúðarhúsnæði'].iter_rows(values_only=True))[1:]:
    if r[0] is None: continue
    svaedi[s(r[0])] = {'heiti': s(r[1]), 'st_ser': num(r[2]), 'st_fjol': num(r[3]), 'br_ser': num(r[4]), 'br_fjol': num(r[5]), 'm2_ser': num(r[6]), 'm2_fjol': num(r[7])}
undir = {}
for r in list(wb['Íbúðarhúsnæði undirmatssv'].iter_rows(values_only=True))[1:]:
    if r[0] is None: continue
    undir[s(r[0])] = {'heiti': s(r[1]), 'st_ser': num(r[2]), 'st_fjol': num(r[3])}
print('matssvæði:', len(svaedi), '· undirmatssvæði:', len(undir))

# ── 2) Sölu-úrtakið: punktar per matssvæði (þynnt) + nákvæmni fmat ───────────
ws = openpyxl.load_workbook(finna('gagnasafn_ibudir'), read_only=True)['Sheet1']
it = ws.iter_rows(values_only=True); H = list(next(it)); ix = {h: i for i, h in enumerate(H)}
g = lambda r, k: r[ix[k]]
GRID = 100  # m — ein sala per 100 m reit per svæði dugar fyrir k-NN, þynnir 49.656 → ~fjórðung
sed = set(); punktar = []
fmat_err = []; n_alls = 0; hverfi_ekki = collections.Counter()
FRA = datetime.datetime(2025, 3, 1)
for r in it:
    n_alls += 1
    x, y, hv = num(g(r, 'x')), num(g(r, 'y')), s(g(r, 'hverfi'))
    if x and y and hv in svaedi:
        key = (hv, int(x // GRID), int(y // GRID))
        if key not in sed:
            sed.add(key); punktar.append([round(x), round(y), int(hv)])
    elif hv: hverfi_ekki[hv] += 1
    # nákvæmni gildandi fasteignamats: sölur sl. 12 mán fyrir matsdag, án nýbygginga
    d, kv, fm, ny = g(r, 'utgdag'), num(g(r, 'kaupverd')), num(g(r, 'fmat')), g(r, 'nybygging')
    if d and d >= FRA and kv and kv > 0 and fm and not ny:
        fmat_err.append(abs(fm / kv - 1))
fmat_err.sort()
q = lambda p: fmat_err[int(len(fmat_err) * p)]
nakv = {'n': len(fmat_err), 'timabil': '3/2025–2/2026', 'midgildi': round(statistics.median(fmat_err), 4), 'p75': round(q(0.75), 4),
        'innan10': round(sum(e <= 0.10 for e in fmat_err) / len(fmat_err), 4), 'innan20': round(sum(e <= 0.20 for e in fmat_err) / len(fmat_err), 4),
        'lysing': 'Gildandi fasteignamat HMS (fmat) borið saman við þinglýst kaupverð sömu eigna í sölu-úrtaki HMS fyrir fasteignamat 2027 — sölur 3/2025–2/2026 án nýbygginga. ⚠ Ekki strangt out-of-sample: fasteignamatið var kvarðað á hluta þessara sala.'}
print('sölur alls:', n_alls, '· þynntir punktar:', len(punktar), '· hverfi utan töflu:', dict(hverfi_ekki) or 'engin')
print('fmat vs kaupverð:', nakv)

with open(os.path.join(OUT_WEB, 'matssvaedi_2027.json'), 'w', encoding='utf-8') as f:
    json.dump({'updated': NU, 'heimild': 'HMS — Fasteignamat 2027: Matssvæði vefsjá, tölfræði (hms.is), handsótt 19.8.2026', 'svaedi': svaedi, 'undir': undir, 'fmat_nakvaemni': nakv}, f, ensure_ascii=False, separators=(',', ':'))
with open(os.path.join(ROOT, 'gogn', 'hms', 'matssvaedi_punktar.json'), 'w', encoding='utf-8') as f:
    json.dump({'updated': NU, 'crs': 'EPSG:3057 (ISN93 / Lambert 1993)', 'grid_m': GRID, 'n': len(punktar), 'heimild': 'HMS — 2027_gagnasafn_ibudir2.xlsx (sölu-úrtak matslíkans), x/y/hverfi', 'punktar': punktar}, f, separators=(',', ':'))

# ── 3) Samantektir: fjöldi + fasteignamat 2026/2027 ──────────────────────────
def lesa(mynstur, lyklar):
    wb = openpyxl.load_workbook(finna(mynstur), read_only=True); ws = wb[wb.sheetnames[0]]
    out = []; sidasta = ''
    for r in list(ws.iter_rows(values_only=True))[1:]:
        # sveitarfélags-dálkurinn er SAMFELLDUR (merged) í xlsx → nafnið stendur aðeins í fyrstu röð hvers hóps
        if lyklar[0] == 'sv':
            if r[0] is not None and s(r[0]): sidasta = s(r[0])
            if not sidasta or r[1] is None: continue
            r = (sidasta,) + tuple(r[1:])
        elif r[0] is None: continue
        out.append({k: (s(r[i]) if k in ('sv', 'teg', 'flokkur') else num(r[i])) for i, k in enumerate(lyklar)})
    return out
# Raðir án fjölda eru NEÐANMÁLSGREINAR í xlsx (t.d. Grindavíkur-fyrirvarinn) — haldið sem athugasemdum, ekki gögnum
athugasemdir = []
def hreinsa(rows, lykill):
    out = []
    for r in rows:
        hefurTolu = any(r.get(k) is not None for k in ('fjoldi', 'mat2026', 'mat2027'))
        if not hefurTolu and r.get(lykill) and len(r[lykill]) > 40: athugasemdir.append(r[lykill])
        elif hefurTolu: out.append(r)
    return out
byTeg = hreinsa(lesa('Eftirtegundeigna', ['teg', 'fjoldi', 'mat2026', 'mat2027', 'breyting']), 'teg')
bySvTeg = hreinsa(lesa('Sveitarf', ['sv', 'teg', 'fjoldi', 'mat2026', 'mat2027', 'breyting']), 'sv')
ibFlokkun = hreinsa(lesa('Íbúðareignireftirflokkun', ['flokkur', 'fjoldi', 'mat2026', 'mat2027', 'breyting']), 'flokkur')
atvFlokkun = hreinsa(lesa('Atvinnueignireftirflokkun', ['flokkur', 'fjoldi', 'mat2026', 'mat2027', 'breyting']), 'flokkur')
athugasemdir = list(dict.fromkeys(a.strip() for a in athugasemdir))
# „Samtals"-raðirnar í xlsx eru FORMÚLUR (=SUM…), ekki gildi → reiknum heildina sjálf úr tegundaröðunum
def samtala(rows):
    fj = sum(r['fjoldi'] or 0 for r in rows); m26 = sum(r['mat2026'] or 0 for r in rows); m27 = sum(r['mat2027'] or 0 for r in rows)
    return {'fjoldi': fj, 'mat2026': m26, 'mat2027': m27, 'breyting': round((m27 / m26 - 1) * 100, 1) if m26 else None}
byTeg = [r for r in byTeg if not r['teg'].startswith('Samtals')]
samtals = samtala(byTeg)
print('samtals (reiknað):', samtals)
print('athugasemdir úr xlsx:', athugasemdir)
with open(os.path.join(OUT_GOGN, 'hms_fasteignamat_2027.json'), 'w', encoding='utf-8') as f:
    json.dump({'updated': NU, 'heimild': 'HMS — Fasteignamat 2027, samantektir (hms.is), handsótt 19.8.2026. Mat í kr.', 'athugasemdir': athugasemdir, 'samtals': samtals, 'byTeg': byTeg, 'bySvTeg': bySvTeg, 'ibudirFlokkun': ibFlokkun, 'atvinnuFlokkun': atvFlokkun}, f, ensure_ascii=False, separators=(',', ':'))
print('samantektir: tegundir', len(byTeg), '· sveitarfélag×tegund', len(bySvTeg), '· íbúðaflokkun', len(ibFlokkun), '· atvinnuflokkun', len(atvFlokkun))
print('OK')
