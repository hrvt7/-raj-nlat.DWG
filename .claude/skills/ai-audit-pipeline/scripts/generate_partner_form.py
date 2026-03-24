#!/usr/bin/env python3
"""
Partner Adatlap PDF Generátor
Használat: python3 generate_partner_form.py "Cégnév" output.pdf
Konzisztens kinézet a generate_full_audit_pdf.py-val.
"""

import sys, os, json
from datetime import datetime

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm, cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, PageBreak, KeepTogether
    )
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
except ImportError:
    print("HIBA: reportlab szükséges. Telepítés: pip install reportlab --break-system-packages")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════
# FONTS — azonos a fő generátorral
# ═══════════════════════════════════════════════════════════════════════

FONT, FONTB = 'Helvetica', 'Helvetica-Bold'
for d in ['/System/Library/Fonts/Supplemental/', '/System/Library/Fonts/',
          '/Library/Fonts/', os.path.expanduser('~/Library/Fonts/'),
          '/usr/share/fonts/truetype/dejavu/', '/usr/share/fonts/dejavu/',
          os.path.expanduser('~/.fonts/')]:
    r, b = os.path.join(d, 'DejaVuSans.ttf'), os.path.join(d, 'DejaVuSans-Bold.ttf')
    if os.path.exists(r) and os.path.exists(b):
        pdfmetrics.registerFont(TTFont('DV', r))
        pdfmetrics.registerFont(TTFont('DVB', b))
        FONT, FONTB = 'DV', 'DVB'
        break

# Színek
NAVY    = colors.HexColor("#0F172A")
SLATE   = colors.HexColor("#1E293B")
DARK    = colors.HexColor("#111827")
GRAY    = colors.HexColor("#6B7280")
LTGRAY  = colors.HexColor("#F8FAFC")
BORDER  = colors.HexColor("#E2E8F0")
W       = colors.white


# ═══════════════════════════════════════════════════════════════════════
# CONFIG BETÖLTÉS
# ═══════════════════════════════════════════════════════════════════════

def load_config():
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
    default = {
        "company_name": "WebLelet",
        "company_tagline": "AI-alapú weboldal diagnosztika",
        "contact_email": "info@weblelet.hu",
        "contact_phone": "+36 XX XXX XXXX",
        "contact_website": "https://weblelet.hu",
        "primary_color": "#2563EB",
        "accent_color": "#F59E0B",
        "footer_text": "Készítette: WebLelet",
    }
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        default.update(cfg)
    return default

CONFIG = load_config()
PRIMARY = colors.HexColor(CONFIG["primary_color"])
ACCENT  = colors.HexColor(CONFIG["accent_color"])

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CW = PAGE_W - 2 * MARGIN


# ═══════════════════════════════════════════════════════════════════════
# STÍLUSOK
# ═══════════════════════════════════════════════════════════════════════

def get_styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle('Title0', fontName=FONTB, fontSize=28, textColor=W,
        alignment=TA_CENTER, spaceAfter=4*mm, leading=34))
    ss.add(ParagraphStyle('Subtitle0', fontName=FONT, fontSize=14, textColor=W,
        alignment=TA_CENTER, spaceAfter=2*mm, leading=18))
    ss.add(ParagraphStyle('CoverNote', fontName=FONT, fontSize=10,
        textColor=colors.HexColor("#94A3B8"), alignment=TA_CENTER, leading=14))
    ss.add(ParagraphStyle('SectionH', fontName=FONTB, fontSize=13, textColor=NAVY,
        alignment=TA_LEFT, spaceAfter=3*mm, leading=16, spaceBefore=6*mm))
    ss.add(ParagraphStyle('FieldLabel', fontName=FONTB, fontSize=10, textColor=SLATE,
        alignment=TA_LEFT, leading=14))
    ss.add(ParagraphStyle('FieldHint', fontName=FONT, fontSize=8.5, textColor=GRAY,
        alignment=TA_LEFT, leading=11))
    ss.add(ParagraphStyle('Body', fontName=FONT, fontSize=10, textColor=DARK,
        alignment=TA_LEFT, spaceAfter=2*mm, leading=14))
    ss.add(ParagraphStyle('Footer', fontName=FONT, fontSize=8, textColor=GRAY,
        alignment=TA_CENTER, leading=11))
    ss.add(ParagraphStyle('Disclaimer', fontName=FONT, fontSize=7, textColor=GRAY,
        alignment=TA_CENTER, leading=9))
    return ss


# ═══════════════════════════════════════════════════════════════════════
# KITÖLTHETŐ MEZŐ HELPER
# ═══════════════════════════════════════════════════════════════════════

def field_row(label, hint="", line_width=95*mm):
    """Egy kitölthető mező sor: label + vonalazott terület."""
    line = "_" * int(line_width / 2.2)
    if hint:
        return [label + ":", f"{line}  ({hint})"]
    return [label + ":", line]


def section_table(fields, S):
    """Táblázat a kitölthető mezőkkel — prémium kinézet."""
    table_data = []
    for label, hint in fields:
        row = field_row(label, hint)
        table_data.append([
            Paragraph(f'<b>{row[0]}</b>', S['FieldLabel']),
            Paragraph(row[1], S['FieldHint']),
        ])

    t = Table(table_data, colWidths=[55*mm, CW - 55*mm])
    t.setStyle(TableStyle([
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, BORDER),
    ]))
    return t


# ═══════════════════════════════════════════════════════════════════════
# GENERÁTOR
# ═══════════════════════════════════════════════════════════════════════

