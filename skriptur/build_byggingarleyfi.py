# -*- coding: utf-8 -*-
# ============================================================================
#  build_byggingarleyfi.py  —  Afgreiðslur byggingarfulltrúa RVK → byggingarleyfi.json
# ----------------------------------------------------------------------------
#  OPIN fasteignagreind: byggingarleyfi (samþykkt / synjað / frestað) úr fundar-
#  gerðum byggingarfulltrúa Reykjavíkur, LYKLAÐ Á HEIMILISFANG (engin kt —
#  GDPR ritskoðar umsækjendur → passar fasteignagreind, EKKI /fyrirtaeki/).
#  Heimild: memory/iceland-islandis-graphql-audit.md („Aðrar veitur").
#
#  Flæði:
#    1) Skrapa vísi reykjavik.is/byggingarmal/fundargerdir-byggingarfulltrua
#       → 273 PDF-slóðir (EKKI deterministic → vísirinn er sannleiksuppspretta).
#    2) pypdf → texti → splitta á „<N>. <HEIMILISFANG> - USK########" → færslur.
#    3) Staðfangaskrá (rvkdata CSV) → postnr + hnit + hverfi per heimilisfang.
#    4) Skrifa kanónískt byAddr + per-póstnúmer skrár + vakt-feed (incremental).
#
#  Keyrsla:
#    python skriptur/build_byggingarleyfi.py --audit 4   # þáttar 4 nýjustu, prentar, skrifar EKKERT
#    python skriptur/build_byggingarleyfi.py --limit 6   # full pípa en aðeins 6 fundir (prófun)
#    python skriptur/build_byggingarleyfi.py             # incremental (les seen-set); tómur seen = full bakfylling
#  Dep: pypdf (þegar í pípunni, sbr. build_logbirting.py).
# ============================================================================
import io, os, re, sys, json, time, csv, html, shutil, urllib.request, urllib.parse
from datetime import date
from collections import Counter

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GOGN = os.path.join(ROOT, 'gogn')
PUB  = os.path.join(ROOT, 'web', 'public', 'gogn')

UA    = 'Mozilla/5.0 (KARP gagnapipa; +https://karp.is; aronheidars@gmail.com)'
INDEX = 'https://reykjavik.is/byggingarmal/fundargerdir-byggingarfulltrua'
SLEEP = 0.35

DECISION_LABELS = {
    'samthykkt':   'Samþykkt',
    'jakvaett':    'Jákvæð afgreiðsla',        # fyrirspurn afgreidd jákvætt
    'synjad':      'Synjað',
    'neikvaett':   'Neikvæð afgreiðsla',       # fyrirspurn afgreidd neikvætt
    'frestad':     'Frestað',
    'visad_fra':   'Vísað frá',
    'afturkallad': 'Afturkallað',
    'afgreitt':    'Afgreitt',                 # afgreitt/staðfest (tilkynning) án já/nei
    'annad':       'Annað',
}
# Alvarleiki f. litun (2=jákvætt/grænt, 0=hlutlaust, -1=neikvætt) — notað í UI.
DECISION_SEV = {'samthykkt': 2, 'jakvaett': 2, 'synjad': -1, 'neikvaett': -1,
                'frestad': 0, 'visad_fra': -1, 'afturkallad': 0, 'afgreitt': 1, 'annad': 0}

MONTHS_FULL = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí',
               'ágúst', 'september', 'október', 'nóvember', 'desember']

def month_num(w):
    """Mánaðar-nafn (þolir hreim/stafsetningar-frávik júní/juni) → 1-12, annars None."""
    w = (w or '').lower()
    for pre, n in [('jan', 1), ('feb', 2), ('maí', 5), ('mai', 5), ('mar', 3), ('apr', 4),
                   ('jún', 6), ('jun', 6), ('júl', 7), ('jul', 7), ('ágú', 8), ('agu', 8),
                   ('sep', 9), ('okt', 10), ('nóv', 11), ('nov', 11), ('des', 12)]:
        if w.startswith(pre):
            return n
    return None

