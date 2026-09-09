#!/usr/bin/env python3
# =============================================================================
#  build_fjarlog.py — byggir gogn/utgjold.json og gogn/skattar.json beint úr
#  fjárlagafrumvarpi (eða samþykktum fjárlögum) á althingi.is.
# -----------------------------------------------------------------------------
#  NOTKUN:
#    python skriptur/build_fjarlog.py --lthing 158 --mal 1            # þurrkeyrsla
#    python skriptur/build_fjarlog.py --lthing 158 --mal 1 --skrifa   # skrifar
#
#  Þessar tvær gagnaskrár voru HANDVIÐHALDNAR og stóðu því í 2026 þar til
#  fjárlagafrumvarp 2027 var lagt fram 8.9.2026. Þessi skripta gerir uppfærsluna
#  endurtakanlega — sérstaklega fyrir DESEMBER, þegar Alþingi afgreiðir fjárlögin
#  og allar tölur breytast frá frumvarpinu.
#
#  ⚠⚠ SKRIFAR EKKERT NEMA ALLAR ÞRJÁR SANNPRÓFANIR STANDIST:
#     1. summa málefnasviða  == samtala 3. gr.
#     2. summa tekjuflokka   == heildartekjur 1. gr.
#     3. heildarjöfnuður     == heildartekjur - heildargjöld (1. gr.)
#     Röng fjárlagatala á gagnaveitu er verri en engin uppfærsla.
#
#  ── ÞÁTTUNARGILDRUR SEM KOSTUÐU MARGAR TILRAUNIR (ekki einfalda þetta burt) ──
#  A. Málefnasviða-taflan birtist TVISVAR með ólíkri stigskiptingu og ÓLÍKUM
#     gildum: yfirlit eftir MÁLEFNASVIÐUM (02 Dómstólar = 4.805,6) og ítarleg
#     tafla eftir RÁÐUNEYTUM (02 Dómstólar = 311,0; 10 = „Innviðaráðuneyti" en
#     ekki „Rétt. einstakl…"). Að blanda þeim gaf 1.869,8 í stað 1.765,1.
#     → Afmörkum við yfirlitið: hættum við samtölulínuna.
#  B. Heiti mega bera PUNKTA („Rétt. einstakl., trúmál…") svo punktalínan verður
#     að vera ≥4 punktar, ekki „allt sem er ekki punktur".
#  C. Aðgreining heitis og talna er BREYTILEG: ýmist löng punktalína eða EINN
#     stakur punktur („hluti lífeyristrygging . 99.306,0"). Krafa um ≥4 tákn
#     felldi tryggingagjöldin — 166 ma.kr. hurfu þegjandi.
#     → Í tekjutöflunni tökum við einfaldlega TVÆR SÍÐUSTU TÖLUR línunnar.
#  D. Heiti töflunnar stendur LÍKA í efnisyfirliti á bls. 2 → upphafsleit verður
#     að krefjast fasts liðar úr töflunni sjálfri (111.1.0).
#  E. Dálkastaða Heildarfjárheimildar er ÓSTÖÐUG (yfirlitið ber aukadálk
#     Rekstrartekjur sem ítarlega taflan hefur ekki). → Greinum hana sem þann
#     dálk sem er SUMMA dálkanna á undan; það sannar sig í hverri röð.
# =============================================================================
import argparse, io, json, os, re, sys, urllib.request

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TALA = r'-?\d{1,3}(?:\.\d{3})*,\d'
f = lambda s: float(s.replace('.', '').replace(',', '.'))
ma = lambda v: round(v / 1000, 1)
hreinsa = lambda s: re.sub(r'[.\s]+$', '', s).strip()
# Íslenskt talnasnið: þúsundapunktur á heiltöluhlutann, komma fyrir aukastaf (1.703,8).
def nf(v, plus=False):
    i, d = ('%+.1f' if plus else '%.1f') % v, None
    i, d = i.split('.')
    sign = '-' if i.startswith('-') else ('+' if i.startswith('+') else '')
    i = i.lstrip('+-')
    return sign + re.sub(r'\B(?=(\d{3})+(?!\d))', '.', i) + ',' + d

