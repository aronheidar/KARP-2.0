import sys, pypdf
r = pypdf.PdfReader(sys.argv[1])
print("PAGES", len(r.pages))
lo = int(sys.argv[2]) if len(sys.argv) > 2 else 1
hi = int(sys.argv[3]) if len(sys.argv) > 3 else len(r.pages)
for i in range(lo-1, min(hi, len(r.pages))):
    print(f"=== PAGE {i+1} ===")
    print(r.pages[i].extract_text() or "")
