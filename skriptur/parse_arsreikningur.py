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
    # (~1000x of lágt), eignavelta rúnn í 0. Meðhöndlum sem þúsund AÐEINS þegar ótvírætt: komma-hópar
    # með NÁKVÆMLEGA 3 tölustöfum; einn hópur krefst heiltöluhluta ≠ '0', FLEIRI en einn hópur er alltaf
    # þúsund ('1,863,734' Icelandair, '131,363,175' Geo Travel — ensk-sniðnar skýrslur). Raunverulegir
    # aukastafir ('0,17', '12,5', '0,123') og punkt-þúsund ('1.234.567,89') haldast ÓBREYTT.
    m = re.match(r'^(\d{1,3})((?:,\d{3})+)$', t)
    if m and (m.group(1) != '0' or m.group(2).count(',') > 1):
        v = int(m.group(1) + m.group(2).replace(',', ''))
        return -v if neg else v
    t = t.replace('.', '').replace(',', '.')
    try:
        v = float(t)
    except ValueError:
        return None
    if v == int(v): v = int(v)
    return -v if neg else v

NUMRE = re.compile(r'^\(?-?[\d][\d.]*(?:,\d+)*\)?$')   # (?:,\d+)* leyfir ensk fjölhópa-þúsund '1,863,734'
def is_num(tok): return bool(NUMRE.match(tok)) and any(c.isdigit() for c in tok)