# Málefnasvið → hóparnir sex eins og þeir birtast á /utgjold/. Heitin eru STYTT
# fyrir birtingu og eiga að haldast óbreytt milli ára svo síðan líti eins út.
HOPAR = [
    ('Heilbrigðismál', [('23', 'Sjúkrahúsþjónusta'), ('24', 'Heilbrigðisþjónusta utan sjúkrahúsa'),
                        ('25', 'Hjúkrunar- og endurhæfingarþjónusta'), ('26', 'Lyf og lækningavörur'),
                        ('32', 'Lýðheilsa og stjórnsýsla velferðarmála')]),
    ('Félags-, trygginga- og húsnæðismál', [('27', 'Örorka og málefni fatlaðs fólks'), ('28', 'Málefni aldraðra'),
                        ('29', 'Fjölskyldumál'), ('30', 'Vinnumarkaður og atvinnuleysi'),
                        ('31', 'Húsnæðis- og skipulagsmál')]),
    ('Mennta- og menningarmál', [('21', 'Háskólastig'), ('20', 'Framhaldsskólastig'),
                        ('18', 'Menning, listir, íþrótta- og æskulýðsmál'), ('19', 'Fjölmiðlun'),
                        ('22', 'Önnur skólastig og stjórnsýsla')]),
    ('Innviðir, umhverfi og atvinnuvegir', [('11', 'Samgöngu- og fjarskiptamál'), ('17', 'Umhverfismál'),
                        ('08', 'Sveitarfélög og byggðamál'), ('07', 'Nýsköpun, rannsóknir og þekkingargreinar'),
                        ('12', 'Landbúnaður'), ('15', 'Orkumál'), ('13', 'Sjávarútvegur og fiskeldi'),
                        ('16', 'Markaðseftirlit og neytendamál'), ('14', 'Ferðaþjónusta')]),
    ('Stjórnsýsla, öryggi og utanríkismál', [('09', 'Almanna- og réttaröryggi'), ('05', 'Skatta-, eigna- og fjármálaumsýsla'),
                        ('10', 'Réttindi einstaklinga, trúmál og dómsmál'), ('04', 'Utanríkismál'),
                        ('35', 'Alþjóðleg þróunarsamvinna'), ('01', 'Alþingi og eftirlitsstofnanir'),
                        ('02', 'Dómstólar'), ('06', 'Hagskýrslugerð og grunnskrár'), ('03', 'Æðsta stjórnsýsla')]),
    ('Fjármagnskostnaður og varasjóðir', [('33', 'Fjármagnskostnaður, ábyrgðir og lífeyrissk.'),
                        ('34', 'Almennur varasjóður og sértækar ráðstafanir')]),
]

