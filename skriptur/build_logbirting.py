# -*- coding: utf-8 -*-
# ============================================================================
#  build_logbirting.py  (LOTA 93)  —  Lögbirtingablaðið → gogn/logbirting.json
# ----------------------------------------------------------------------------
#  Opinberar LÖGFORMLEGAR tilkynningar um FÉLÖG (lykluð á kennitölu) fyrir
#  #fs-logbirting flísina á /fyrirtaeki/.  Heimild: memory/iceland-logbirtingabladid-api.md
#
#  OPNA leiðin (per-auglýsing/kt-leit hjá blaðinu er ÁSKRIFTARLÆST → 401):
#    1) tRPC getIssues            → listi tölublaða ársins (óauðkennt, opið)
#    2) OPNI S3-PDF-hýsillinn      files.logbirtingablad.is/adverts/issues/{ár}/lbl-{nr}-{ár}.pdf
#    3) pypdf → texti → þáttun     → lykla FÉLÖG á kt (þrotamann/félag, ALDREI beiðanda).
#
#  ⚠ PERSÓNUVERND (lög nr. 90/2018 / GDPR; blaðið segir „afritun óheimil"):
#    • Birtir AÐEINS lögaðila  — hörð sía: kennitala félags = fyrstu 2 stafir 41–71.
#    • Útilokar: einstaklinga, sakamál, stefnur/dómsbirtingar, lögræðissviptingu,
#      kaupmála OG nauðungarsölur (Karp er þegar með nauðungarsölu-vakt — engin tvítekning).
#    • Geymir HVORKI fullan texta NÉ aðrar kennitölur (dómara/beiðanda/stjórnar) —
#      aðeins tegund, félagsnafn, dagsetningar og HLEKK á opinbera tölublaðið.
#
#  Keyrsla:   python skriptur/build_logbirting.py            (incremental — les seen-set)
#             python skriptur/build_logbirting.py --audit 8  (þáttar 8 nýjustu tbl., skrifar EKKERT, prentar úttekt)
#  Umhverfi:  LOGB_SINCE_DAYS   (sjálfg. 140)  — hámarks-bakvinnsla per keyrslu (öryggisnet)
#  Dep:       pypdf  (þegar í pípunni, sbr. build_jofnun.py — engin poppler-þörf).
# ============================================================================
import io, os, re, sys, json, time, urllib.request, urllib.parse
from datetime import date, datetime, timedelta

try:
    sys.stdout.reconfigure(encoding='utf-8')          # Windows-konsóll → íslenska
except Exception:
    pass
from pypdf import PdfReader

HERE  = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.dirname(HERE)
GOGN  = os.path.join(ROOT, 'gogn')
OUT   = os.path.join(GOGN, 'logbirting.json')
META  = os.path.join(GOGN, 'logbirting_meta.json')
SEEN  = os.path.join(GOGN, 'logbirting_seen.json')

UA            = 'Mozilla/5.0 (KARP gagnapípa; +https://karp.is; aronheidars@gmail.com)'
TRPC          = 'https://logbirtingablad.is/api/trpc/getIssues'
PAGE_SIZE     = 100
SLEEP         = 0.4                                    # kurteisi milli PDF-sókna
WINDOW_MONTHS = 24                                     # rúllandi geymslu-gluggi (grisjun)
SINCE_DAYS    = int(os.environ.get('LOGB_SINCE_DAYS', '140'))   # hám. bakvinnsla per keyrsla

# Beiðendur sem MÁ ALDREI lykla sem þrotamann (kt-forskeyti). Skatturinn er í nær öllum
# gjaldþrota-beiðnum. Fleiri innheimtumenn bætast sjálfkrafa við úr „Krafa …, kt. X".
PETITIONER_KT = {'540269'}                             # Skatturinn (ríkið)

