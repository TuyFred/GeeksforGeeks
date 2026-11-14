from docx import Document
from pathlib import Path

files = [
    r"C:\Users\USER\Documents\BTECH-FRED\CHAPTER-ALL-THREE(1).docx",
    r"C:\Users\USER\Documents\BTECH-FRED\PRINT_FINAL PROJECT (3) (1).docx",
    r"C:\Users\USER\Documents\BTECH-FRED\profile.docx",
]

for f in files:
    doc = Document(f)
    print("\n" + "=" * 80)
    print(Path(f).name)
    for para in doc.paragraphs:
        t = (para.text or "").strip()
        style = para.style.name if para.style else ""
        if not t:
            continue
        if style.startswith("Heading") or t.upper().startswith("CHAPTER") or t.upper().startswith("REFERENCES"):
            print(f"[{style}] {t[:200]}")