def generate_form(company_name, output_path):
    S = get_styles()
    story = []

    # ═══════════ CÍMLAP ═══════════
    cover = []
    cover.append(Spacer(1, 50*mm))
    cover.append(Paragraph("PARTNER ADATLAP", S['Title0']))
    cover.append(Spacer(1, 6*mm))
    cover.append(Paragraph(company_name, S['Subtitle0']))
    cover.append(Spacer(1, 10*mm))
    cover.append(Paragraph(
        "Kérjük töltse ki az alábbi adatlapot a részletes audit elkészítéséhez.",
        S['CoverNote']))
    cover.append(Spacer(1, 6*mm))
    cover.append(Paragraph(
        f"Készítette: {CONFIG['company_name']} — {CONFIG.get('company_tagline', '')}",
        S['CoverNote']))
    cover.append(Spacer(1, 4*mm))
    cover.append(Paragraph(
        datetime.now().strftime('%Y. %B %d.'),
        S['CoverNote']))

    ct = Table([[cover]], colWidths=[CW], rowHeights=[PAGE_H - 2*MARGIN - 10*mm])
    ct.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 20*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 20*mm),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    story.append(ct)

    # ═══════════ SZEKCIÓK ═══════════
    sections = [
        ("CÉGADATOK", [
            ("Cégnév", ""),
            ("Kapcsolattartó neve", ""),
            ("Pozíció / Beosztás", ""),
            ("Email", ""),
            ("Telefon", ""),
            ("Weboldal URL", ""),
            ("Üzlettípus", "étterem / szerviz / szalon / webshop / egyéb"),
            ("Székhely / Telephely", ""),
        ]),
        ("FORGALMI ADATOK", [
            ("Havi vendégszám / rendelésszám", "kb."),
            ("Átlagos számlaérték (Ft)", ""),
            ("Legerősebb időszak", "pl. nyár, hétvégék"),
            ("Leggyengébb időszak", ""),
            ("Online vs. helyszíni arány", "% / %"),
            ("Külső platform arány", "Foodora/Wolt/egyéb, kb. %"),
        ]),
    ]

    sections += [
        ("DIGITÁLIS JELENLÉT", [
            ("Google Analytics van-e", "igen / nem"),
            ("Google Cégprofil van-e", "igen / nem"),
            ("Havi weboldal látogató (kb.)", ""),
            ("Facebook oldal URL + követők", ""),
            ("Instagram URL + követők", ""),
            ("TikTok / YouTube / LinkedIn", "ha van"),
            ("Egyéb platform", "TripAdvisor, Booking, stb."),
        ]),
        ("JELENLEGI MARKETING", [
            ("Havi marketing költés (kb. Ft)", ""),
            ("Van webfejlesztő / marketing partner", "igen / nem, ki"),
            ("Van email lista", "igen / nem, kb. méret"),
            ("Futnak hirdetések", "Google Ads / Facebook / egyéb"),
            ("Van blog / tartalomgyártás", "igen / nem"),
            ("Utolsó weboldal frissítés", "kb. mikor"),
        ]),
        ("CÉLOK ÉS PROBLÉMÁK", [
            ("1. legnagyobb üzleti probléma", ""),
            ("2. legnagyobb üzleti probléma", ""),
            ("3. legnagyobb üzleti probléma", ""),
            ("Mit szeretne elérni 6 hónapon belül", ""),
            ("Mit szeretne elérni 12 hónapon belül", ""),
            ("Havi marketing büdzsé (amit szánna rá)", "Ft"),
        ]),
    ]

    # Szekciók renderelése
    story.append(PageBreak())

    for i, (section_title, fields) in enumerate(sections):
        # Szekció cím — accent sáv + title
        title_block = []
        title_block.append(Spacer(1, 4*mm))
        title_para = Paragraph(f'<font color="{PRIMARY.hexval()}">●</font>  {section_title}', S['SectionH'])
        title_block.append(title_para)
        title_block.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=3*mm))

        # Mezők
        tbl = section_table(fields, S)
        title_block.append(tbl)
        title_block.append(Spacer(1, 6*mm))

        story.append(KeepTogether(title_block))

    # ═══════════ ZÁRÓ OLDAL ═══════════
    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph(
        f"<b>Kérjük küldje vissza kitöltve:</b>  {CONFIG['contact_email']}",
        S['Body']))

    if CONFIG.get('contact_phone'):
        story.append(Paragraph(
            f"<b>Telefon:</b>  {CONFIG['contact_phone']}", S['Body']))
    if CONFIG.get('contact_website'):
        story.append(Paragraph(
            f"<b>Web:</b>  {CONFIG['contact_website']}", S['Body']))

    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(
        "Az adatokat bizalmasan kezeljük és kizárólag az audit elkészítéséhez használjuk.",
        S['Disclaimer']))
    story.append(Paragraph(
        f"{CONFIG['company_name']} — {CONFIG.get('company_tagline', '')}",
        S['Disclaimer']))

    # ═══════════ BUILD ═══════════
    footer_text = CONFIG.get('footer_text', CONFIG['company_name'])

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(FONT, 7)
        canvas.setFillColor(GRAY)
        canvas.drawCentredString(PAGE_W/2, 10*mm,
            f"{footer_text}  •  Partner Adatlap  •  {doc.page}. oldal")
        canvas.restoreState()

    doc = SimpleDocTemplate(output_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=16*mm, bottomMargin=18*mm,
        title=f"Partner Adatlap — {company_name}",
        author=CONFIG.get('company_name', 'AI Audit Pipeline'))
    doc.build(story, onFirstPage=lambda c, d: None, onLaterPages=footer)
    print(f"Partner adatlap generálva: {output_path}")
    return output_path


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "Példa Kft."
    out = sys.argv[2] if len(sys.argv) > 2 else "PARTNER-ADATLAP.pdf"
    generate_form(name, out)
    size_kb = os.path.getsize(out) / 1024
    print(f"Méret: {size_kb:.0f} KB")