# --------------------------------------------------------------------------- net
def _get(url, tries=3):
    last = None
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return urllib.request.urlopen(req, timeout=90).read()
        except Exception as e:
            last = e; time.sleep(1.5 * (t + 1))
    raise last

def url_datekey(url):
    """Grófur dags-lykill úr slóð (til röðunar) — (ár, mán). Ekki authoritative (það er PDF-hausinn)."""
    d = urllib.parse.unquote(url)
    m = re.search(r'/(\d{4})-(\d{2})/', d)
    if m:
        return (int(m.group(1)), int(m.group(2)))
    m = re.search(r'(\d{1,2})[._\- ]+([A-Za-záðéíóúýþæö]+)[a-z]*[._\- ]+(20\d{2})', d, re.I)
    if m:
        mn = month_num(m.group(2))
        if mn:
            return (int(m.group(3)), mn)
    m = re.search(r'(20\d{2})', d)
    return (int(m.group(1)) if m else 0, 0)

def fetch_pdf_links():
    """Vísi-síða → listi (url) PDF-a byggingarfulltrúa-afgreiðslufunda, NÝJAST FYRST."""
    doc = _get(INDEX).decode('utf-8', 'replace')
    seen, out = set(), []
    for href in re.findall(r'href="([^"]+)"', doc):
        href = html.unescape(href.strip())
        if '.pdf' not in href.lower():
            continue
        if href.startswith('/'):
            href = 'https://reykjavik.is' + href
        dec = urllib.parse.unquote(href).lower()
        # Byggingarfulltrúa-afgreiðslufundir (útiloka skipulagsfulltrúa o.fl.)
        if not re.search(r'afgrei|byggingarfulltr|bygg', dec):
            continue
        if 'skipulagsfulltr' in dec:
            continue
        if href in seen:
            continue
        seen.add(href); out.append(href)
    out.sort(key=url_datekey, reverse=True)
    return out

def pdf_text(url):
    cdir = os.path.join(GOGN, '_cache', 'pdf')
    os.makedirs(cdir, exist_ok=True)
    fp = os.path.join(cdir, re.sub(r'\W+', '_', url)[-90:] + '.txt')   # PDF-ar breytast ekki → cache
    if os.path.exists(fp):
        return open(fp, encoding='utf-8').read()
    txt = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(_get(url))).pages)
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(txt)
    time.sleep(SLEEP)                              # kurteisi AÐEINS eftir raun-sókn (ekki cache-hit)
    return txt

# ----------------------------------------------------------------------- parsing
# Tvö snið byggingarfulltrúa-fundargerða (bæði byrja á „<N>. <HEIMILISFANG> …"):
#   NÝTT (2023+):  „1. Austurgerði 1 - USK26020380"
#   GAMALT (–2023): „1. Aðalstræti 10  (11.365.04) 100594 Mál nr. BN061703"
#                   (staðgreinir + fastanúmer valfrjáls; umsækjanda-lína kemur Á EFTIR → aldrei þáttuð)
# Splittað með lookahead á færslu-haus (útilokar of-splittun á „nr. 7" o.þ.h.).
ENTRY_SPLIT   = re.compile(r'(?=^[ \t]*\d{1,3}\.[ \t]+.*?(?:[-–][ \t]*USK\d|Mál[ \t]*nr))', re.M)
ENTRY_HEAD_USK = re.compile(r'^[ \t]*(\d{1,3})\.[ \t]+(.+?)[ \t]*[-–][ \t]*(USK\d[\w./-]*)', re.M)
ENTRY_HEAD_BN  = re.compile(r'^[ \t]*(\d{1,3})\.[ \t]+(.+?)'
                            r'(?:[ \t]+\(([\d.]+)\))?(?:[ \t]+(\d{4,7}))?[ \t]+Mál[ \t]*nr\.?[ \t]*(BN\d+)', re.M)