# ---- kortlagning: reitur -> listi af ASCII-beinagrindar-regex (fyrsti hittir) ----
# '.' í regex passar við brenglaða broddstafi.  Raðað eftir sérhæfni.
REKSTUR_MAP = [
    # ^leigutekjur = fasteignafélög (Reitir/Reginn o.fl.); EKKI "hreinar leigutekjur" (millisumma, byrjar á "hreinar")
    # ⚠ sala\b (ekki ^sala) — enska síðuvalið gerir annars 'Salaries' að sölu. 'hreinar rekstrartekjur' = bankar.
    # 'tekjur\s*(\.{2,}|$)' = ber 'Tekjur'-lína (m/leiðurum) en EKKI 'Tekjur af hlutdeildarfélögum'.
    ('sala',            r'^(sala\b|seldar (v|afur)|seld (verktaka)?.j.nusta|rekstrartekjur|v.rusala|v.ru- ?og .j.nustusala|s.lutekjur|tekjur samt|tekjur af verksamning|tekjur af v.trygg|tekjur\s*(\.{2,}|$)|leigutekjur|h.saleigutekjur|flutningatekjur|hreinar rekstrartekjur|(total )?operating income$|total revenue|net sales)'),
    ('adrar_tekjur',    r'^(a.rar (rekstrar)?tekjur|a.rar tekjur)'),
    # rekstrarkostnaður fjárfestingareigna = beinn kostnaður leigutekna (fasteignafélög) -> framlegð = hreinar leigutekjur
    ('kostnadarverd',   r'(kostna.arver. seldra|seldra vara|rekstrarkostna.ur fj.rfestingar|^v.runotkun|^verktaka- og byggingakostna|^rekstur h.sn..is|^framkv.mdakostna)'),
    ('laun',            r'^(laun|salaries)'),
    # + stjórnunarkostnaður / skrifstofu- og stjórnunarkostnaður (fasteigna-/eignarhaldsfélög)
    ('annar_rekstur',   r'(^annar rekstrarkostna|^almennur rekstrarkostna|^stj.rnunarkostna|^skrifstofu.*stj.rnunar)'),
    ('matsbreyting',    r'^matsbreyting'),   # matsbreyting fjárfestingareigna (gangvirðisbreyting) — stór í fasteignafélögum
    ('afskriftir',      r'^(afskrift|depreciation)'),
    # EBITDA VERÐUR að standa á undan ebit — 'Rekstrarhagnaður fyrir afskriftir' er EBITDA, ekki EBIT
    # (greip áður ebit hjá Nova/Advania/Eik/Skeljungi). ebit-fallback (ebitda−afskriftir) í parse().
    ('ebitda',          r'(^ebitda|[ ,(]ebitda\)?|^rekstrar(hagna.ur|tap|afkoma) fyrir (afskrift|s.luhagna))'),
    ('ebit',            r'(rekstrarhagna.ur|rekstrartap|fyrir fj.rmunatekjur|.n fj.rmunatekna|fyrir afskriftir og fj|fyrir fj.rmagnsli.i|\(ebit\))'),
    ('fjarmagnsgjold',  r'(fj.rmagnsgj.ld|vaxtagj.ld|hrein fj.rmagnsgj|^finance costs?\b)'),
    ('fjarmunatekjur',  r'(fj.reignatekjur|vaxtatekjur|fj.rmunatekjur|^finance income)'),
    # sérskattar banka (renna í tekjuskatt í parse()); aflagd Á UNDAN hagnadur (annars gleypir hagnadur
    # 'Hagnaður ársins ... af eignum haldið til sölu')
    ('fjarsysluskattur',r'^s.rstakur fj.rs.sluskatt'),
    ('bankaskattur',    r'^s.rstakur skattur . fj.rm.lafyrirt'),
    ('aflagd',          r'haldi. til s.lu|af aflag.ri starfsemi'),
    # hagn_f_skatt Á UNDAN hagnadur: '(Tap) ársins fyrir tekjuskatt' passar annars hagnadur-regexið
    ('hagn_f_skatt',    r'(hagna.ur|tap|afkoma)\)?( ?\((hagna.ur|tap)\))?( .rsins| af reglulegri starfsemi)? (fyrir (tekju)?skatt|f.r skatt)|\(ebt\)|^(loss|profit) before (income )?tax'),
    ('tekjuskattur',    r'^(reikna.ur )?tekjuskattur|^income tax'),
    # víkkað: '(Tap), hagnaður ársins' · 'Hagnaður (tap) og heildarafkoma ársins' · 'Heildarhagnaður ársins'
    # · 'Rekstrarafkoma ársins' · 'á tímabilinu' · enska. ⚠ 'Heildarafkoma ársins' (hrein OCI-lína) grípst
    # VILJANDI ekki — heildar-forskeytið er bundið við (hagna.ur|tap).
    ('hagnadur',        r'^\(?-? ?(heildar(hagna.ur|tap)|hagna.ur|tap|rekstrarafkoma|afkoma)\)?[,;]?( ?\(?-? ?(hagna.ur|tap)\)?)?( og (.nnur )?heildar(hagna.ur|afkoma|tap))?.{0,10}(.rsins|t.mabil)|^(net )?(loss|profit|income) for the year'),
]
EFNAHAGUR_MAP = [
    # Ber form '^X[ .]*$' (hörð ankeri + leyfðir leiðarapunktar) nær 'Veltufjármunir'-línu án 'samtals'
    # en HAFNAR 'Veltufjármunir umfram skammtímaskuldir' o.þ.h. Enska fyrir IFRS-skýrslur.
    ('fastafjarmunir',  r'fastafj.rmunir samtals|^fastafj.rmunir[ .]*$|^non-current assets\b'),
    ('birgdir',         r'(^v.rubirg.ir|^birg.ir|^inventories\b)'),
    ('vidskiptakrofur', r'(vi.skiptakr.fur|skammt.makr.fur|^trade and other receivables)'),
    ('handbaert',       r'(handb.rt f|sj..ur og banka|bankainnst|innl.nsstofn|cash and cash equivalents)'),
    ('veltufjarmunir',  r'veltufj.rmunir samtals|^veltufj.rmunir[ .]*$|^current assets\b'),
    ('eignir',          r'^eignir (samtals|alls)|^eignir$|^total assets\b'),
    ('hlutafe',         r'^hlutaf.|^share capital\b'),
    # EKKI 'Óráðstafað eigið fé' (^-ankeri) né '...hluthafa móðurfélags' né '...og skuldir'
    ('eigid_fe',        r'^(samtals )?eigi. f.(,| \(| samtals| alls|$)|^total equity$'),
    ('langtimaskuldir', r'langt.maskuldir samtals|^langt.maskuldir[ .]*$|^non-current liabilities\b'),
    ('skammtimaskuldir',r'skammt.maskuldir samtals|^skammt.maskuldir[ .]*$|^current liabilities\b'),
    ('skuldir',         r'^skuldir (samtals|alls)|^samtals skuldir$|^skuldir$|^skuldir og skuldbindingar|^total liabilities\b'),
    ('efe_skuldir',     r'eigi. f. og skuldir( samtals| alls)?|^skuldir og eigi. f.( samtals| alls)?|^total equity and liabilities'),
]

# ── Tákna-pípa fyrir rows_of_page (röðin skiptir máli: svigar → leiðarar → jaðar-punktar) ──
_OPEN  = re.compile(r'^\.*\(\.*$')                 # stakt '(' , má bera leiðarapunkta ('.....(.')
_CLOSE = re.compile(r'^\.*\)\.*$')                 # stakt ')'
_FRAG  = re.compile(r'^[\d.,\s]*\d[\d.,]*\)?\.*$') # tölubrot, má enda á ')' + leiðara

