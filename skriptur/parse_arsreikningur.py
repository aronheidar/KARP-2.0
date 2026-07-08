#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DRÖG: Þáttun íslensks ársreiknings-PDF (RSK ársreikningaskrá) -> tölur + KPI.
Notar pdfplumber (hnita-þáttun) svo dálkar raðist rétt. Þolir að íslenskir
broddstafir brenglist (ToUnicode-galli í RSK-PDF) -> ASCII-beinagrind + röð.
"""
import sys, re, json
import pdfplumber

# ---- íslensk tala: '.' = þúsundaskil, ',' = aukastafur, (..) = neikvætt ----
def to_num(tok):
    t = tok.strip()
    neg = t.startswith('(') or t.endswith(')')
    t = t.strip('()').strip()
    # Komma sem ÞÚSUNDASKIL (ekki aukastafur): '78,391' = 78391. Sumar skýrslur — t.d. rekstrar-
    # reikningur Arion banka (5810080150) — nota kommu fyrir þúsund þar sem íslenskur staðall notar
    # punkt (Íslandsbanki: '63.057'). Áður las to_num kommuna sem aukastaf → 78,391 varð 78.391
    # (~1000x of lágt), eignavelta rúnn í 0. Meðhöndlum sem þúsund AÐEINS þegar ótvírætt: komma +
    # NÁKVÆMLEGA 3 tölustafir, heiltöluhluti 1–3 stafir og EKKI stakt '0' — svo raunverulegir
    # aukastafir ('0,17', '12,5', '0,123') og punkt-þúsund ('1.234.567,89') haldist ÓBREYTT.
    m = re.match(r'^(\d{1,3}),(\d{3})$', t)
    if m and m.group(1) != '0':
        v = int(m.group(1) + m.group(2))
        return -v if neg else v
    t = t.replace('.', '').replace(',', '.')
    try:
        v = float(t)
    except ValueError:
        return None
    if v == int(v): v = int(v)
    return -v if neg else v

NUMRE = re.compile(r'^\(?-?[\d][\d.]*(?:,\d+)?\)?$')
def is_num(tok): return bool(NUMRE.match(tok)) and any(c.isdigit() for c in tok)

# ---- kortlagning: reitur -> listi af ASCII-beinagrindar-regex (fyrsti hittir) ----
# '.' í regex passar við brenglaða broddstafi.  Raðað eftir sérhæfni.
REKSTUR_MAP = [
    ('sala',            r'^(sala|seldar v|rekstrartekjur|v.rusala|tekjur samt)'),
    ('adrar_tekjur',    r'^(a.rar (rekstrar)?tekjur|a.rar tekjur)'),
    ('kostnadarverd',   r'(kostna.arver. seldra|seldra vara)'),
    ('laun',            r'^laun'),
    ('annar_rekstur',   r'^annar rekstrarkostna'),
    ('afskriftir',      r'^afskrift'),
    ('ebitda',          r'^ebitda'),
    ('ebit',            r'(rekstrarhagna.ur|fyrir fj.rmunatekjur|fyrir afskriftir og fj)'),
    ('fjarmagnsgjold',  r'(fj.rmagnsgj.ld|vaxtagj.ld)'),
    ('fjarmunatekjur',  r'(fj.reignatekjur|vaxtatekjur)'),
    ('hagn_f_skatt',    r'(hagna.ur|tap) (fyrir (tekju)?skatt|f.r skatt)'),
    ('tekjuskattur',    r'^tekjuskattur'),
    ('hagnadur',        r'^(hagna.ur|tap).{0,10}.rsins'),   # líka "Tap ársins" / "Hagnaður (tap) ársins" (tapfélög)
]
EFNAHAGUR_MAP = [
    ('fastafjarmunir',  r'fastafj.rmunir samtals'),
    ('birgdir',         r'(^v.rubirg.ir|^birg.ir)'),
    ('vidskiptakrofur', r'(vi.skiptakr.fur|skammt.makr.fur)'),
    ('handbaert',       r'(handb.rt f|sj..ur og banka|ban48kainnst)'),
    ('veltufjarmunir',  r'veltufj.rmunir samtals'),
    ('eignir',          r'^eignir samtals|^eignir$'),   # + "Eignir" án "samtals" (sum ehf, t.d. Kaffitár)
    ('hlutafe',         r'^hlutaf.'),
    ('eigid_fe',        r'^eigi. f.(,| \(| samtals|$)'),   # "Eigið fé[ samtals]", "Eigið fé, (neikvætt)" — EKKI "...hluthafa móðurfélags" (hlutdeild minnihluta) né "...og skuldir"
    ('langtimaskuldir', r'langt.maskuldir samtals'),
    ('skammtimaskuldir',r'skammt.maskuldir samtals'),
    ('skuldir',         r'^skuldir samtals|^skuldir$'),   # + "Skuldir" án "samtals"
    ('efe_skuldir',     r'eigi. f. og skuldir( samtals)?'),
]

def rows_of_page(pg, ytol=3):
    words = pg.extract_words()
    buckets = {}
    for w in words:
        buckets.setdefault(round(w['top']/ytol), []).append(w)
    out = []
    for k in sorted(buckets):
        ws = sorted(buckets[k], key=lambda w: w['x0'])
        label = ' '.join(w['text'] for w in ws if not is_num(w['text'])).strip()
        nums  = [w['text'] for w in ws if is_num(w['text'])]
        if label:
            out.append((label, nums))
    return out

def match(label, mp):
    lo = label.lower()
    for field, rx in mp:
        if re.search(rx, lo):
            return field
    return None

NOTEREF = re.compile(r'^[1-9]\d?[.)]?$')   # skýringarnúmer 1–99 (líka "2.", "15)") = EKKI fjárhæð
DATERE  = re.compile(r'^\d{1,2}\.\d{1,2}\.(19|20)\d\d$')  # dagsetningardálkur "31.12.2025" = EKKI fjárhæð
#   (miðhópur 1–2 tölur aðgreinir dagsetningu frá þúsundatölu "31.122.025" sem hefur 3ja-stafa hópa)
def take_years(nums):
    """síðustu 2 tölutákn = [líðandi ár, fyrra ár]; hendir skýringar-dálki (1–99) og dagsetningum."""
    vals = []
    for n in nums:
        if NOTEREF.match(n):          # ber skýringarnúmer (t.d. "2", "15") — ekki fjárhæð ('0' heldur sér)
            continue
        if DATERE.match(n):           # dálkahaus með dagsetningum (efnahagur sumra ehf: "31.12.2025 31.12.2024")
            continue
        v = to_num(n)
        if v is not None: vals.append(v)
    if not vals: return (None, None)
    if len(vals) == 1: return (vals[0], None)
    return (vals[-2], vals[-1])

def _cur_of(seg):
    # Mynt úr glugga sterkrar yfirlýsingar. FOREIGN athugað fyrst svo tilfallandi 'króna'-orð
    # í evru-/dollara-skýrslu ráði ekki. Broddstafir brenglast → ASCII-kjarnar: 'evr','bandar','slensk';
    # '.' passar við brenglaðan brodd. 'isk'/'eur'/'usd' = ISO-kóðar (enskar skýrslur, t.d. bankar).
    if re.search(r'\beur\b|evr[au]', seg): return 'EUR'
    if re.search(r'\busd\b|bandar.k|dollar', seg): return 'USD'
    if re.search(r'\bgbp\b|sterling|breskum pund', seg): return 'GBP'
    if re.search(r'\bisk\b|kr.n|slensk', seg): return 'ISK'
    return None

def detect_scale(text):
    lo = text.lower()
    # ── Uppgjörsmynt ──────────────────────────────────────────────────────────
    # Tier 1 (áreiðanlegast): starfrækslu-/framsetningargjaldmiðill. Mynt-orðið getur staðið
    #   SITT HVORU MEGIN við frasann ("birtur í evrum, sem er starfrækslugjaldmiðill félagsins")
    #   → TVÍHLIÐA gluggi. Nær ISK jafnt í íslenskum ("íslenskum krónum") sem enskum
    #   ("Icelandic króna (ISK), which is the functional currency") skýrslum.
    cur = None
    for m in re.finditer(r'starfr.kslugjaldmi|framsetningargjaldmi|reikningsskilagjaldmi|functional currency|presentation currency|reporting currency', lo):
        c = _cur_of(lo[max(0, m.start() - 55):m.end() + 55])
        if c: cur = c; break
    # Tier 2: framsetning fjárhæða ("fjárhæðir eru í X", "amounts are in X", "presented in X").
    if cur is None:
        for m in re.finditer(r'(?:fj.rh..ir[^.\n]{0,20}(?:eru|birt)|amounts?\s+(?:are\s+|presented\s+)?in|presented\s+in|expressed\s+in|birt\w*\s+[i.]\s|ger.\w*\s+upp\s+[i.]\s)[^.\n]{0,45}', lo):
            c = _cur_of(m.group(0))
            if c: cur = c; break
    # Sjálfgefið ISK: íslensk fyrirtækjaskrá. Raunverulegir EUR/USD-uppgjörsaðilar (Brim, Samherji,
    # Landsvirkjun) lýsa mynt SKÝRT og greinast í Tier 1/2 → tilfallandi 'USD'/'evra' í skýringum
    # (gjaldeyrisáhætta banka, EUR-skuldabréf) yfirtaka EKKI lengur uppgjörsmyntina.
    if cur is None: cur = 'ISK'
    # ── Kvarði (þúsundir/milljónir) ───────────────────────────────────────────
    # Akkerum á framsetningar-yfirlýsingu fjárhæða — EKKI prósu sem nefnir "X millj. evra"
    #   (Brim skrifar tugi slíkra setninga en gerir upp í ÞÚSUNDUM evra). Sandholt/Vífilfell
    #   hafa enga slíka yfirlýsingu → kvarði 1 (heilar krónur).
    # MEIRIHLUTI ræður: skýrsla stjórnar getur sagt "í milljónum USD" (ávalar prósutölur) EN
    #   sjálfur ársreikningurinn "í þúsundum USD" í síðufæti á HVERRI reikningssíðu (Landsvirkjun).
    #   Endurtekni síðufóturinn (margar hittingar) ræður yfir stöku prósu-yfirlýsingu.
    scale, mill, thous = 1, 0, 0
    for m in re.finditer(r'(?:fj.rh..ir|upph..ir|t.lur\s+eru|figures\s+are|amounts?\s+(?:are\s+|presented\s+)?in|rounded\s+to\s+the\s+nearest)[^.\n]{0,55}', lo):
        seg = m.group(0)
        if 'millj' in seg or 'million' in seg: mill += 1
        elif 'sund' in seg or 'thousand' in seg: thous += 1
    if mill or thous:
        scale = 1000000 if mill > thous else 1000
    return scale, cur

def is_statement_label(label):
    # Reikningslínur hafa STUTT heiti ("Rekstrarhagnaður", "Eignir samtals", "Seldar vörur ....").
    # Frásagnarsíður (skýrsla stjórnar) hafa LANGAR setningar sem geta innihaldið sömu lykilorð
    # (t.d. "...námu 286 millj. evra ... rekstrarhagnaður fyrir afskriftir og fjármagnsgjöld...")
    # og mengað reit vegna óakkeraðra regexa. Höfnum prósu: > 8 raunorð (tákn með bókstaf).
    return sum(1 for w in label.split() if any(c.isalpha() for c in w)) <= 8

# ---- Hluthafar (hlutafjár-skýring) --------------------------------------------
KT_RE  = re.compile(r'\b(\d{6}-?\d{4})\b')
PCT_RE = re.compile(r'(\d{1,3}(?:[.,]\d+)?)\s*%')

def hluthafar_from_lines(lines):
    """Textalínur -> [{nafn, kt|None, hlutur}]. Hluthafalína ber prósentu; nafn = línan án kt/%."""
    out = []
    for ln in lines:
        mp = PCT_RE.search(ln)
        if not mp:
            continue
        h = to_num(mp.group(1))
        if h is None or not (0 < h <= 100):
            continue
        mk = KT_RE.search(ln)
        kt = mk.group(1).replace('-', '') if mk else None
        name = ln
        if mk:
            name = name.replace(mk.group(0), ' ')
        name = PCT_RE.sub(' ', name)
        name = re.sub(r'\s+', ' ', name).strip(' ,-–')   # heldur '.' í "ehf." — strippar bil/kommu/bandstrik
        if len(name) >= 2:
            out.append({'nafn': name, 'kt': kt, 'hlutur': h})
    return out

# Hausar sem afmarka hluthafa-skýringu (ASCII-beinagrind; '.' passar við brenglaða broddstafi).
HLUTHAFAR_HEAD = re.compile(r'^(hluthafar|hlutafj.reign|eignarhlutir hluthafa|hlutir og hluthafar)', re.I)
HLUTHAFAR_END  = re.compile(r'^(sk.ringar?|rekstrarreikning|efnahagsreikning|sj..streymi)\b', re.I)

def parse_hluthafar(pdf):
    """Finna hluthafa-skýringu í PDF og þátta hana. Skilar [] finnist ekkert nothæft."""
    for pg in pdf.pages:
        text = pg.extract_text() or ''
        lines = [l.strip() for l in text.split('\n')]
        for i, l in enumerate(lines):
            if HLUTHAFAR_HEAD.match(l):
                seg = []
                for l2 in lines[i + 1:]:
                    if HLUTHAFAR_END.match(l2):
                        break
                    seg.append(l2)
                res = hluthafar_from_lines(seg)
                if res:
                    return res
    return []

def parse(path):
    pdf = pdfplumber.open(path)
    fulltext = '\n'.join((p.extract_text() or '') for p in pdf.pages)
    scale, cur = detect_scale(fulltext)
    rekstur, efnahagur = {}, {}
    ar_cur = ar_prev = None
    for pg in pdf.pages:
        low = (pg.extract_text() or '').lower()
        header = ' '.join(low.split('\n')[:5])   # aðeins EFSTU línur -> sleppum skýringasíðum (Skýringar) sem nefna liðina
        is_rekstur = 'rekstrarreikning' in header or bool(re.search(r'seldar v.rur|rekstrartekjur', header))
        is_efnahag = 'efnahagsreikning' in header or bool(re.search(r'^\s*eignir\b|efnahags', header))
        if not (is_rekstur or is_efnahag):
            continue
        for label, nums in rows_of_page(pg):
            # ártöl úr haus (t.d. "2024 2023" eða "31.12.2024")
            if ar_cur is None:
                ys = re.findall(r'\b(20\d\d)\b', ' '.join(nums))
                if len(ys) >= 2: ar_cur, ar_prev = int(ys[0]), int(ys[1])
            vals = take_years(nums)
            if vals[0] is None:      # haus-/millisummulína án talna -> sleppa (annars stíflar hún reitinn)
                continue
            if not is_statement_label(label):   # prósa-lína á frásagnarsíðu -> EKKI reikningsreitur
                continue
            if is_rekstur:
                f = match(label, REKSTUR_MAP)
                if f and f not in rekstur:
                    rekstur[f] = vals
            if is_efnahag:
                f = match(label, EFNAHAGUR_MAP)
                if f and f not in efnahagur:
                    efnahagur[f] = vals
    # --- afleiddir reitir (þolir vantandi millisummur; reikningsjafnan er traust) ---
    def pair_sub(a, b):
        a = a or [None, None]; b = b or [0, 0]
        return [ (None if a[i] is None else a[i] - (b[i] or 0)) for i in range(2) ]
    afleitt = []
    if 'eigid_fe' not in efnahagur and 'eignir' in efnahagur and 'skuldir' in efnahagur:
        efnahagur['eigid_fe'] = pair_sub(efnahagur['eignir'], efnahagur['skuldir'])
        afleitt.append('eigid_fe')
    # gagnstæð leið (t.d. IFRS þar sem "Skuldir samtals"-línan þáttast ekki): Skuldir = Eignir − Eigið fé
    if 'skuldir' not in efnahagur and 'eignir' in efnahagur and 'eigid_fe' in efnahagur:
        efnahagur['skuldir'] = pair_sub(efnahagur['eignir'], efnahagur['eigid_fe'])
        afleitt.append('skuldir')
    if 'skammtimaskuldir' not in efnahagur and 'skuldir' in efnahagur:
        efnahagur['skammtimaskuldir'] = pair_sub(efnahagur['skuldir'], efnahagur.get('langtimaskuldir'))
        afleitt.append('skammtimaskuldir')
    return {'ar': [ar_cur, ar_prev], 'mynt': cur, 'kvardi': scale,
            'rekstur': rekstur, 'efnahagur': efnahagur, 'afleitt': afleitt,
            'hluthafar': parse_hluthafar(pdf)}

def cur_val(d, k, idx=0):
    v = d.get(k)
    return v[idx] if v and v[idx] is not None else None

def kpis(res, idx=0):
    r, e = res['rekstur'], res['efnahagur']
    g = lambda d,k: cur_val(d,k,idx)
    sala=g(r,'sala'); kv=g(r,'kostnadarverd'); ebit=g(r,'ebit'); hagn=g(r,'hagnadur')
    eignir=g(e,'eignir'); efe=g(e,'eigid_fe'); skuldir=g(e,'skuldir')
    birg=g(e,'birgdir'); krof=g(e,'vidskiptakrofur'); hand=g(e,'handbaert')
    stskuld=g(e,'skammtimaskuldir') or skuldir
    velta = sum(x for x in (birg,krof,hand) if x)
    out={}
    def put(k,num,den):
        if num is not None and den not in (None,0): out[k]=round(num/den,4)
    put('framlegd', (sala-abs(kv)) if (sala is not None and kv is not None) else None, sala)
    put('ebit_hlutfall', ebit, sala)
    put('hagnadarhlutfall', hagn, sala)
    put('ROE', hagn, efe)
    put('ROA', hagn, eignir)
    put('eiginfjarhlutfall', efe, eignir)
    if stskuld: put('veltufjarhlutfall', velta, stskuld)
    put('skuldahlutfall_DE', skuldir, efe)
    put('eignavelta', sala, eignir)
    # Heilbrigðis-vörn gegn dálka-skekkju (t.d. rangur söludálkur eins árs): definitional þök.
    # Framlegð ≤ 100% (sala−kostn ≤ sala); eiginfjárhlutfall ≤ 100% (e.fé ≤ eignir). Gildi utan → þáttunarvilla → sleppa.
    if 'framlegd' in out and not (-2.0 <= out['framlegd'] <= 1.0): del out['framlegd']
    if 'eiginfjarhlutfall' in out and not (-1.5 <= out['eiginfjarhlutfall'] <= 1.0): del out['eiginfjarhlutfall']
    # Neikvætt eigið fé (t.d. Kaffitár): ROE (hagn/e.fé) og D/E (skuldir/e.fé) verða VILLANDI —
    # tap ÷ neikvætt eigið fé gefur JÁKVÆTT "ROE" (tap birtist sem arðsemi). Sleppum þeim;
    # eiginfjárhlutfall (neikvætt), ROA og hagnaðarhlutfall sýna raunstöðuna rétt.
    if efe is not None and efe <= 0:
        out.pop('ROE', None); out.pop('skuldahlutfall_DE', None)
    return out

if __name__ == '__main__':
    res = parse(sys.argv[1])
    # RSK-taflan er ÁBYRG heimild um reikningsár skýrslunnar (sent sem argv[2]). PDF-hausgreining
    # er brothætt: dagsetningar, gjalddagar skuldabréfa eða skýringarár geta lekið inn (Íslandsbanki
    # las ranglega "2026"). Dálkaröð er ALLTAF [líðandi, fyrra] eftir stöðu → treystum þekkta árinu
    # fyrir MERKINGAR: [known, known-1]. (19xx leyft fyrir gömul skil, t.d. 1997.)
    known = next((int(a) for a in sys.argv[2:] if re.match(r'^(19|20)\d\d$', a)), None)
    if known is not None:
        res['ar'] = [known, known - 1]
    res['kpi'] = {}
    for idx, ar in enumerate(res['ar']):
        if ar is not None:
            res['kpi'][str(ar)] = kpis(res, idx)
    print(json.dumps(res, ensure_ascii=False, indent=1))