# Tekjuliðir → flokkarnir fimm á /skattar/. Kóðar úr Töfluviðauka 1.
# Listi merkir samtölu liðanna (t.d. tóbak+nikótín+rafrettur í einn birtingarlið).
SKATT_HOPAR = [
    ('Skattar á tekjur, hagnað og eignir', [
        ('Tekjuskattur einstaklinga', ['111.1.0']), ('Tekjuskattur lögaðila', ['111.2.1']),
        ('Fjármagnstekjuskattur', ['111.3']), ('Erfðafjárskattur', ['113.3.1']),
        ('Sérstakur fjársýsluskattur', ['111.2.2']), ('Fjársýsluskattur', ['112.7']),
        ('Aðrir launa- og eignarskattar', ['112.1', '112.6', '113.5.1', '113.6.5', '113.6.6'])]),
    ('Tryggingagjöld', [('Tryggingagjöld (launaskattur til almannatrygginga)', '@Tryggingagjöld, samtals')]),
    ('Skattar á vöru og þjónustu', [
        ('Virðisaukaskattur', ['114.1.1']), ('Kílómetragjald', ['114.5.1.6']),
        ('Áfengisgjald', ['114.2.3.1']), ('Vörugjöld af ökutækjum', ['114.2.1']),
        ('Kolefnisgjald', ['114.2.2.4']), ('Bifreiðagjald', ['114.5.1.7']),
        ('Stimpilgjöld', ['114.1.4.1']),
        ('Tóbak, nikótín og rafrettur', ['114.2.3.10', '114.2.3.11', '114.2.3.12']),
        ('Gistináttaskattur og innviðagjöld', ['114.4.9', '114.4.13', '114.4.10']),
        ('Úrvinnslu- og jöfnunargjöld', ['114.2.4.5', '114.2.5.6']),
        ('Eftirlits- og öryggisgjöld', ['114.4.1', '114.4.2', '114.4.3', '114.4.7'])]),
    ('Tollar og aðrir skattar', [
        ('Gjald á bankastarfsemi', ['116.1.6']), ('Tollar og aðflutningsgjöld', ['115.1']),
        ('Útvarpsgjald', ['116.2.82']), ('Gjald í framkvæmdasjóð aldraðra', ['116.2.81']),
        ('Aðrir skattar á atvinnurekstur', ['116.1'])]),
    ('Auðlindagjöld', [('Veiðigjald', ['141.5.20']), ('Gjaldtaka vegna fiskeldis', ['141.5.22'])]),
]


def saekja(lthing, mal, skyndiminni):
    url = 'https://www.althingi.is/altext/pdf/%d/s/%04d.pdf' % (lthing, mal)
    if os.path.exists(skyndiminni):
        print('  PDF úr skyndiminni: %s' % skyndiminni)
    else:
        print('  sæki %s' % url)
        rq = urllib.request.Request(url, headers={'User-Agent': 'karp.is/1.0 (+https://karp.is)'})
        with urllib.request.urlopen(rq, timeout=180) as r, open(skyndiminni, 'wb') as w:
            w.write(r.read())
    return url


def lesa(pdf):
    from pypdf import PdfReader
    return PdfReader(pdf)


def lykiltolur(r):
    """1. gr. — heildartekjur/gjöld/jöfnuður. Tölurnar standa á sömu línu og heitið."""
    RX = lambda h: re.compile(r'^\s*' + h + r'\s*\.{4,}\s*(' + TALA + r')\s*$', re.M)
    for i in range(min(12, len(r.pages))):
        t = r.pages[i].extract_text() or ''
        if 'Heildarjöfnuður' not in t:
            continue
        o = {}
        for lykill, heiti in (('tekjur', 'Heildartekjur'), ('gjold', 'Heildargjöld'),
                              ('jofnudur', 'Heildarjöfnuður'), ('frumjofnudur', 'Frumjöfnuður'),
                              ('vaxtagjold', 'Vaxtagjöld')):
            m = RX(heiti).search(t)
            if m:
                o[lykill] = f(m.group(1))
        if len(o) == 5:
            return o
    raise SystemExit('✗ fann ekki 1. gr. — skjalið hefur breyst')


def malefnasvid(r):
    """3. gr. — yfirlitstaflan (sjá gildrur A/B/E efst)."""
    raw = ''.join((p.extract_text() or '') + '\n' for p in r.pages[:14])
    m = re.search(r'Samtals\s+(' + TALA + r')(?:\s+' + TALA + r'){3,}', raw)
    if not m:
        raise SystemExit('✗ fann ekki samtölulínu 3. gr.')
    txt = raw[:m.start()]
    samtala = f(re.findall(TALA, m.group(0))[4])       # 5. talan = Heildarfjárheimild
    RX = re.compile(r'^(\d{2}) (.+?)\s*\.{4,}\s*((?:' + TALA + r'\s*)+)$', re.M)
    out = {}
    for x in RX.finditer(txt):
        nr = x.group(1)
        if nr in out:
            continue
        t = [f(v) for v in re.findall(TALA, x.group(3))]
        h = next((t[k] for k in range(1, len(t)) if abs(sum(t[:k]) - t[k]) < 0.15), None)
        if h is not None:
            out[nr] = {'heiti': hreinsa(x.group(2)), 'heild': h}
    return out, samtala