def join_parens(toks):
    """Neikvæð tala klofin í tákn: '(' '282.838' ')' -> '(282.838)' ; '(' '8' '91.133)' -> '(891.133)'.
    Krefst STAKS '('-tákns — samföst '(50.478)' fara óbreytta leið (engin regressjón)."""
    out, i = [], 0
    while i < len(toks):
        if _OPEN.match(toks[i]):
            j, frag, closed = i + 1, [], False
            while j < len(toks) and len(frag) < 4:
                if _CLOSE.match(toks[j]): closed = True; j += 1; break
                if not _FRAG.match(toks[j]): break
                frag.append(toks[j]); j += 1
                if ')' in frag[-1]: closed = True; break
            if closed and frag:
                out.append('(' + re.sub(r'[^\d.,]', '', ''.join(frag)) + ')')
                i = j; continue
        out.append(toks[i]); i += 1
    return out

_GLUE = re.compile(r'^[.\s]*\(?[\d.,\s]*\d[\d.,\s]*\)?[.\s]*$')
def unfuse(t):
    """Tákn með '..' OG tölustaf = tala flækt í punktaleiðara ('.....3...558.639').
    '..' kemur ALDREI fyrir í löglegri íslenskri tölu ('1.234.567') → öruggt merki."""
    if '..' in t and any(c.isdigit() for c in t) and _GLUE.match(t):
        d = re.sub(r'\D', '', t)
        if 3 <= len(d) <= 12:
            return ('(' + d + ')') if ('(' in t or ')' in t) else d
    return t

def _clean_tok(t):
    """Strípar leiðarapunkta af jöðrum tákns. Snertir ekki '31.12.2024' (endar á tölustaf)."""
    s = t.strip().strip('.')
    return s if s else t   # hreinn leiðari ('......') helst óbreyttur -> fer í label

# Kaflahausar sem mega bíða ómerktrar summuraðar (pending). ⚠ ALDREI fastafjarmunir/veltufjarmunir/
# fjarmunatekjur — kaflahaus + undirsumma Á UNDAN réttri heild myndi grípa ranga tölu (Geo Travel).
PENDING_OK = {'sala', 'eignir', 'eigid_fe', 'skuldir', 'efe_skuldir'}

def rows_of_page(pg, ytol=4):
    # Gap-klösun í stað fastrar round(top/ytol)-fötunar: föst námundunarmörk klufu sjónlínur
    # sem lentu sitt hvoru megin marka (merki í einni fötu, tölurnar í annarri → reitur tómur).
    # Línubil ársreikninga er ≥9pt svo ytol=4 sameinar aldrei tvær raunlínur en þolir ~4pt
    # grunnlínu-hliðrun (feitletrað merki vs fjárhæðir).
    words = sorted(pg.extract_words(), key=lambda w: (w['top'], w['x0']))
    lines, cur, last = [], [], None
    for w in words:
        if last is not None and w['top'] - last > ytol:
            lines.append(cur); cur = []
        cur.append(w); last = w['top']
    if cur: lines.append(cur)
    out = []
    for ln in lines:
        ws = sorted(ln, key=lambda w: w['x0'])
        toks = [w['text'] for w in ws]
        toks = join_parens(toks)               # (i)  FYRST: svigasamruni ('.273)' gildran annars)
        toks = [unfuse(t) for t in toks]       # (ii) SVO: leiðara-afbræðsla
        toks = [_clean_tok(t) for t in toks]   # (iii) jaðar-punktastrípun
        label = ' '.join(t for t in toks if t and not is_num(t)).strip()
        nums  = [t for t in toks if t and is_num(t)]
        if label or nums:                      # (iv) halda LÍKA merkislausum talnaröðum (pending-logík)
            out.append((label, nums, min(w['top'] for w in ws)))
    # (v) munaðarlausra-líming: fjárhæðaröð án merkis límist við merkisröð beint á undan sem hefur
    #     ENGAR tölur EÐA AÐEINS skýringarnúmer ('Eigið fé 12' + fjárhæðir á 4–6pt öðrum grunnlínu-y —
    #     algengasta klofningsformið; take_years strippar skýringarnr framan af eftir samruna).
    #     ⚠ ÞRJÁR varnir: (a) aðeins raunverulegar fjárhæðir límast (stök '375'/'11' eru síðutöl),
    #     (b) hreinir ártalahausar ('2024 2023') aldrei, (c) y-nálægð ≤ 7pt — kaflahaus og næsta
    #     raun-lína eru ≥9pt í sundur svo undirsummuröð límist ALDREI við kaflahaus (Geo Travel gildran).
    merged = []
    for label, nums, top in out:
        if (not label and nums and merged and _mergeable_nums(nums)
                and merged[-1][0] and all(NOTEREF.match(t) for t in merged[-1][1])
                and top - merged[-1][2] <= 7):
            merged[-1] = (merged[-1][0], merged[-1][1] + nums, merged[-1][2])
        else:
            merged.append((label, nums, top))
    return [(l, n) for l, n, _ in merged]

