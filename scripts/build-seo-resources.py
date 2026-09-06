#!/usr/bin/env python3
"""Build reviewed buyer downloads. Requires reportlab; see SEO publishing workflow."""

from hashlib import sha256
from pathlib import Path
import json
import re
import shutil
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/marketing/seo"
OUTPUT = ROOT / "output/pdf"
PUBLIC = ROOT / "apps/web/public/resources"
BASE_URL = "https://quickvoice.co/resources/"
PDFS = {
    "buyer-implementation-checklist.md": "phone-agent-checklist.pdf",
    "cost-estimation-guide.md": "cost-estimation-guide.pdf",
}


def inline(text):
    text = text.translate(str.maketrans({"—": " - ", "–": "-", "’": "'", "“": '"', "”": '"'}))
    text = escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', text)
    return re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: '<link href="{}" color="#2148A8">{}</link>'.format(
            match[2] if match[2].startswith("https://") else BASE_URL + match[2], match[1]
        ),
        text,
    )


def styles():
    result = getSampleStyleSheet()
    result.add(ParagraphStyle("BuyerTitle", fontName="Helvetica-Bold", fontSize=25, leading=30, textColor=colors.HexColor("#142D59"), spaceAfter=16))
    result.add(ParagraphStyle("BuyerHeading", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=colors.HexColor("#142D59"), spaceBefore=16, spaceAfter=9, keepWithNext=True))
    result.add(ParagraphStyle("BuyerBody", fontName="Helvetica", fontSize=9.5, leading=14, spaceAfter=9))
    result.add(ParagraphStyle("BuyerCheck", parent=result["BuyerBody"], leftIndent=19, firstLineIndent=-19, spaceAfter=8))
    result.add(ParagraphStyle("BuyerCell", parent=result["BuyerBody"], fontSize=8, leading=11, spaceAfter=0, alignment=TA_LEFT))
    return result


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D9E2EE"))
    canvas.line(45, 37, 567, 37)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#526078"))
    canvas.drawString(45, 24, "QuickVoice | Buyer evaluation resources | quickvoice.co/resources")
    canvas.drawRightString(567, 24, str(doc.page))
    canvas.restoreState()


def build_pdf(source, destination):
    sheet = styles()
    flow = [Paragraph("QUICKVOICE / WORKING GUIDE", ParagraphStyle("Kicker", fontSize=9, leading=12, textColor=colors.HexColor("#2148A8"), spaceAfter=13))]
    lines = source.read_text().splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if not line:
            continue
        if line.startswith("| "):
            rows = []
            while True:
                if not re.fullmatch(r"[| :\-]+", line):
                    rows.append([Paragraph(inline(cell.strip()), sheet["BuyerCell"]) for cell in line.strip("|").split("|")])
                if index >= len(lines) or not lines[index].strip().startswith("| "):
                    break
                line = lines[index].strip()
                index += 1
            table = Table(rows, colWidths=[142, 146, 150, 84], repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EFF9")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D2DCEB")),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]))
            flow.extend([table, Spacer(1, 8)])
        elif line.startswith("# "):
            flow.append(Paragraph(inline(line[2:]), sheet["BuyerTitle"]))
        elif line.startswith("## "):
            if source.name == "cost-estimation-guide.md" and line == "## How to interpret results":
                flow.append(PageBreak())
            flow.append(Paragraph(inline(line[3:]), sheet["BuyerHeading"]))
        elif line.startswith("- [ ] "):
            flow.append(Paragraph("[ ]  " + inline(line[6:]), sheet["BuyerCheck"]))
        elif line.startswith("- "):
            flow.append(Paragraph("-  " + inline(line[2:]), sheet["BuyerCheck"]))
        else:
            flow.append(Paragraph(inline(line), sheet["BuyerBody"]))
    doc = SimpleDocTemplate(str(destination), pagesize=letter, leftMargin=45, rightMargin=45, topMargin=42, bottomMargin=52, title=lines[0].removeprefix("# "), author="QuickVoice", pageCompression=1)
    doc.build(flow, onFirstPage=footer, onLaterPages=footer, canvasmaker=lambda *args, **kwargs: Canvas(*args, **{**kwargs, "invariant": 1}))


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    sources = list(PDFS) + ["cost-estimation.csv"]
    for source, filename in PDFS.items():
        build_pdf(SOURCE / source, OUTPUT / filename)
        shutil.copyfile(OUTPUT / filename, PUBLIC / filename)
        # The accessible web page uses the same reviewed source, not a second copy of its prose.
        shutil.copyfile(SOURCE / source, PUBLIC / source)
    shutil.copyfile(SOURCE / "cost-estimation.csv", PUBLIC / "cost-estimation.csv")
    files = sorted([*PDFS.values(), *PDFS.keys(), "cost-estimation.csv"])
    manifest = {
        "sources": {str((SOURCE / name).relative_to(ROOT)): digest(SOURCE / name) for name in sources},
        "generator": {str(Path(__file__).resolve().relative_to(ROOT)): digest(Path(__file__))},
        "downloads": {name: digest(PUBLIC / name) for name in files},
    }
    (PUBLIC / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Generated {len(files)} buyer resource files from {len(sources)} reviewed sources.")


if __name__ == "__main__":
    main()