# Tegundir sem við birtum (kjölfestu-flokkar gjaldþrotaferlis + félagsslit). Öðru er sleppt.
TYPE_LABELS = {
    'gjaldthrot_beidni': 'Gjaldþrotaskiptabeiðni',
    'skiptabeidni':      'Skiptabeiðni (fyrirtaka)',
    'innkollun':         'Innköllun þrotabús (kröfulýsing)',
    'skiptalok':         'Skiptalok þrotabús',
    'skiptafundur':      'Skiptafundur þrotabús',
    'felagsslit':        'Félagsslit / afskráning',
}
KEEP = set(TYPE_LABELS.keys())
# Alvarleiki (fyrir litun flísar): 2=rautt (þrot), 1=gult (ferli), 0=hlutlaust.
SEVERITY = {'gjaldthrot_beidni': 2, 'skiptabeidni': 2, 'innkollun': 1,
            'skiptafundur': 1, 'skiptalok': 1, 'felagsslit': 1}

MONTHS = {m: i + 1 for i, m in enumerate(
    ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst',
     'september', 'október', 'nóvember', 'desember'])}
DATE_RX  = r'\d{1,2}\.\s*(?:' + '|'.join(MONTHS) + r')\s*\d{4}'
COURT_RX = re.compile(r'Héraðsdóm\w*\s+(Reykjavíkur|Reykjaness|Vesturlands|Vestfjarða|'
                      r'Norðurlands\s+vestra|Norðurlands\s+eystra|Austurlands|Suðurlands)')
# Sakamál / persónuvernd-flögg → sleppa blokkinni alfarið (öryggisnet ofan á tegundarsíu):
CRIMINAL = re.compile(r'saksóknari|sakamál|ákær|hegningarlaga|valdstjórn|lögræðissvipt|nálgunarbann', re.I)

# --------------------------------------------------------------------------- net
def _get(url, tries=3):
    last = None
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:
            last = e; time.sleep(1.5 * (t + 1))
    raise last

def fetch_issues(year):
    """Öll (ó-legacy) tölublöð ársins → listi issue-dicta."""
    out, page = [], 1
    while True:
        inp = urllib.parse.quote(json.dumps({"0": {"page": page, "pageSize": PAGE_SIZE, "year": str(year)}}, ensure_ascii=False))
        d = json.loads(_get(f'{TRPC}?batch=1&input={inp}'))[0]['result']['data']
        out += [i for i in d['issues'] if not i.get('isLegacy')]
        pg = d.get('paging') or {}
        if not pg.get('hasNextPage'): break
        page = pg.get('nextPage') or (page + 1)
        time.sleep(SLEEP)
    return out

def pdf_text(url):
    return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(_get(url))).pages)

# ----------------------------------------------------------------------- parsing
def blocks(txt):
    return [p for p in re.split(r'(?=Útgáfud\.:)', txt) if p.startswith('Útgáfud')]

def title_of(p):
    """Fyrsta efnislína á eftir „Útgáfud.:" = titill, á forminu „<Tegund> - <Nafn félags>"."""
    for l in [x.strip() for x in p.split('\n')][1:]:
        if l and not re.match(r'^\d', l) and 'Lögbirtingablað' not in l and 'Nr. ' not in l:
            return l
    return ''

def classify(title):
    t = title.lower()
    # nauðungarsölur/uppboð + persónulegt FYRST → tryggt burt (áður en „skiptabeiðni" grípur)
    if re.search(r'nauðungars|uppboð|úthlutunargerð|frumvarp til úthlutunar', t): return 'naudungarsala'
    if re.search(r'dánarbú|lögræði|kaupmál|sjálfræði', t):                       return 'personal'
    if re.search(r'stefna|dómsbirting|fyrirkall.*(einkamál|sakamál)', t):        return 'domsmal'
    # félagsslit/afskráning FYRIR innköllun — „Innköllun - Félagsslit - X" er slit, ekki þrotabú
    if re.search(r'félagsslit|til slita\b|slitameðferð|afskrá|afmá', t):         return 'felagsslit'
    if 'innköllun' in t:                        return 'innkollun'
    if 'skiptalok' in t:                        return 'skiptalok'
    if 'skiptafund' in t:                       return 'skiptafundur'
    if 'gjaldþrotaskiptabeiðni' in t:           return 'gjaldthrot_beidni'
    if 'skiptabeiðni' in t:                     return 'skiptabeidni'
    if 'firmaskrá' in t or 'samruni' in t:      return 'firmaskra'      # skráning/breyting → sleppt (of mikil suð + kt einstaklinga)
    if 'fyrirkall' in t:                        return 'fyrirkall'       # bert fyrirkall (án skiptabeiðni) → sleppt, óljóst
    return 'annad'