def _mergeable_nums(nums):
    toks = [t for t in nums if not NOTEREF.match(t)]
    if not toks: return False
    if all(re.fullmatch(r'(19|20)\d\d', t) for t in toks): return False   # ártala-dálkahaus
    if len(toks) >= 2: return True
    t = toks[0]
    return ('.' in t or ',' in t or abs(to_num(t) or 0) > 999)   # ein tala: aðeins augljós fjárhæð

def match(label, mp):
    lo = label.lower()
    for field, rx in mp:
        if re.search(rx, lo):
            return field
    return None

NOTEREF = re.compile(r'^[1-9]\d?[.)]?$')   # skýringarnúmer 1–99 (líka "2.", "15)") — ⚠ ALDREI svigatölur:
#   '(79)' er neikvæð fjárhæð (USD-milljóna-skýrslur t.d. Alcoa), skýringarnúmer eru aldrei í svigum
DATERE  = re.compile(r'^\d{1,2}\.\d{1,2}\.(19|20)\d\d$')  # dagsetningardálkur "31.12.2025" = EKKI fjárhæð
#   (miðhópur 1–2 tölur aðgreinir dagsetningu frá þúsundatölu "31.122.025" sem hefur 3ja-stafa hópa)
def take_years(nums):
    """síðustu 2 tölutákn = [líðandi ár, fyrra ár]; hendir dagsetningum og skýringar-dálki FRAMAN AF.
    Skýringardálkurinn stendur ALLTAF vinstra megin við fjárhæðadálkana → strippum NOTEREF aðeins
    fremst — aldrei aftast, því þar geta smáar fjárhæðir (t.d. '16' m.kr) verið raunveruleg gildi.
    Áður henti sían '155' EKKI en '16' JÚ úr ['6','155','16'] → dálkaskekkja í stað (155,16)."""
    toks = [t for t in nums if not DATERE.match(t)]
    while toks and NOTEREF.match(toks[0]):
        rest = toks[1:]
        # strippa aðeins ef nóg er eftir fyrir fjárhæðadálka, eða eftirstandandi er augljós fjárhæð
        if len(rest) >= 2 or (rest and ('.' in rest[0] or ',' in rest[0] or abs(to_num(rest[0]) or 0) > 999)):
            toks = rest
        else:
            break
    # Kaflahaus með aðeins skýringarnúmeri ('Eigið fé  12') má ALDREI verða fjárhæð — annars stíflar
    # hann reitinn á undan réttu heildarröðinni (Samskip eigid_fe→12). Sama hegðun og fyrir breytingu.
    if toks and all(NOTEREF.match(t) for t in toks):
        return (None, None)
    vals = [v for v in (to_num(t) for t in toks) if v is not None]
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
    if re.search(r'\bnok\b|norsk', seg): return 'NOK'   # Á UNDAN ISK — annars étur 'kr.n' 'norskum krónum'
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
        seg = lo[max(0, m.start() - 55):m.end() + 55]
        # framtíðarbreyting ('Frá og með 1. janúar 2026 mun starfrækslugjaldmiðill ... vera í evrum' —
        # Síldarvinnslan) er EKKI uppgjörsmynt ÞESSA árs → halda áfram á næsta treff
        if re.search(r'fr. og me.|\bmun\b', seg): continue
        c = _cur_of(seg)
        if c: cur = c; break
    # Tier 2: framsetning fjárhæða ("fjárhæðir eru í X", "amounts are in X", "presented in X").
    if cur is None:
        for m in re.finditer(r'(?:fj.rh..ir[^.\n]{0,20}(?:eru|birt)|amounts?\s+(?:are\s+|presented\s+)?in|presented\s+in|expressed\s+in|birt\w*\s+[i.]\s|ger.\w*(?:\s+og\s+birt\w*)?\s+(?:upp\s+)?[i.]\s|allar upph..ir\s+(?:eru\s+)?[i.]\s)[^.\n]{0,45}', lo):
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

