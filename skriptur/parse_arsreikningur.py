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
    ('eignir',          r'^eignir samtals'),
    ('hlutafe',         r'^hlutaf.'),
    ('eigid_fe',        r'^eigi. f.( samtals)?$'),
    ('langtimaskuldir', r'langt.maskuldir samtals'),
    ('skammtimaskuldir',r'skammt.maskuldir samtals'),
    ('skuldir',         r'^skuldir samtals'),
    ('efe_skuldir',     r'eigi. f. og skuldir samtals'),
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
def take_years(nums):
    """síðustu 2 tölutákn = [líðandi ár, fyrra ár]; hendir skýringar-dálki (1–99)."""
    vals = []
    for n in nums:
        if NOTEREF.match(n):          # ber skýringarnúmer (t.d. "2", "15") — ekki fjárhæð ('0' heldur sér)
            continue
        v = to_num(n)
        if v is not None: vals.append(v)
    if not vals: return (None, None)
    if len(vals) == 1: return (vals[0], None)
    return (vals[-2], vals[-1])

def detect_scale(text):
    lo = text.lower()
    scale, cur = 1, None
    # Framsetningar-yfirlýsing ("Ársreikningur er birtur í [þúsundum|milljónum] [íslenskra króna|evra]").
    # AKKERUM á framsetningar-sögn + kvarða-orð Í SÖMU LÍNU. Tvær ástæður:
    #   (1) "milljónum" (1e6) þarf að greinast, ekki bara "þúsundum" (1e3);
    #   (2) prósa sem nefnir evrur annars staðar (t.d. "færa bókhald í evrur frá 2026") má EKKI
    #       yfirtaka raunverulega uppgjörsmynt ("íslenskra króna").
    # Broddstafir brenglast í RSK-PDF → ASCII-kjarnar lifa af: 'millj','sund','kr','evr','slensk'.
    for m in re.finditer(r'(?:birt\w*|fj.rh..ir\s+eru|ger.\w*\s+upp|sett\w*\s+fram|amounts?|presented|expressed|stated)[^\n]{0,75}', lo):
        seg = m.group(0)
        if 'millj' in seg or 'million' in seg: scale = 1000000
        elif 'sund' in seg or 'thousand' in seg: scale = 1000
        else: continue   # engin kvarða-yfirlýsing í þessum glugga
        if 'evr' in seg or 'eur' in seg: cur = 'EUR'
        elif 'usd' in seg or 'bandar' in seg or 'dollar' in seg: cur = 'USD'
        elif 'gbp' in seg or 'sterling' in seg or 'pund' in seg: cur = 'GBP'
        elif 'kr' in seg or 'slensk' in seg or 'isl' in seg: cur = 'ISK'
        break            # fyrsta gild yfirlýsing ræður
    if scale == 1 and re.search(r'(.sundum|thousands)', lo): scale = 1000   # varaleið (gömul hegðun)
    if cur is None:      # engin mynt í yfirlýsingu → varaleið
        if re.search(r'.sundum\s+evr|millj.num\s+evr|thousands?\s+of\s+eur', lo): cur = 'EUR'
        elif re.search(r'\busd|bandar', lo): cur = 'USD'
        elif re.search(r'gbp|sterling', lo): cur = 'GBP'
        else: cur = 'ISK'
    return scale, cur

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
            'rekstur': rekstur, 'efnahagur': efnahagur, 'afleitt': afleitt}

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
    return out

if __name__ == '__main__':
    res = parse(sys.argv[1])
    res['kpi'] = {}
    for idx, ar in enumerate(res['ar']):
        if ar is not None:
            res['kpi'][str(ar)] = kpis(res, idx)
    print(json.dumps(res, ensure_ascii=False, indent=1))