def is_company_kt(kt):
    """Íslensk kennitala lögaðila: fyrstu 2 stafir = fæðingar/stofndagur + 40 → 41–71."""
    try: return 41 <= int(kt[:2]) <= 71
    except Exception: return False

# Leiðandi „suð"-orð sem strokin eru af nafni (tegund, bú-beygingar, tengiorð) svo eftir
# standi hreint félagsnafn — t.d. „Skiptafundur í þrotabúi DS 51 ehf." → „DS 51 ehf.".
_LEAD = [r'innköllun', r'félagsslit', r'skiptalok', r'skiptabeiðni', r'skiptafundur',
         r'fyrirkall\w*', r'gjaldþrota\w*', r'boðun til skiptafundar', r'til skiptafundar',
         r'vegna', r'um\s+töku', r'töku', r'á\s+hendur', r'þb\.?',
         r'(?:þrota|dánar)?bú(?:s|i|inu|sins)?',
         r'félagsins', r'einkahlutafélagsins', r'hlutafélagsins', r'sameignarfélagsins', r'fyrirtækisins',
         r'nafn\s+sameignarfélags', r'nafn\s+bús', r'nafn', r'í', r'á']
NOISE_RX = re.compile(r'^\s*(?:' + '|'.join(_LEAD) + r')(?:\s+|\s*[-–—:.,]+\s*|$)', re.I)

def _clean(s):
    s = re.sub(r'\s+', ' ', (s or '')).strip()
    for _ in range(8):                                   # strjúka leiðandi suð endurtekið
        n = NOISE_RX.sub('', s)
        if n == s: break
        s = n
    return s.strip(' ,.-–—:')[:70]

def title_name(title):
    nm = title.split(' - ')[-1] if ' - ' in title else ''   # síðasti hluti = hreinasta félagsnafnið
    if re.search(r'\b(til greiðslu|skuldar|mál nr|S-\d)\b', nm, re.I): return ''
    return _clean(nm)

def petitioner_kts(block):
    return set(re.findall(r'Krafa[^,]{0,60}?,\s*kt\.?\s*(\d{6})', block)) | PETITIONER_KT

def is_company_name(nm):
    return bool(re.search(r'\b(ehf|ohf|hf|slf|slhf|sf|ses|hses|bs|svf)\b\.?', nm or '', re.I))

def subjects(block, title, typ):
    """[(nafn, kt10)] FÉLÖG sem tilkynningin varðar — ALDREI beiðandi/stjórn/skiptastjóri/einstaklingar.
       Regla: ó-beiðanda LÖGAÐILA-kt (41–71) í birtingarröð; birtingarnafn úr hreinum titli."""
    pet = petitioner_kts(block)
    tn  = title_name(title)
    cand = []
    # kt getur verið skipt yfir línubil („520314-\n0160") → [\s-]{0,3} milli 6- og 4-stafa hluta;
    # og skrifuð „Kennitala NNNNNN-NNNN" (orðaform) EÐA „kt. …" (t.d. Mary Sorrel-innköllun).
    KT = r'(?:kt\.?|kennitala:?)\s*(\d{6})[\s-]{0,3}(\d{4})'
    # (A) „<nafn>, [línubil] kt. NNNNNN-NNNN" (kommu-form: fyrirtaka/skiptabeiðni/tafla m/kommu, prósa)
    for m in re.finditer(r'([^,\n]{2,70}?),\s*(?:\n\s*)?' + KT, block, re.I):
        cand.append((m.start(), m.group(1), m.group(2) + m.group(3)))
    # (B) „<nafn>[.] \n kt. NNNNNN-NNNN" (tafla ÁN kommu — „Nafn bús:" layout, t.d. Óðinsholt ehf.)
    for m in re.finditer(r'(?:^|\n)[ \t]*([^\n,]{2,70}?)\.?[ \t]*\n[ \t]*' + KT, block, re.I):
        cand.append((m.start(), m.group(1), m.group(2) + m.group(3)))
    cand.sort(key=lambda c: c[0])                        # birtingarröð → þrotamaður/félag oftast fyrst
    res, seen = [], set()
    for _, name, kt in cand:
        if kt in seen: continue
        if kt[:6] in pet: continue                       # ⛔ beiðandi (Skattur/innheimtumaður)
        if not is_company_kt(kt): continue               # ⛔ einstaklingur (stjórn/skiptastjóri/stefndi)
        seen.add(kt); res.append((name, kt))
    if typ == 'felagsslit':                              # ein eining er slitið → aðeins hún
        res = res[:1]
    if len(res) == 1 and tn:
        return [(tn, res[0][1])]
    return [(_clean(n), kt) for n, kt in res]

