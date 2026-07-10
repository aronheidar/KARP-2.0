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
import io, os, re, sys, json, time, csv, html, urllib.request, urllib.parse
from datetime import date, datetime, timedelta

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
    'synjad':      'Synjað',
    'frestad':     'Frestað',
    'visad_fra':   'Vísað frá',
    'afturkallad': 'Afturkallað',
    'annad':       'Annað',
}
# Alvarleiki f. litun (2=jákvætt/grænt, 0=hlutlaust, -1=neikvætt) — notað í UI síðar.
DECISION_SEV = {'samthykkt': 2, 'synjad': -1, 'frestad': 0,
                'visad_fra': -1, 'afturkallad': 0, 'annad': 0}

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
    return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(_get(url))).pages)

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
    """Fyrsta línu-byrjunar-ákvörðun í blokkinni → (code)."""
    for ln in block.split('\n'):
        s = ln.strip()
        if s.startswith('Samþykk'):   return 'samthykkt'
        if s.startswith('Synja'):     return 'synjad'
        if s.startswith('Fresta'):    return 'frestad'
        if s.startswith('Vísað frá'): return 'visad_fra'
        if s.startswith('Afturkalla'):return 'afturkallad'
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
    s = re.sub(r'\s*\([\d.]+\).*$', '', s)         # strjúka staðgreini „(11.365.04) …" ef leki
    s = re.sub(r'\s+[-–]\s+\D.*$', '', s)          # strjúka viðskeyti „ – breytingaerindi"/„ - Höfðatorg" (heldur „1-3")
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

# --------------------------------------------------------------------------- main (Task 3)
def main():
    print('main() ekki enn útfært — sjá Task 3.', file=sys.stderr)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--audit':
        run_audit(int(sys.argv[2]) if len(sys.argv) > 2 else 4)
    else:
        main()
