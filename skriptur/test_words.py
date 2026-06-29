import sys, re, pdfplumber
def isnum(s): return bool(re.match(r'^-?\d[\d.]*$', s))
def val(s): return int(s.replace('.', '').replace('−', '-'))
pdf = pdfplumber.open(sys.argv[1])
rows = []
cols = None
for pg in pdf.pages:
    ws = pg.extract_words(keep_blank_chars=False)
    lines = {}
    for w in ws:
        lines.setdefault(round(w['top'] / 3.0), []).append(w)
    for k in sorted(lines):
        line = sorted(lines[k], key=lambda w: w['x0'])
        if line and line[0]['text'] == 'Samtals':
            nums = [w for w in line if isnum(w['text'])]
            if len(nums) >= 15:
                cols = [(w['x0'] + w['x1']) / 2 for w in nums]
        rows.append(line)
print("COLS", len(cols) if cols else None)
ok = bad = 0
examples = []
for line in rows:
    if not line or not re.match(r'^\d{4}$', line[0]['text']):
        continue
    i = 1; name = []
    while i < len(line) and not isnum(line[i]['text']):
        name.append(line[i]['text']); i += 1
    vec = [0] * len(cols)
    for w in line[i:]:
        if not isnum(w['text']):
            continue
        cx = (w['x0'] + w['x1']) / 2
        j = min(range(len(cols)), key=lambda c: abs(cols[c] - cx))
        vec[j] = val(w['text'])
    nm = ' '.join(name)
    cats = vec[1:14]; total = vec[14]
    match = abs(sum(cats) - total) <= 5
    ok += match; bad += (not match)
    if nm in ('Kópavogsbær', 'Reykjavíkurborg', 'Mýrdalshreppur'):
        examples.append((nm, sum(cats), total, match, cats))
print("rows ok", ok, "bad", bad)
for e in examples:
    print(e)