def ice_date(s):
    m = re.search(r'(\d{1,2})\.\s*(' + '|'.join(MONTHS) + r')\s*(\d{4})', s or '')
    return f'{m.group(3)}-{MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}' if m else None

def extract_fields(block, typ):
    court = None
    cm = COURT_RX.search(block)
    if cm:                              court = 'Héraðsdómur ' + re.sub(r'\s+', ' ', cm.group(1))
    elif re.search(r'Landsrétt', block): court = 'Landsréttur'
    elif re.search(r'Hæstirétt', block): court = 'Hæstiréttur'
    pub = ice_date((block.split('\n', 1)[0] or '').replace('Útgáfud.:', ''))
    deadline = None
    dm = re.search(r'Frestdagur[:\s]*(' + DATE_RX + r')', block)
    if dm: deadline = ice_date(dm.group(1))
    when = None
    wm = re.search(r'(?:tekin fyrir|þingfest|verður haldinn|Skiptum var lokið|lokið þann|haldinn)'
                   r'[^.\n]{0,80}?(' + DATE_RX + r')', block, re.I | re.S)
    if wm: when = ice_date(wm.group(1))
    return court, pub, deadline, when

def ref_of(block, fallback):
    m = re.search(r'\b20\d{4}-\d{3,6}[A-Z0-9]{0,2}\b', block)
    return m.group(0) if m else fallback

def parse_block(b, it):
    title = title_of(b)
    typ = classify(title)
    if typ not in KEEP: return []
    if CRIMINAL.search(b): return []
    subs = subjects(b, title, typ)
    if not subs: return ('MISS', typ, title[:80])
    court, pub, deadline, when = extract_fields(b, typ)
    ref = ref_of(b, f'{it["issue"]}-{it["year"]}')
    recs = []
    for name, kt in subs:
        recs.append((kt, {
            'type': typ, 'name': name or None,
            'date': pub or it['publishDate'][:10], 'court': court,
            'when': when, 'deadline': deadline,
            'issue': it['issue'], 'year': it['year'], 'ref': ref, 'url': it['url'],
        }))
    return recs

# --------------------------------------------------------------------------- io
def load(path, default):
    try:
        with open(path, encoding='utf-8') as f: return json.load(f)
    except Exception: return default

def within_since(iso):
    if not iso: return True
    try: return datetime.strptime(iso[:10], '%Y-%m-%d').date() >= (date.today() - timedelta(days=SINCE_DAYS))
    except Exception: return True

# --------------------------------------------------------------------------- audit
def run_audit(n):
    yr = date.today().year
    issues = sorted(fetch_issues(yr), key=lambda i: i['issue'], reverse=True)[:n]
    kept = 0; miss = []; per_type = {}
    for it in issues:
        txt = pdf_text(it['url']); time.sleep(SLEEP)
        for b in blocks(txt):
            r = parse_block(b, it)
            if r and r[0] == 'MISS':
                miss.append(r); continue
            for kt, rec in (r or []):
                kept += 1
                per_type[rec['type']] = per_type.get(rec['type'], 0) + 1
                print(f"  [{rec['type']:17}] {(rec['name'] or '?')[:34]:34} kt {kt}  "
                      f"{rec['court'] or '-':22} birt {rec['date']} frestur {rec['deadline'] or '-'} þing {rec['when'] or '-'}")
    print(f"\nAUDIT {len(issues)} tbl: {kept} félaga-tilkynningar  {per_type}")
    if miss:
        print(f"MISSES ({len(miss)}) — flokkað sem keep en ekkert félag fannst:")
        for _, typ, ti in miss[:25]: print(f"    {typ:17} {ti}")