DESC_RX     = re.compile(
    r'Sótt(?:\s+er)?\s+um\s+(?:leyfi\s+til\s+að\s+|byggingarleyfi\s+til\s+að\s+|'
    r'heimild\s+til\s+að\s+|stöðuleyfi\s+til\s+að\s+)?(.+?)'
    r'(?=\n[ \t]*(?:Stækkun|Stærð|Erindi|Samþykk|Synja|Fresta|Vísað|Afturkalla|Málinu|Með vísan)|\Z)',
    re.S)
SIZE_RX = re.compile(r'(?:Stækkun|Stærð)\s*:\s*([\d.,]+)\s*ferm.*?([\d.,]+)\s*r[úu]mm', re.I | re.S)
PII_RX  = re.compile(r'\bkt\.?\s*\d{6}[-\s]?\d{4}\b', re.I)

def _decision(block):
    """Ákvörðun færslu → kóði. Fyrst línu-byrjunar-lykilorð (umsóknir), svo fyrirspurnir/tilkynningar."""
    for ln in block.split('\n'):
        s = ln.strip()
        if s.startswith('Samþykk'):    return 'samthykkt'
        if s.startswith('Synja'):      return 'synjad'
        if s.startswith('Fresta'):     return 'frestad'
        if s.startswith('Vísað frá'):  return 'visad_fra'
        if s.startswith('Afturkalla'): return 'afturkallad'
    # fyrirspurnir („Afgreitt. Jákvætt/Neikvætt") + tilkynningar („Afgreitt"/„Staðfest") + afturköllun mið-máls
    if re.search(r'\bafturköll', block, re.I):    return 'afturkallad'
    if re.search(r'\bNeikvætt\b', block):         return 'neikvaett'
    if re.search(r'\bJákvætt\b', block):          return 'jakvaett'
    if re.search(r'^[ \t]*(?:Afgreitt|Staðfest)', block, re.M): return 'afgreitt'
    return 'annad'

def num(s):
    """„35,4" / „29.0" → float; „xx.x" (óútfyllt í PDF) → None."""
    s = (s or '').strip().replace(',', '.')
    try:
        return round(float(s), 1)
    except Exception:
        return None

