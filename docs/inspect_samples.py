from docx import Document
from pathlib import Path

files = [
    r"C:\Users\USER\Documents\BTECH-FRED\CHAPTER-ALL-THREE(1).docx",
    r"C:\Users\USER\Documents\BTECH-FRED\capston-project.docx",
    r"C:\Users\USER\Documents\BTECH-FRED\MATH\capston-project.docx",
    r"C:\Users\USER\Documents\BTECH-FRED\PRINT_FINAL PROJECT (3) (1).docx",
    r"C:\Users\USER\Documents\bukuru-fred\josy\three-chapters.docx",
]

for f in files:
    p = Path(f)
    if not p.exists():
        print("MISSING", f)
        continue
    doc = Document(f)
    print("\n" + "=" * 80)
    print(p.name, "paras", len(doc.paragraphs), "tables", len(doc.tables))
    n = 0
    for para in doc.paragraphs:
        t = (para.text or "").strip()
        if not t:
            continue
        style = para.style.name if para.style else ""
        print(f"[{style}] {t[:180]}")
        n += 1
        if n >= 100:
            print("...truncated...")
            break