# Meðalfjöldi starfsmanna/ársverka úr skýringum (best-effort; ártöl útilokuð). Skilar heiltölu eða None.
def parse_starfsmenn(fulltext):
    t = fulltext.lower()
    # AÐEINS fjölda-orðasambönd (ekki "starfsmannakostnaður"); standalone-tala (ekki hluti þúsundaskil-tölu).
    pats = [r'me[ðd]al(?:fj[öo]ldi|tal)\w*\s+(?:starfsm\w+|[áa]rsverk\w*|st[öo][ðd]ugild\w*)',
            r'fj[öo]ldi\s+starfsm\w+', r'st[öo][ðd]ugild\w*', r'[áa]rsverk\w*']
    for p in pats:
        for m in re.finditer(p, t):
            for ns in re.findall(r'(\d{1,4})(?![\d.,])', t[m.end(): m.end() + 160]):
                n = int(ns)
                if 0 < n < 20000 and not (1900 <= n <= 2099):
                    return n
    return None

def parse(path):
    pdf = pdfplumber.open(path)
    fulltext = '\n'.join((p.extract_text() or '') for p in pdf.pages)
    skannad = not fulltext.strip()   # myndskannað PDF án textalagas → engin þáttun möguleg (OCR er sér-braut)
    scale, cur = detect_scale(fulltext)
    rekstur, efnahagur = {}, {}
    ar_cur = ar_prev = None
    for pg in pdf.pages:
        low = (pg.extract_text() or '').lower()
        lines5 = [l.strip() for l in low.split('\n')[:5]]
        header = ' '.join(lines5)
        first = next((l for l in lines5 if l), '')
        # ── HÖFNUN (á undan flokkun) ──
        if re.match(r'sk.ringar\b', first):
            continue   # skýringasíður — kaflahausar ('5. Rekstrartekjur') gabba annars flokkunina
        if re.match(r'efnisyfirlit|contents\b', first):
            continue   # efnisyfirlit
        if re.match(r'.ritun|sk.rsla( og yfirl.sing)? stj.rnar|yfirl.sing stj.rnar|independent auditor', first):
            continue   # áritun endurskoðenda / skýrsla stjórnar — álitstextinn telur upp reikningsheiti
                       # ('...rekstrarreikning, efnahagsreikning...') og flokkast annars sem reikningssíða
        if not re.search(r'rekstrarreikning|efnahagsreikning', header) and (
                len(re.findall(r'\b20\d\d\b', header)) >= 4
                or re.search(r'helstu uppl.singar|yfirlit stj.rnenda|lykilst.r.ir|.rsfj.r.ungsyfirlit|\b.rsfj\.', header)):
            continue   # 5-ára stjórnendayfirlit / ársfjórðungatöflur (Landsvirkjun, HS Orka)
        # ── FLOKKUN — línu-ankeruð leit (óankeruð leit í samlímdum haus lak prósa inn) + enska (IFRS) ──
        is_rekstur = ('rekstrarreikning' in header
            or any(re.match(r'(seldar v.rur|rekstrartekjur)\b', l) for l in lines5)
            or any(re.match(r'(consolidated |group )?(income statement|statement of (profit or loss|comprehensive income))', l) for l in lines5))
        is_efnahag = ('efnahagsreikning' in header or 'efnahags' in header
            or any(re.match(r'eignir\b|eigi. f. og skuldir|yfirlit um fj.rhagsst', l) for l in lines5)
            or any(re.match(r'(consolidated |group )?(statement of financial position|balance sheet)', l) for l in lines5))
        is_sjodstr = (not is_rekstur and not is_efnahag) and bool(re.search(r'sj..streymi', header))
        if not (is_rekstur or is_efnahag or is_sjodstr):
            continue
        # sjóðstreymis-fallback: AÐEINS hagnaður (efsta lína yfirlits) — aldrei MAP-in
        # (annars mengast efnahagur af 'Skammtímaskuldir, hækkun' o.þ.h.)
        if is_sjodstr:
            for label, nums in rows_of_page(pg):
                vals = take_years(nums)
                if vals[0] is None:
                    continue
                if 'hagnadur' not in rekstur and re.search(
                        r'^\(?(hagna.ur|tap)\)?( ?\(?(hagna.ur|tap)\)?)?.{0,20}(samkv.mt rekstrarreikningi|.rsins)',
                        label.lower()):
                    rekstur['hagnadur'] = vals
            continue
        pending = None   # (dict, reitur) — kaflahaus bíður ómerktrar summuraðar (sjá PENDING_OK)
        for label, nums in rows_of_page(pg):
            # ártöl úr haus (t.d. "2024 2023" eða "31.12.2024") — VERÐUR að standa á undan ártalapars-vörninni
            if ar_cur is None:
                ys = re.findall(r'\b(20\d\d)\b', ' '.join(nums))
                if len(ys) >= 2: ar_cur, ar_prev = int(ys[0]), int(ys[1])
            # ártalapars-vörn: dálkahaus 'Rekstrartekjur Skýring 2024 2023' — ártöl, ekki fjárhæðir
            raw = [t for t in nums if not NOTEREF.match(t)]
            if (len(raw) == 2 and all(re.fullmatch(r'(19|20)\d\d', t) for t in raw)
                    and raw[0].isdigit() and raw[1].isdigit() and int(raw[0]) == int(raw[1]) + 1):
                continue
            vals = take_years(nums)
            if vals[0] is None:
                # talnalaus röð: kaflahaus ('Rekstrartekjur', 'Eigið fé:') virkjar pending á hvítlistaðan
                # reit; hver önnur talnalaus röð AFTURKALLAR (stöðvar leka milli kafla).
                pending = None
                lbl = label.rstrip().rstrip(':')
                if lbl and is_statement_label(lbl):
                    if is_rekstur:
                        f = match(lbl, REKSTUR_MAP)
                        if f in PENDING_OK and (f not in rekstur or f == 'sala'):
                            pending = (rekstur, f)
                    if pending is None and is_efnahag:
                        f = match(lbl, EFNAHAGUR_MAP)
                        if f in PENDING_OK and f not in efnahagur:
                            pending = (efnahagur, f)
                continue
            # tvípunkts-vörn: töflufyrirsögn MEÐ tölum ('...sundurliðast þannig: 123 456') — aldrei reikningslína
            if label.rstrip().endswith(':'):
                continue
            if not label:
                # merkislaus talnaröð: fyllir AÐEINS virkt pending; hreinar ártalaraðir aldrei.
                if pending and not all(isinstance(v, int) and 1990 <= v <= 2100 for v in vals if v is not None):
                    d, f = pending
                    if f not in d:
                        d[f] = list(vals)
                    elif f == 'sala' and vals[0] is not None and d[f][0] is not None and vals[0] >= d[f][0]:
                        d[f] = list(vals)   # millisumma ≥ íhlutur: 'Sala á heitu vatni' 687m → heild 28.348m (Veitur)
                pending = None
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
    # Eignir = Eigið fé og skuldir (reikningsjafnan; FREMST svo hinar afleiðslurnar byggi á henni)
    if 'eignir' not in efnahagur and 'efe_skuldir' in efnahagur:
        efnahagur['eignir'] = list(efnahagur['efe_skuldir'])
        afleitt.append('eignir')
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
    # sérskattar banka (fjársýsluskattur/bankaskattur) renna inn í tekjuskatt (Kvika/Íslandsbanki/Arion)
    for extra in ('fjarsysluskattur', 'bankaskattur'):
        if extra in rekstur:
            ts = rekstur.get('tekjuskattur') or [None, None]
            ex = rekstur.pop(extra)
            rekstur['tekjuskattur'] = [((ts[i] or 0) + (ex[i] or 0)) if (ts[i] is not None or ex[i] is not None) else None for i in range(2)]
    # ebit-fallback þegar aðeins EBITDA-lína er til (fylgifiskur ebitda-forgangsins í REKSTUR_MAP)
    if 'ebit' not in rekstur and 'ebitda' in rekstur and 'afskriftir' in rekstur:
        rekstur['ebit'] = [(rekstur['ebitda'][i] - abs(rekstur['afskriftir'][i]))
                           if (rekstur['ebitda'][i] is not None and rekstur['afskriftir'][i] is not None) else None
                           for i in range(2)]
        afleitt.append('ebit')
    return {'ar': [ar_cur, ar_prev], 'mynt': cur, 'kvardi': scale, **({'skannad': True} if skannad else {}),
            'rekstur': rekstur, 'efnahagur': efnahagur, 'afleitt': afleitt,
            'starfsmenn': parse_starfsmenn(fulltext),
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
