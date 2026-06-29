# Byggir jofnun.json úr Heildaryfirlitum Jöfnunarsjóðs (PDF).
# 2025: fullt per-flokks fylki með x-hnit-böndun (pdfplumber). 2026: endurskoðað kerfi (ný lög) -> bara heildartölur.
# Notkun: python build_jofnun.py <2025.pdf> <2026.pdf> <out.json>
import sys, re, json, pdfplumber

def isnum(s): return bool(re.match(r'^-?\d[\d.]*$', s))
def val(s): return int(s.replace('.', '').replace('−', '-'))
ALIAS = {"Seltjarnarneskaupstaður": "Seltjarnarnes", "Hafnarfjarðarkaupstaður": "Hafnarfjörður",
         "Akureyrarkaupstaður": "Akureyrarbær", "Stykkishólmsbær": "Sveitarfélagið Stykkishólmur"}
def norm(name):
    name = name.strip().rstrip('*').strip()
    return ALIAS.get(name, name)
CATLABELS = ["Sameiningar sveitarfélaga", "Fjárhagserfiðleikar", "Sérstök verkefni",
             "Tekjujöfnun", "Útgjaldajöfnun", "Almenn grunnskólaframlög",
             "Sérþarfir fatlaðra nemenda", "Íslenska sem annað tungumál", "Önnur framlög",
             "Jöfnun fasteignaskatts", "Efling tónlistarnáms", "Farsæld barna",
             "Gjaldfrjálsar skólamáltíða"]

def lines_of(path):
    pdf = pdfplumber.open(path)
    out = []
    for pg in pdf.pages:
        groups = {}
        for w in pg.extract_words(keep_blank_chars=False):
            groups.setdefault(round(w['top'] / 3.0), []).append(w)
        for k in sorted(groups):
            out.append(sorted(groups[k], key=lambda w: w['x0']))
    return out

def parse_matrix(path):
    rows = lines_of(path); cols = None; nat = None
    for line in rows:
        if line and line[0]['text'] == 'Samtals':
            nums = [w for w in line if isnum(w['text'])]
            if len(nums) >= 14 and cols is None:
                cols = [(w['x0'] + w['x1']) / 2 for w in nums]
                nat = [val(w['text']) for w in nums]
    m = {}
    for line in rows:
        if not line or not re.match(r'^\d{4}$', line[0]['text']):
            continue
        i = 1; nm = []
        while i < len(line) and not isnum(line[i]['text']):
            nm.append(line[i]['text']); i += 1
        vec = [0] * len(cols)
        for w in line[i:]:
            if not isnum(w['text']):
                continue
            cx = (w['x0'] + w['x1']) / 2
            j = min(range(len(cols)), key=lambda c: abs(cols[c] - cx))
            vec[j] = val(w['text'])
        m[norm(' '.join(nm))] = {'t': vec[-1], 'ibuar': vec[0], 'c': vec[1:-1]}
    return m, nat[1:-1], nat[-1]

def parse_totals(path):
    rows = lines_of(path); m = {}; nattot = None
    for line in rows:
        nums = [w['text'] for w in line if isnum(w['text'])]
        if line and line[0]['text'] == 'Samtals' and nums:
            nattot = val(nums[-1])
        if not line or not re.match(r'^\d{4}$', line[0]['text']) or not nums:
            continue
        i = 1; nm = []
        while i < len(line) and not isnum(line[i]['text']):
            nm.append(line[i]['text']); i += 1
        m[norm(' '.join(nm))] = val(nums[-1])
    return m, (nattot if nattot else sum(m.values()))

m25, cats25, total25 = parse_matrix(sys.argv[1])
m26, total26 = parse_totals(sys.argv[2])
for nm, o in m25.items():
    o['t2'] = m26.get(nm)
out = {'ar': 2025, 'ar2': 2026, 'reform2026': True, 'catLabels': CATLABELS, 'cats': cats25,
       'total': total25, 'total2': total26, 'm': m25}
json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False)
bad = [nm for nm, o in m25.items() if abs(sum(o['c']) - o['t']) > 5]
unmatched = [nm for nm in m26 if nm not in m25]
print("2025 munis", len(m25), "cat-sum mismatches:", bad)
print("2025 total", f"{total25:,}", "sum(cats)", f"{sum(cats25):,}")
print("2026 munis", len(m26), "total2026", f"{total26:,}")
print("2026 names not matching 2025:", unmatched)
print("2025 munis with no 2026 match:", [nm for nm, o in m25.items() if o['t2'] is None])