# --------------------------------------------------------------------------- main
def main():
    seen_issues = set(load(SEEN, []))
    store = load(OUT, {}).get('byKt', {})
    ref_index = {kt: {r['ref'] for r in v['notices']} for kt, v in store.items()}

    yr = date.today().year
    issues = []
    for y in (yr, yr - 1):
        try: issues += fetch_issues(y)
        except Exception as e: print(f'  ! getIssues {y}: {e}', file=sys.stderr)

    todo = [i for i in issues
            if f'{i["issue"]}-{i["year"]}' not in seen_issues and within_since(i.get('publishDate'))]
    todo.sort(key=lambda i: (i['year'], i['issue']))
    print(f'Tölublöð sótt {len(issues)} | NÝ til þáttunar {len(todo)} (gluggi {SINCE_DAYS} dagar)')

    n_new = 0
    for it in todo:
        key = f'{it["issue"]}-{it["year"]}'
        try:
            txt = pdf_text(it['url'])
        except Exception as e:
            print(f'  ! PDF {key}: {e}', file=sys.stderr); continue
        kept = 0
        for b in blocks(txt):
            r = parse_block(b, it)
            if not r or r[0] == 'MISS': continue
            for kt, rec in r:
                ent = store.setdefault(kt, {'name': rec['name'], 'notices': []})
                if rec['name'] and len(rec['name']) > len(ent.get('name') or ''): ent['name'] = rec['name']
                refs = ref_index.setdefault(kt, set())
                sig = rec['ref'] + '|' + rec['type']
                if sig in refs: continue
                refs.add(sig); ent['notices'].append(rec); kept += 1; n_new += 1
        seen_issues.add(key)
        print(f'  tbl {it["issue"]}/{it["year"]}  +{kept}')
        time.sleep(SLEEP)

    # grisja geymslu-glugga + sorta + henda tómum
    cutoff = (date.today().replace(day=1) - timedelta(days=31 * WINDOW_MONTHS)).isoformat()
    for kt in list(store.keys()):
        ns = [x for x in store[kt]['notices'] if (x.get('date') or '') >= cutoff]
        ns.sort(key=lambda x: x.get('date') or '', reverse=True)
        if ns: store[kt]['notices'] = ns
        else:  del store[kt]

    out = {
        'source': 'Lögbirtingablaðið (Dómsmálaráðuneytið / Sýslumaðurinn á Suðurlandi)',
        'sourceUrl': 'https://logbirtingablad.is',
        'disclaimer': ('Byggt á opinberum PDF-tölublöðum Lögbirtingablaðsins (lög nr. 15/2005). '
                       'Aðeins lögformlegar tilkynningar er varða lögaðila (gjaldþrotaskipti, innkallanir, '
                       'skiptalok, félagsslit); einstaklingar, sakamál, dómsmál og nauðungarsölur eru '
                       'undanskilin. Endurbirting getur verið háð skilyrðum skv. lögum nr. 90/2018.'),
        'generated': date.today().isoformat(),
        'windowMonths': WINDOW_MONTHS,
        'typeLabels': TYPE_LABELS,
        'severity': SEVERITY,
        'counts': {'companies': len(store), 'notices': sum(len(v['notices']) for v in store.values())},
        'byKt': store,
    }
    os.makedirs(GOGN, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:  json.dump(out, f, ensure_ascii=False)
    with open(META, 'w', encoding='utf-8') as f: json.dump(
        {'generated': out['generated'], 'counts': out['counts'],
         'issuesParsed': len(seen_issues), 'newNotices': n_new}, f, ensure_ascii=False, indent=1)
    with open(SEEN, 'w', encoding='utf-8') as f: json.dump(sorted(seen_issues), f)
    print(f'logbirting.json: {out["counts"]["companies"]} félög / {out["counts"]["notices"]} tilkynningar '
          f'| +{n_new} nýjar | {len(seen_issues)} tölublöð þáttuð')

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--audit':
        run_audit(int(sys.argv[2]) if len(sys.argv) > 2 else 8)
    else:
        main()
