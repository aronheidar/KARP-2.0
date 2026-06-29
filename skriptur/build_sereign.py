# Parsar séreignarsjóða-samanburð aurbjörgu (vistað _aurbjorg.html) -> sereign.json
# Reitir per sjóð: nafn, sjóðafjölskylda, vörsluaðili, áhætta(1-5), 10-ára raunávöxtun, meðlimir, % erlend mynt.
import re, json, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else "_aurbjorg.html"
OUT = sys.argv[2] if len(sys.argv) > 2 else "sereign.json"
h = open(SRC, encoding="utf-8").read()

prov = [(m.start(), m.group(1)) for m in re.finditer(r'/images/[a-z0-9_/\-]+\.png"\s*alt="([^"]*)"', h)]
anchors = list(re.finditer(r'<a href="/lifeyrismal/sereign/([a-z0-9\-]+)">([^<]+)</a>', h))

def fnum(s):  # decimal comma -> float
    if s is None: return None
    s = s.strip().replace('.', '').replace(',', '.')
    try: return float(s)
    except: return None
def inum(s):  # thousands dots -> int
    if s is None: return None
    try: return int(s.replace('.', ''))
    except: return None

funds = []
for i, a in enumerate(anchors):
    start, end = a.start(), (anchors[i+1].start() if i+1 < len(anchors) else len(h))
    card = h[start:end]
    fam = a.group(2).strip()
    sub = re.search(r'text-muted-foreground text-xs">([^<]+)</div>', card)
    name = sub.group(1).strip() if sub else fam
    risk = re.search(r'pl-3">(\d+)</div>', card)
    ret = re.search(r'font-semibold">(-?[\d.,]+)%</div><div class="text-muted-foreground text-xs">10 ára', card)
    mem = re.search(r'font-semibold">([\d.]+)</div><div class="text-muted-foreground text-xs">Meðlimir', card)
    fx  = re.search(r'font-semibold">([\d.,]+)<!-- -->%</div><div class="text-muted-foreground text-xs">Eignir', card)
    p = [x for x in prov if x[0] < start]
    provider = p[-1][1] if p else ""
    funds.append({"name": name, "family": fam, "provider": provider, "slug": a.group(1),
                  "risk": int(risk.group(1)) if risk else None,
                  "ret10": fnum(ret.group(1)) if ret else None,
                  "members": inum(mem.group(1)) if mem else None,
                  "foreignPct": fnum(fx.group(1)) if fx else None})

# fjarlægja tvítekningar (sami slug) ef einhverjar
seen = {}; uniq = []
for f in funds:
    if f["slug"] in seen: continue
    seen[f["slug"]] = 1; uniq.append(f)
json.dump({"updated": "2024", "source": "aurbjorg.is", "funds": uniq}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("FUNDS", len(uniq))
withret = [f for f in uniq if f["ret10"] is not None]
print("with 10yr return:", len(withret))
for f in (uniq[:2] + [x for x in uniq if x["name"].startswith("Frjálsi 1")][:1]):
    print(f["name"], "| prov", f["provider"], "| risk", f["risk"], "| 10yr", f["ret10"], "| members", f["members"], "| fx%", f["foreignPct"])