def tekjur(r):
    """Töfluviðauki 1 — rekstrargrunnur er FYRRI talnadálkurinn (sjá gildrur C/D)."""
    upp = next((i for i, p in enumerate(r.pages) if '111.1.0' in (p.extract_text() or '')), None)
    if upp is None:
        raise SystemExit('✗ fann ekki tekjutöfluna')
    endi = next((i for i in range(upp + 1, len(r.pages))
                 if re.search(r'^\s*2\.\s+Gjöld ríkissjóðs', r.pages[i].extract_text() or '', re.M)),
                min(upp + 18, len(r.pages) - 1))
    txt = ''.join((r.pages[i].extract_text() or '') + '\n' for i in range(upp, endi + 1))
    LID = re.compile(r'^\s*(\d{3}(?:\.\d+)*)\s+(.+?)\s+(' + TALA + r')\s+(' + TALA + r')\s*$', re.M)
    SUM = re.compile(r'^\s*([A-ZÁÉÍÓÚÝÞÆÖ][^\d]{4,70}?)\s+(' + TALA + r')\s+(' + TALA + r')\s*$', re.M)
    lidir, samt = {}, {}
    for m in LID.finditer(txt):
        lidir.setdefault(m.group(1), [hreinsa(m.group(2)), f(m.group(3))])
    for m in SUM.finditer(txt):
        samt.setdefault(hreinsa(m.group(1)), f(m.group(2)))
    return lidir, samt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lthing', type=int, default=158)
    ap.add_argument('--mal', type=int, default=1)
    ap.add_argument('--ar', type=int, default=None, help='fjárlagaár (sjálfgefið lthing-131)')
    ap.add_argument('--samthykkt', action='store_true', help='samþykkt fjárlög, ekki frumvarp')
    ap.add_argument('--skrifa', action='store_true')
    a = ap.parse_args()
    ar = a.ar or (a.lthing + 1869)          # 158. þing → fjárlagaár 2027
    # ⚠ Skyndiminnið fer í tempdir, EKKI í gogn/ — þingskjalið er ~8 MB og gogn/ er committað.
    import tempfile
    pdf = os.path.join(tempfile.gettempdir(), 'karp_fjarlog_%d_%d.pdf' % (a.lthing, a.mal))
    url = saekja(a.lthing, a.mal, pdf)
    r = lesa(pdf)
    print('  %d síður' % len(r.pages))

    lyk = lykiltolur(r)
    svid, samtala3 = malefnasvid(r)
    lidir, samt = tekjur(r)
    S = lambda p: next((v for k, v in samt.items() if k.startswith(p)), None)
    flokkar = {n: S(n) for n in ('Skatttekjur, samtals', 'Tryggingagjöld, samtals',
                                 'Fjárframlög, samtals', 'Aðrar tekjur, samtals')}

    # ── SANNPRÓFANIR ────────────────────────────────────────────────────────
    p = []
    summa_svid = sum(v['heild'] for v in svid.values())
    p.append(('málefnasvið == samtala 3. gr.', summa_svid, samtala3, 1.0))
    if None in flokkar.values():
        raise SystemExit('✗ tekjuflokka vantar: %s' % [k for k, v in flokkar.items() if v is None])
    p.append(('tekjuflokkar == heildartekjur 1. gr.', sum(flokkar.values()), lyk['tekjur'], 200.0))
    p.append(('jöfnuður == tekjur - gjöld', lyk['jofnudur'], lyk['tekjur'] - lyk['gjold'], 1.0))
    print()
    allt_i_lagi = True
    for heiti, x, y, vik in p:
        ok = abs(x - y) < vik
        allt_i_lagi &= ok
        print('  %-38s %14.1f  vs %14.1f   %s' % (heiti, x, y, '✓' if ok else '✗'))
    vantar = [('%02d' % i) for i in range(1, 36) if ('%02d' % i) not in svid]
    if vantar:
        allt_i_lagi = False
        print('  ✗ málefnasvið vantar: %s' % vantar)
    if not allt_i_lagi:
        raise SystemExit('\n✗ SANNPRÓFUN BRÁST — engu breytt.')
    print('\n  ✓ allar sannprófanir standast')

    heiti_skjals = ('Fjárlög %d' % ar) if a.samthykkt else ('Frumvarp til fjárlaga %d' % ar)
    visun = '(þskj. %d, %d. lögþ.)' % (a.mal, a.lthing)
    UTG = {
        'ar': ar,
        'heimild': '%s — Fjárheimildir A1-hluta ríkissjóðs eftir málefnasviðum (3. gr., %s)' % (heiti_skjals, visun[1:-1]),
        'grunnur': 'Fjárheimildir málefnasviða (IPSAS). Samsvarandi heildargjöld á þjóðhagsgrunni (GFS) '
                   'eru %s ma.kr. eftir aðlögun upp á %s ma.kr.' % (nf(ma(lyk['gjold'])), nf(ma(lyk['gjold']) - ma(samtala3), True)),
        'heild': ma(samtala3),
        'tekjur': ma(lyk['tekjur']),
        'afkoma': {
            'heildarjofnudur': ma(lyk['jofnudur']), 'frumjofnudur': ma(lyk['frumjofnudur']),
            'vaxtagjold': ma(lyk['vaxtagjold']),
            'skyring': 'Heildarjöfnuður %s ma.kr. er á GFS-grunni: tekjur %s - gjöld %s. Mismunur '
                       'heildarfjárheimilda (%s) og tekna er EKKI afkoman.'
                       % (nf(ma(lyk['jofnudur']), True), nf(ma(lyk['tekjur'])),
                          nf(ma(lyk['gjold'])), nf(ma(samtala3))),
        },
        'hopar': [{'heiti': h, 'svid': [[nafn, ma(svid[nr]['heild'])] for nr, nafn in ls]} for h, ls in HOPAR],
    }
    L = lambda ks: round(sum(ma(lidir[k][1]) for k in ks if k in lidir), 1)
    SKA = {
        'ar': ar,
        'heimild': '%s — Tekjur A1-hluta ríkissjóðs, rekstrargrunnur (Töfluviðauki 1, %s)' % (heiti_skjals, visun[1:-1]),
        'skatttekjur': ma(flokkar['Skatttekjur, samtals']),
        'tryggingagjold': ma(flokkar['Tryggingagjöld, samtals']),
        'heild': ma(flokkar['Skatttekjur, samtals'] + flokkar['Tryggingagjöld, samtals']),
        'heildartekjur': ma(lyk['tekjur']),
        'hopar': [{'heiti': h, 'skattar': [[n, (ma(samt[k[1:]]) if isinstance(k, str) else L(k))]
                                           for n, k in ls]} for h, ls in SKATT_HOPAR],
    }
    print('\n  ÚTGJÖLD %d: %s ma.kr · TEKJUR: %s ma.kr · JÖFNUÐUR: %s ma.kr'
          % (ar, UTG['heild'], SKA['heildartekjur'], UTG['afkoma']['heildarjofnudur']))
    print('  heimild: %s' % url)

    if a.skrifa:
        for nafn, o in (('utgjold', UTG), ('skattar', SKA)):
            pth = os.path.join(ROT, 'gogn', '%s.json' % nafn)
            io.open(pth, 'w', encoding='utf-8', newline='\n').write(json.dumps(o, ensure_ascii=False, indent=1) + '\n')
            print('  skrifað %s' % pth)
    else:
        print('\n  (þurrkeyrsla — engu breytt; bættu við --skrifa)')


if __name__ == '__main__':
    main()