def clean_desc(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    s = PII_RX.sub('', s)
    return s.strip(' ,.;–—-')[:400] or None

def clean_addr(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    s = re.sub(r'^\d{1,3}\.\s*', '', s)            # öryggis-klipping á leiðandi „N. "
    s = re.sub(r',.*$', '', s)                     # strjúka auka-heiti/„, 110 Reykjavík" (horn-lóðir „Austurbakki 2, Reykjastræti 10")
    s = re.sub(r'\s*\([\d.]+\).*$', '', s)         # strjúka staðgreini „(11.365.04) …" ef leki
    s = re.sub(r'\s+[-–]\s+.+$', '', s)            # strjúka viðskeyti „ - 2.áfangi"/„ – breytingaerindi"/„ - Höfðatorg" (heldur „1-3")
    s = re.sub(r'\s+\d{4,7}$', '', s)              # strjúka aftandi fastanúmer ef leki
    return s.strip(' ,.-–—')

def parse_meeting(url, txt):
    """Skilar {fund, date, entries:[…]}."""
    head = txt[:900]
    year = None
    ym = re.search(r'Árið\s+(\d{4})', head)
    if ym: year = int(ym.group(1))
    fund = None
    fm = re.search(r'(\d{2,4})\.\s*fund', head)
    if fm: fund = int(fm.group(1))
    mdate = None
    dm = re.search(r'(\d{1,2})\.\s*([A-Za-zÁÐÉÍÓÚÝÞÆÖáðéíóúýþæö]+)', head)
    if dm and year:
        mn = month_num(dm.group(2))
        if mn:
            try:
                mdate = f'{year}-{mn:02d}-{int(dm.group(1)):02d}'
            except Exception:
                mdate = None
    if not mdate:                                   # fallback: dags úr slóð (…/2026-06/…)
        um = re.search(r'/(\d{4})-(\d{2})/', url)
        if um: mdate = f'{um.group(1)}-{um.group(2)}-01'

    entries = []
    for block in ENTRY_SPLIT.split(txt):
        addr = caseNo = fnr = None
        hm = ENTRY_HEAD_USK.search(block)
        if hm:
            addr, caseNo = clean_addr(hm.group(2)), hm.group(3).rstrip('.')
        else:
            hm = ENTRY_HEAD_BN.search(block)
            if hm:
                addr, fnr, caseNo = clean_addr(hm.group(2)), (hm.group(4) or None), hm.group(5)
        if not addr or len(addr) < 3:
            continue
        dm2  = DESC_RX.search(block)
        desc = clean_desc(dm2.group(1)) if dm2 else None
        m2 = m3 = None
        sm = SIZE_RX.search(block)
        if sm:
            m2, m3 = num(sm.group(1)), num(sm.group(2))
        code = _decision(block)
        e = {
            'addr': addr, 'caseNo': caseNo, 'fnr': fnr, 'desc': desc,
            'type': 'byggingarleyfi',
            'decision': DECISION_LABELS[code], 'decisionCode': code,
            'date': mdate, 'fund': fund,
            'sizeM2': m2, 'sizeM3': m3, 'url': url,
        }
        # PII-vörn: ekkert geymt reit má innihalda kennitölu (uppbyggingar-örugg þáttun tryggir
        # að umsækjanda-línan er aldrei tekin, en skimum samt addr+desc og sleppum ef kt lekur).
        if PII_RX.search(addr) or (desc and PII_RX.search(desc)):
            continue
        entries.append(e)
    return {'fund': fund, 'date': mdate, 'entries': entries}

# ------------------------------------------------------------------ Staðfangaskrá
# Heimilisfang → (postnr, lat, lng, hverfi) úr rvkdata/stadfangaskra_extra.
# ⚠ RVK-ONLY útgáfan (SVFNR=0000, öll Reykjavík) — permit-in eru öll RVK, og allt-landið útgáfan
#   veldur kross-bæjar árekstrum (t.d. „Borgartún 8" í Sauðárkróki lyklast á undan Reykjavík).
STADFONG_URL = 'https://raw.githubusercontent.com/rvkdata/stadfangaskra_extra/master/stadfangaskra_extra.csv'
CACHE   = os.path.join(GOGN, '_cache')
CSV_PATH = os.path.join(CACHE, 'stadfangaskra_extra.csv')

def _csv_cached(max_age_days=7):
    os.makedirs(CACHE, exist_ok=True)
    if os.path.exists(CSV_PATH) and (time.time() - os.path.getmtime(CSV_PATH)) < max_age_days * 86400:
        return CSV_PATH
    print('  sæki staðfangaskrá (~8MB)…', file=sys.stderr)
    with open(CSV_PATH, 'wb') as f:
        f.write(_get(STADFONG_URL))
    return CSV_PATH

def norm_addr(s):
    """„Bragagata 26A" / „Arnarbakki 1-3" → „bragagata 26a" / „arnarbakki 1" (lykill Staðfangaskrár)."""
    m = re.match(r'^\s*(.+?)\s+(\d+)\s*([A-Za-záðéíóúýþæö]?)', s or '')
    if not m:
        return None
    return f'{m.group(1)} {m.group(2)}{m.group(3)}'.lower().strip()

def load_stadfong():
    path = _csv_cached()
    idx = {}
    with open(path, encoding='utf-8', newline='') as f:
        r = csv.reader(f)
        H = next(r)
        need = ['POSTNR', 'HEITI_NF', 'HEITI_TGF', 'HUSNR', 'BOKST', 'N_HNIT_WGS84', 'E_HNIT_WGS84']
        col = {n: H.index(n) for n in need if n in H}
        if 'N_HNIT_WGS84' not in col or 'HEITI_NF' not in col:
            raise RuntimeError('Staðfangaskrá-dálkar fundust ekki: ' + ','.join(H[:8]))
        hv = H.index('LUKR_HVERFAHEITI_HEITI') if 'LUKR_HVERFAHEITI_HEITI' in H else -1
        for c in r:
            if len(c) < len(H) - 2:
                continue
            try:
                pn = c[col['POSTNR']].strip()
                heiti = c[col['HEITI_NF']].strip()
                husnr = c[col['HUSNR']].strip()
                lat = float(c[col['N_HNIT_WGS84']]); lng = float(c[col['E_HNIT_WGS84']])
            except Exception:
                continue
            if not (pn.isdigit() and len(pn) == 3 and heiti and husnr and 62 < lat < 67 and -25 < lng < -12):
                continue
            bokst = (c[col['BOKST']].strip().lower() if 'BOKST' in col else '')
            rec = (int(pn), round(lat, 5), round(lng, 5), (c[hv].strip() or None) if 0 <= hv < len(c) else None)
            tgf = (c[col['HEITI_TGF']].strip() if 'HEITI_TGF' in col else '')
            for nm in (heiti, tgf):                        # lykla bæði nefnifall OG þágufall → hærri hittni
                if not nm:
                    continue
                key = f'{nm} {husnr}{bokst}'.lower()
                idx.setdefault(key, rec)                   # fyrsta staðfang gildir
    return idx

# --------------------------------------------------------------------------- audit
def run_audit(n):
    links = fetch_pdf_links()
    print(f'Vísir: {len(links)} PDF-slóðir. Þátta {n} nýjustu.\n')
    tot = 0; per = {}
    for url in links[:n]:
        try:
            txt = pdf_text(url)
        except Exception as e:
            print(f'  ! PDF sókn brást: {e}\n    {url}'); continue
        mt = parse_meeting(url, txt)
        print(f'=== Fundur {mt["fund"]}  dags {mt["date"]}  ({len(mt["entries"])} færslur) ===')
        print(f'    {urllib.parse.unquote(url).split("/")[-1][:70]}')
        for e in mt['entries'][:6]:
            print(f'  [{e["decisionCode"]:11}] {e["addr"][:26]:26} {e["caseNo"]:13} '
                  f'{(str(e["sizeM2"])+"m²") if e["sizeM2"] else "-":8} {(e["desc"] or "")[:46]}')
        if len(mt['entries']) > 6:
            print(f'    … +{len(mt["entries"])-6} færslur til viðbótar')
        for e in mt['entries']:
            per[e['decisionCode']] = per.get(e['decisionCode'], 0) + 1
            tot += 1
        print()
        time.sleep(SLEEP)
    print(f'AUDIT {n} fundir: {tot} færslur alls  {per}')

# --------------------------------------------------------------------------- io
OUT   = os.path.join(GOGN, 'byggingarleyfi.json')          # kanónískt (incremental-staða; ekki þjónað)
SEEN  = os.path.join(GOGN, 'byggingarleyfi_seen.json')
META  = os.path.join(GOGN, 'byggingarleyfi_meta.json')
PN_DIRS  = [os.path.join(PUB, 'byggingarleyfi')]            # þjónað (skýrslu-neytandi)
VAKT_OUT = [os.path.join(PUB, 'byggingarleyfi_vakt.json')]  # þjónað (Byggingarvakt-síðan)

SOURCE = 'Afgreiðslufundir byggingarfulltrúa Reykjavíkur'
SOURCE_URL = 'https://reykjavik.is/byggingarmal/fundargerdir-byggingarfulltrua'
DISCLAIMER = ('Byggt á opinberum fundargerðum byggingarfulltrúa Reykjavíkur (afgreiðslur skv. mannvirkjalögum '
              'nr. 160/2010). Lyklað á heimilisfang — hvorki kennitölur, nöfn né aðrar persónuupplýsingar '
              'umsækjenda eru geymdar eða birtar. Aðeins Reykjavík; endurbirting getur verið háð skilyrðum.')

# Per-færslu reitir (grönn — `decision`-label afleiðist úr `decisionCode`+labels; `url` úr meetings-korti per `fund`).
EVENT_KEYS = ('caseNo', 'fnr', 'desc', 'decisionCode', 'date', 'fund', 'sizeM2', 'sizeM3')

def load(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default

def _dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)

DESC_CAP = 150        # per-mál lýsingar-þak í per-pn (full lýsing er í fundargerð-PDF)

def collapse_cases(permits):
    """Færslur (decision-atburðir) → distinct MÁL með tímalínu. Sleppir null-reitum (léttir skrár)."""
    by_case = {}
    for p in permits:
        cid = p['caseNo'] or ''
        c = by_case.get(cid)
        if not c:
            c = by_case[cid] = {'caseNo': p['caseNo'], 'fnr': p.get('fnr'),
                                'desc': None, 'sizeM2': None, 'sizeM3': None, 'events': []}
        c['events'].append({'date': p['date'], 'code': p['decisionCode'], 'fund': p['fund']})
        if p.get('desc') and len(p['desc']) > len(c['desc'] or ''):    # ítarlegasta lýsingin
            c['desc'] = p['desc'][:DESC_CAP]
        if p.get('sizeM2') and not c['sizeM2']:
            c['sizeM2'], c['sizeM3'] = p['sizeM2'], p.get('sizeM3')
    out = []
    for c in by_case.values():
        c['events'].sort(key=lambda e: (e['date'] or '', e['fund'] or 0), reverse=True)
        latest = c['events'][0]
        rec = {'caseNo': c['caseNo'], 'latestCode': latest['code'], 'latestDate': latest['date'],
               'n': len(c['events'])}
        if c['desc']:   rec['desc'] = c['desc']
        if c['fnr']:    rec['fnr'] = c['fnr']
        if c['sizeM2']: rec['sizeM2'] = c['sizeM2']
        if c['sizeM3']: rec['sizeM3'] = c['sizeM3']
        rec['events'] = c['events']                    # [{date,code,fund}] nýjast fyrst
        out.append(rec)
    out.sort(key=lambda c: (c['latestDate'] or ''), reverse=True)
    return out

def write_outputs(store, seen, meetings):
    geo_n = sum(1 for r in store.values() if r.get('postnr'))
    permits_n = sum(len(r['permits']) for r in store.values())
    counts = {'addresses': len(store), 'permits': permits_n, 'meetings': len(seen), 'geocoded': geo_n}
    today = date.today().isoformat()

    canonical = {
        'source': SOURCE, 'sourceUrl': SOURCE_URL, 'disclaimer': DISCLAIMER, 'generated': today,
        'decisionLabels': DECISION_LABELS, 'decisionSeverity': DECISION_SEV,
        'counts': counts, 'meetings': meetings, 'byAddr': store,
    }
    _dump(OUT, canonical)

    def meetings_for(funds):
        return {str(f): meetings[str(f)] for f in funds if str(f) in meetings}

    # per-póstnúmer (skýrslu-neytandi): færslum fellt saman í MÁL (caseNo) → distinct byggingarmál
    # með tímalínu ({date,code,fund}); léttara (desc geymt 1× per mál) + betri skýrslu-framsetning.
    for d in PN_DIRS:
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d, exist_ok=True)
    by_pn = {}
    for key, r in store.items():
        pn = str(r['postnr']) if r.get('postnr') else 'onnur'
        by_pn.setdefault(pn, {})[key] = {'addr': r['addr'], 'cases': collapse_cases(r['permits'])}
    for pn, addrs in by_pn.items():
        funds = {ev['fund'] for r in addrs.values() for c in r['cases'] for ev in c['events']}
        obj = {'labels': DECISION_LABELS, 'severity': DECISION_SEV,
               'meetings': meetings_for(funds), 'addrs': addrs}
        for d in PN_DIRS:
            _dump(os.path.join(d, f'{pn}.json'), obj)

    # vakt-feed (Byggingarvakt-síðan): nýjustu færslur + samantekt
    events = []
    for r in store.values():
        for p in r['permits']:
            events.append({'addr': r['addr'], 'postnr': r.get('postnr'), 'hverfi': r.get('hverfi'),
                           'lat': r.get('lat'), 'lng': r.get('lng'), **p})
    events.sort(key=lambda e: (e.get('date') or '', e.get('fund') or 0), reverse=True)
    recent = events[:500]
    by_dec = Counter(e['decisionCode'] for e in events)
    by_hv  = Counter(e['hverfi'] for e in events if e.get('hverfi'))
    latest = events[0] if events else {}
    vakt = {
        'source': SOURCE, 'sourceUrl': SOURCE_URL, 'disclaimer': DISCLAIMER, 'generated': today,
        'decisionLabels': DECISION_LABELS, 'decisionSeverity': DECISION_SEV,
        'counts': counts,
        'byDecision': dict(by_dec),
        'byHverfi': dict(by_hv.most_common(20)),
        'latestFund': latest.get('fund'), 'latestDate': latest.get('date'),
        'meetings': meetings_for({e['fund'] for e in recent}),
        'recent': recent,
    }
    for p in VAKT_OUT:
        _dump(p, vakt)

    _dump(SEEN, sorted(seen))
    _dump(META, {'generated': today, 'counts': counts})
    return counts

# --------------------------------------------------------------------------- main
def main():
    argv = sys.argv[1:]
    limit = None
    if '--limit' in argv:
        try: limit = int(argv[argv.index('--limit') + 1])
        except Exception: limit = None

    seen  = set(load(SEEN, []))
    prev  = load(OUT, {})
    store = prev.get('byAddr', {})                    # {normKey: {addr, permits:[…]}}
    meetings = prev.get('meetings', {})               # {str(fund): {url, date}} — afþjöppun á fundargerð-tenglum
    for r in store.values():                          # enrichment endurreiknast → hreinsa gömul geo-svið
        for k in ('postnr', 'lat', 'lng', 'hverfi'):
            r.pop(k, None)

    links = fetch_pdf_links()
    todo = [u for u in links if u not in seen]
    if limit is not None:
        todo = todo[:limit]
    print(f'Vísir: {len(links)} fundir | ÞÁTTA {len(todo)} nýja (seen={len(seen)})'
          + (f' [--limit {limit}]' if limit is not None else ''))

    n_new = 0
    for i, url in enumerate(todo, 1):
        try:
            txt = pdf_text(url)
        except Exception as e:
            print(f'  ! PDF-sókn brást ({e}) {url}', file=sys.stderr); continue
        mt = parse_meeting(url, txt)
        if mt['fund']:
            meetings[str(mt['fund'])] = {'url': url, 'date': mt['date']}
        added = 0
        for e in mt['entries']:
            key = norm_addr(e['addr']) or e['addr'].lower().strip()
            rec = store.setdefault(key, {'addr': e['addr'], 'permits': []})
            if len(e['addr']) > len(rec['addr']):
                rec['addr'] = e['addr']
            sig = (e['caseNo'], e['date'], e['decisionCode'])
            if any((p['caseNo'], p['date'], p['decisionCode']) == sig for p in rec['permits']):
                continue
            rec['permits'].append({k: e[k] for k in EVENT_KEYS})
            added += 1; n_new += 1
        seen.add(url)
        if i % 25 == 0 or added:
            print(f'  [{i}/{len(todo)}] fundur {mt["fund"]} {mt["date"]}  +{added}')

    print('Auðga með Staðfangaskrá…')
    geo = load_stadfong()
    for key, rec in store.items():
        g = geo.get(norm_addr(rec['addr']) or key)
        rec['postnr'], rec['lat'], rec['lng'], rec['hverfi'] = g if g else (None, None, None, None)
        rec['permits'].sort(key=lambda p: (p.get('date') or '', p.get('fund') or 0), reverse=True)

    counts = write_outputs(store, seen, meetings)
    print(f'byggingarleyfi.json: {counts["addresses"]} heimilisföng / {counts["permits"]} leyfi-færslur '
          f'/ {counts["meetings"]} fundir | hnituð {counts["geocoded"]} '
          f'({100*counts["geocoded"]//max(counts["addresses"],1)}%) | +{n_new} nýjar færslur')

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--audit':
        run_audit(int(sys.argv[2]) if len(sys.argv) > 2 else 4)
    else:
        main()
