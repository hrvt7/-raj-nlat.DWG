#!/usr/bin/env python3
"""
AI Audit Pipeline — Prémium Döntéshozói PDF Riport v3
Profi struktúra: 9 szekció, explicit oldaltörések, KeepTogether, prémium tipográfia.
Ahrefs/AgencyAnalytics/W3C-WCAG minták alapján.
"""

import json, sys, os, math
from datetime import datetime

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm, cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, KeepTogether, HRFlowable, Flowable
    )
    from reportlab.graphics.shapes import Drawing, Circle, Line, String
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
except ImportError:
    print("HIBA: reportlab szükséges. Telepítés: pip install reportlab --break-system-packages")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════
# FONTS
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

# ═══════════════════════════════════════════════════════════════════════
# SZÍN PALETTA — letisztult prémium
# ═══════════════════════════════════════════════════════════════════════

NAVY    = colors.HexColor("#0F172A")
SLATE   = colors.HexColor("#1E293B")
BLUE    = colors.HexColor("#2563EB")
LTBLUE  = colors.HexColor("#DBEAFE")
TEAL    = colors.HexColor("#0D9488")
GREEN   = colors.HexColor("#059669")
AMBER   = colors.HexColor("#D97706")
RED     = colors.HexColor("#DC2626")
ORANGE  = colors.HexColor("#EA580C")
PURPLE  = colors.HexColor("#7C3AED")
DARK    = colors.HexColor("#111827")
GRAY    = colors.HexColor("#6B7280")
LTGRAY  = colors.HexColor("#F8FAFC")
BORDER  = colors.HexColor("#E2E8F0")
CARD_BG = colors.HexColor("#F1F5F9")
W       = colors.white

# ═══════════════════════════════════════════════════════════════════════
# CONFIG BETÖLTÉS
# ═══════════════════════════════════════════════════════════════════════

def load_config():
    """Betölti a white-label konfigurációt a config.json-ból."""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
    default = {
        "company_name": "WebLelet",
        "company_tagline": "AI-alapú weboldal diagnosztika",
        "contact_email": "info@weblelet.hu",
        "contact_phone": "+36 XX XXX XXXX",
        "contact_website": "https://weblelet.hu",
        "logo_path": None,
        "primary_color": "#2563EB",
        "accent_color": "#F59E0B",
        "footer_text": "Készítette: WebLelet — AI-alapú weboldal diagnosztika",
        "disclaimer": "Ez a riport AI-támogatott elemzési rendszerrel készült, kizárólag nyilvánosan elérhető adatok alapján."
    }
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        default.update(cfg)
    return default

# Global config
CONFIG = load_config()

def sc_color(s):
    if s >= 80: return GREEN
    if s >= 60: return BLUE
    if s >= 40: return AMBER
    return RED

def sc_label(s):
    if s >= 80: return "Jó"
    if s >= 60: return "Elfogadható"
    if s >= 40: return "Gyenge"
    return "Kritikus"

def sc_grade(s):
    if s >= 90: return "A+"
    if s >= 80: return "A"
    if s >= 70: return "B"
    if s >= 60: return "C"
    if s >= 40: return "D"
    return "F"

def sev_color(s):
    s = s.lower()
    if s == "critical": return RED
    if s == "high": return ORANGE
    if s == "medium": return AMBER
    return BLUE

def sev_hu(s):
    s = s.lower()
    if s == "critical": return "KRITIKUS"
    if s == "high": return "MAGAS"
    if s == "medium": return "KÖZEPES"
    return "ALACSONY"

def area_hu(a):
    a = a.lower()
    if "geo" in a or "seo" in a: return "GEO/SEO"
    if "market" in a: return "Marketing"
    if "sales" in a: return "Sales"
    return a

# ═══════════════════════════════════════════════════════════════════════
# LAIKUS ANALÓGIÁK — finding matching
# ═══════════════════════════════════════════════════════════════════════

LAYMAN_ANALOGIES = {
    'canonical': 'A Google rossz oldalt mutat — mintha rossz telefonszám lenne a telefonkönyvben.',
    'schema': 'A Google nem tudja gépileg leolvasni a nyitvatartást, árat, értékelést — mintha egy névjegykártya lenne szöveg nélkül, csak egy kép.',
    'meta description': 'Amikor valaki rákeres a Google-ben, nem jelenik meg leírás az Ön oldala alatt — üres, az emberek továbbgörgetnek.',
    'sitemap': 'Nem adott térképet a Google-nek — vakon bolyong és sok oldalt nem talál meg.',
    'ssl': 'Az oldal nem biztonságos — a böngésző figyelmezteti a látogatókat.',
    'alt': 'A képeinek nincs leírása — a Google vak a képekre.',
    'hreflang': 'A kétnyelvű oldal össze van keverve — a Google a magyar vendégeknek angolul mutathatja az oldalt.',
    'foglal': 'Csak telefonon lehet foglalni — a vendégek 70%-a inkább online foglalna.',
    'review': 'Jó értékelései vannak de az oldalon semmi nem látszik — mintha lenne egy díja de nem tenné ki a falra.',
    'pdf': 'Az étlap/menü egy letölthető fájl amit mobilon lehetetlen olvasni — és a Google sem indexeli.',
    'analytics': 'Nem méri hogy hányan látogatják az oldalát — mintha bolt lenne ablak nélkül.',
    'core web': 'Az oldal lassú — a látogatók 40%-a elmenekül ha 3 másodpercnél tovább tölt.',
    'email': 'Nem gyűjti a vendégek email címét — nem tud visszahívni őket akcióval.',
    'ai keres': 'Ha valaki megkérdezi a ChatGPT-t vagy a Google AI-t, az Ön cégét nem fogja ajánlani.',
    'gdpr': 'Jogilag kötelező sütitájékoztató nincs az oldalon — ez bírságot vonhat maga után.',
    'cookie': 'Jogilag kötelező sütitájékoztató nincs az oldalon — ez bírságot vonhat maga után.',
    'referenc': 'Jó értékelései vannak de az oldalon semmi nem látszik — mintha lenne egy díja de nem tenné ki a falra.',
    'cta': 'Nincs hívásra ösztönző gomb — a látogatók nem tudják mit kéne csinálniuk az oldalon.',
    'robot': 'A keresőmotorok nem férnek hozzá az oldalhoz — mintha bezárta volna az ajtót a legjobb ügyfelek előtt.',
    'strukturált': 'A Google nem tudja gépileg leolvasni a nyitvatartást, árat, értékelést — mintha egy névjegykártya lenne szöveg nélkül, csak egy kép.',
}

def find_layman_analogy(title, description):
    """Find matching layman analogy for a finding based on title+description keywords."""
    text = (title + ' ' + description).lower()
    for keyword, analogy in LAYMAN_ANALOGIES.items():
        if keyword in text:
            return analogy
    return None


# ═══════════════════════════════════════════════════════════════════════
# STÍLUSOK — prémium tipográfia
# ═══════════════════════════════════════════════════════════════════════

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CW = PAGE_W - 2 * MARGIN  # content width

def styles():
    ss = getSampleStyleSheet()
    add = [
        # (name, font, size, color, align, spaceAfter, leading, spaceBefore, leftIndent)
        ('H0',    FONTB, 34, W,    TA_LEFT, 6, 40, 0, 0),
        ('H0sub', FONT,  13, colors.HexColor("#94A3B8"), TA_LEFT, 4, 17, 0, 0),
        ('H1',    FONTB, 20, NAVY, TA_LEFT, 4, 24, 0, 0),
        ('H2',    FONTB, 13, SLATE,TA_LEFT, 3, 16, 6, 0),
        ('H3',    FONTB, 10, BLUE, TA_LEFT, 2, 13, 3, 0),
        ('B',     FONT,  10, DARK, TA_JUSTIFY, 3, 15, 0, 0),
        ('Bsm',   FONT,  8.5,GRAY,TA_LEFT, 2, 12, 0, 0),
        ('Bxs',   FONT,  7,  GRAY,TA_CENTER,0, 9, 0, 0),
        ('TH',    FONTB, 8.5,W,   TA_LEFT, 0, 11, 0, 0),
        ('TD',    FONT,  8.5,DARK,TA_LEFT, 0, 12, 0, 0),
        ('TDB',   FONTB, 8.5,DARK,TA_LEFT, 0, 12, 0, 0),
        ('BulletItem', FONT, 9.5,DARK,TA_LEFT, 2, 14, 0, 8*mm),
        # Laikus oldalak stílusai — nagyobb betűméret
        ('Blay',   FONT,  12, DARK, TA_LEFT, 3, 18, 0, 0),    # laikus body 12pt
        ('BlayIt', FONT,  9,  GRAY, TA_LEFT, 2, 13, 0, 0),    # laikus dőlt szürke
        ('Blay11', FONT,  11, DARK, TA_LEFT, 2, 16, 0, 0),    # laikus 11pt
        ('BlayNum',FONT,  11, DARK, TA_LEFT, 4, 16, 0, 0),    # laikus számozott 11pt
        ('Bmagyar',FONT,  9.5,DARK, TA_LEFT, 2, 14, 0, 12*mm),# Magyarul doboz szöveg
    ]
    for name, font, size, col, align, after, lead, before, indent in add:
        ss.add(ParagraphStyle(name, fontName=font, fontSize=size, textColor=col,
            alignment=align, spaceAfter=after*mm if after else 0,
            leading=lead, spaceBefore=before*mm if before else 0,
            leftIndent=indent))
    return ss


# ═══════════════════════════════════════════════════════════════════════
# CUSTOM FLOWABLES
# ═══════════════════════════════════════════════════════════════════════

class SectionTitle(Flowable):
    """Prémium szekció fejléc — bal accent sáv + nagy cím + alsó vonal."""
    def __init__(self, text, accent=BLUE):
        Flowable.__init__(self)
        self.text = text
        self.accent = accent
        self.height = 12 * mm
    def wrap(self, aw, ah):
        self._w = aw
        return (aw, self.height)
    def draw(self):
        c = self.canv
        c.setFillColor(self.accent)
        c.roundRect(0, 0, 3.5, self.height, 1.5, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.setFont(FONTB, 18)
        c.drawString(12, self.height * 0.3, self.text)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.line(0, -2, self._w, -2)


class FindingCard(Flowable):
    """Prémium finding kártya — színes bal sáv + háttér + tartalom."""
    def __init__(self, sev, area, title, desc, width=CW):
        Flowable.__init__(self)
        self.sev = sev
        self.area = area
        self.title = title
        self.desc = desc
        self._w = width
        # Pre-calculate height
        self._title_h = 14
        lines = max(1, len(desc) // 80 + 1)
        self._desc_h = lines * 12
        self.height = self._title_h + self._desc_h + 16  # padding

    def wrap(self, aw, ah):
        self._w = aw
        lines = max(1, len(self.desc) // int(aw / 4.5) + 1)
        self._desc_h = lines * 12
        self.height = self._title_h + self._desc_h + 18
        return (aw, self.height)

    def draw(self):
        c = self.canv
        sc = sev_color(self.sev)
        # Card background
        c.setFillColor(CARD_BG)
        c.roundRect(0, 0, self._w, self.height, 4, fill=1, stroke=0)
        # Accent bar
        c.setFillColor(sc)
        c.roundRect(0, 0, 4, self.height, 2, fill=1, stroke=0)
        # Severity badge
        badge = sev_hu(self.sev)
        c.setFillColor(sc)
        bw = c.stringWidth(badge, FONTB, 7) + 8
        c.roundRect(14, self.height - 18, bw, 14, 3, fill=1, stroke=0)
        c.setFillColor(W)
        c.setFont(FONTB, 7)
        c.drawString(18, self.height - 14, badge)
        # Area tag
        area_text = f"[{area_hu(self.area)}]"
        c.setFillColor(BLUE)
        c.setFont(FONTB, 7.5)
        c.drawString(14 + bw + 6, self.height - 14, area_text)
        # Title
        c.setFillColor(DARK)
        c.setFont(FONTB, 10)
        title_x = 14 + bw + 6 + c.stringWidth(area_text, FONTB, 7.5) + 8
        c.drawString(title_x, self.height - 14, self.title[:60])
        # Description
        c.setFillColor(GRAY)
        c.setFont(FONT, 8.5)
        y = self.height - 32
        # Simple word wrap
        words = self.desc.split()
        line = ""
        max_w = self._w - 28
        for word in words:
            test = line + " " + word if line else word
            if c.stringWidth(test, FONT, 8.5) < max_w:
                line = test
            else:
                if y > 4:
                    c.drawString(14, y, line)
                    y -= 12
                line = word
        if line and y > 4:
            c.drawString(14, y, line)


def draw_gauge(score, label="", w=110, h=100):
    """Félkör gauge — prémium stílus."""
    d = Drawing(w, h)
    cx, cy = w/2, 35
    r = 32
    steps = 36
    for i in range(steps):
        a1 = math.radians(180 + 180*i/steps)
        a2 = math.radians(180 + 180*(i+1)/steps)
        d.add(Line(cx+r*math.cos(a1), cy+r*math.sin(a1),
                   cx+r*math.cos(a2), cy+r*math.sin(a2),
                   strokeColor=BORDER, strokeWidth=7))
    filled = int(steps * min(score, 100) / 100)
    sc = sc_color(score)
    for i in range(filled):
        a1 = math.radians(180 + 180*i/steps)
        a2 = math.radians(180 + 180*(i+1)/steps)
        d.add(Line(cx+r*math.cos(a1), cy+r*math.sin(a1),
                   cx+r*math.cos(a2), cy+r*math.sin(a2),
                   strokeColor=sc, strokeWidth=7))
    d.add(String(cx, cy+6, str(score), fontSize=24, fontName=FONTB,
                 fillColor=DARK, textAnchor='middle'))
    d.add(String(cx, cy-8, '/100', fontSize=7, fontName=FONT,
                 fillColor=GRAY, textAnchor='middle'))
    if label:
        d.add(String(cx, 2, label, fontSize=8, fontName=FONTB,
                     fillColor=NAVY, textAnchor='middle'))
    return d


def draw_bar(label, score, w=CW, h=18):
    """Horizontal progress bar — label + szám + sáv egy sorban."""
    d = Drawing(w, h)
    d.add(String(0, 4, label, fontSize=8.5, fontName=FONT, fillColor=DARK))
    bar_x = 90 * mm
    bar_w = w - bar_x - 30
    d.add(String(w - 24, 4, str(score), fontSize=9, fontName=FONTB, fillColor=sc_color(score)))
    # Background
    from reportlab.graphics.shapes import Rect
    d.add(Rect(bar_x, 2, bar_w, 10, fillColor=BORDER, strokeColor=None, strokeWidth=0, rx=3))
    # Filled
    fill_w = max(2, bar_w * min(score, 100) / 100)
    d.add(Rect(bar_x, 2, fill_w, 10, fillColor=sc_color(score), strokeColor=None, strokeWidth=0, rx=3))
    return d


# ═══════════════════════════════════════════════════════════════════════
# TÁBLÁZAT HELPER
# ═══════════════════════════════════════════════════════════════════════

def stbl(rows, widths):
    """Styled table — prémium kinézet."""
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SLATE),
        ('TEXTCOLOR', (0,0), (-1,0), W),
        ('FONTNAME', (0,0), (-1,0), FONTB),
        ('FONTSIZE', (0,0), (-1,0), 8.5),
        ('FONTNAME', (0,1), (-1,-1), FONT),
        ('FONTSIZE', (0,1), (-1,-1), 8.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [W, LTGRAY]),
        ('GRID', (0,0), (-1,-1), 0.4, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))
    return t


# ═══════════════════════════════════════════════════════════════════════
# JSON COMPAT HELPERS
# ═══════════════════════════════════════════════════════════════════════

def get_val(d, *keys, default=''):
    """Get first matching key from dict."""
    for k in keys:
        if k in d and d[k]:
            return d[k]
    return default


# ═══════════════════════════════════════════════════════════════════════
# JSON VALIDÁCIÓ
# ═══════════════════════════════════════════════════════════════════════

def validate_json(data, level="szint2"):
    """Validálja az audit JSON-t a séma alapján. Visszaadja a hiányzó kulcsokat és warningokat."""
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_schema.json")
    if os.path.exists(schema_path):
        with open(schema_path, 'r', encoding='utf-8') as f:
            schema = json.load(f)
        required = schema.get(f"required_{level}", [])
    else:
        # Fallback ha nincs séma fájl
        required = ["url", "domain", "brand_name", "date", "geo_score", "marketing_score", "findings"]

    missing = [k for k in required if k not in data or data[k] is None]
    warnings = []
    for k in missing:
        warnings.append(f"⚠️  Hiányzó kulcs: {k}")

    return missing, warnings


def not_available_paragraph(S, section_name=""):
    """Visszaad egy 'Nem elérhető' paragrafust hiányzó szekciókhoz."""
    label = f" ({section_name})" if section_name else ""
    return Paragraph(
        f'<i>Ez a szekció nem elérhető ebben az auditban{label}.</i>',
        S['Bsm'])


# ═══════════════════════════════════════════════════════════════════════
# BUILD LITE PDF — 5 oldalas Szint 1 diagnózis
# ═══════════════════════════════════════════════════════════════════════

def build_lite_pdf(data, output_path):
    """Szint 1: 5 oldalas gyorsdiagnózis PDF — csak nyilvános adatok alapján."""
    S = styles()
    story = []

    # JSON validáció szint1-re
    missing, warnings = validate_json(data, level="szint1")
    if warnings:
        print("\n".join(warnings))
        print(f"\n{len(missing)} hiányzó mező — a PDF ezeket 'Nem elérhető' felirattal generálja.\n")

    brand = data.get('brand_name', data.get('domain', 'N/A'))
    domain = data.get('domain', '')
    date = data.get('date', datetime.now().strftime('%Y. %B %d.'))
    geo_s = data.get('geo_score', 0)
    mkt_s = data.get('marketing_score', 0)

    # ═══════════ 1. OLDAL: CÍMLAP ═══════════
    cover = []
    cover.append(Spacer(1, 30*mm))
    cover.append(Paragraph("WEBOLDAL GYORSDIAGNÓZIS", ParagraphStyle('CT',
        fontName=FONT, fontSize=11, textColor=colors.HexColor("#64748B"),
        alignment=TA_LEFT, spaceAfter=3*mm, tracking=3)))
    cover.append(Spacer(1, 4*mm))
    cover.append(Paragraph(brand, S['H0']))
    cover.append(Paragraph(domain, S['H0sub']))
    cover.append(Spacer(1, 3*mm))
    cover.append(Paragraph(date, S['H0sub']))
    cover.append(Spacer(1, 25*mm))

    # 2 gauge (GEO + Marketing, NEM 3)
    gauges = [draw_gauge(s, l) for l, s in [("GEO / SEO", geo_s), ("Marketing", mkt_s)]]
    gt = Table([gauges], colWidths=[CW/2]*2)
    gt.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    cover.append(gt)
    cover.append(Spacer(1, 15*mm))
    cover.append(Paragraph("Gyorsdiagnózis — kizárólag nyilvános adatok alapján",
        ParagraphStyle('CoverNote', fontName=FONT, fontSize=9,
                       textColor=colors.HexColor("#94A3B8"), alignment=TA_CENTER)))

    ct = Table([[cover]], colWidths=[CW], rowHeights=[PAGE_H - 2*MARGIN - 10*mm])
    ct.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 20*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 20*mm),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    story.append(ct)

    # ═══════════ 2. OLDAL: AMIT 2 PERCBEN TUDNIA KELL ═══════════
    story.append(PageBreak())
    story.append(SectionTitle("Amit 2 percben tudnia kell", BLUE))
    story.append(Spacer(1, 6*mm))

    # top3_layman ha van, különben findings első 5
    top3 = data.get('top3_layman', [])
    findings = data.get('findings', [])
    if top3:
        for item in top3[:5]:
            tag = item.get('tag', '🔴')
            problem = item.get('problem_simple', '')
            analogy = item.get('analogy', '')
            impact = item.get('impact', item.get('monthly_loss', ''))

            left_content = []
            left_content.append(Paragraph(f'<b>{tag} {problem}</b>', S['Blay11']))
            if analogy:
                left_content.append(Paragraph(f'<i>{analogy}</i>', S['BlayIt']))

            right_content = []
            if impact:
                right_content.append(Paragraph(
                    f'<font color="{BLUE.hexval()}"><b>{impact}</b></font>', S['Blay11']))

            card_data = [[left_content, right_content]]
            card_table = Table(card_data, colWidths=[CW * 0.7, CW * 0.3])
            card_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), CARD_BG),
                ('ROUNDEDCORNERS', [4,4,4,4]),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                ('LEFTPADDING', (0,0), (0,-1), 12),
                ('RIGHTPADDING', (-1,0), (-1,-1), 12),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ]))
            story.append(KeepTogether([card_table, Spacer(1, 3*mm)]))
    elif findings:
        for f in findings[:5]:
            sev = f.get('severity', 'medium')
            tag = '🔴' if sev in ('critical', 'high') else '🟡'
            title = f.get('title', '')
            desc = f.get('description', '')
            analogy = find_layman_analogy(title, desc)

            left_content = [Paragraph(f'<b>{tag} {title}</b>', S['Blay11'])]
            if analogy:
                left_content.append(Paragraph(f'<i>{analogy}</i>', S['BlayIt']))
            else:
                left_content.append(Paragraph(f'<i>{desc[:120]}</i>', S['BlayIt']))

            card_data = [[left_content]]
            card_table = Table(card_data, colWidths=[CW])
            card_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), CARD_BG),
                ('ROUNDEDCORNERS', [4,4,4,4]),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                ('LEFTPADDING', (0,0), (-1,-1), 12),
                ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ]))
            story.append(KeepTogether([card_table, Spacer(1, 3*mm)]))
    else:
        story.append(not_available_paragraph(S, "Feltárt problémák"))

    # ═══════════ 3. OLDAL: 3 AZONNALI TEENDŐ ═══════════
    story.append(PageBreak())
    story.append(SectionTitle("3 azonnali teendő", GREEN))
    story.append(Spacer(1, 6*mm))

    qw = data.get('quick_wins', [])
    if qw:
        for i, item in enumerate(qw[:3], 1):
            if isinstance(item, dict):
                what = item.get('what', item.get('title', ''))
                who = item.get('who', '')
                time_est = item.get('time', item.get('effort', ''))
                cost = item.get('cost', '')
                parts = [f'<b>{what}</b>']
                if who: parts.append(f'Ki csinálja: {who}')
                if time_est: parts.append(f'Idő: {time_est}')
                if cost: parts.append(f'Költség: {cost}')
                text = ' — '.join(parts)
            else:
                text = f'<b>{item}</b>'
            story.append(Paragraph(
                f'<font color="{GREEN.hexval()}"><b>{i}.</b></font>  {text}',
                S['BlayNum']))
            story.append(Spacer(1, 5*mm))
    else:
        story.append(not_available_paragraph(S, "Azonnali teendők"))

    # ═══════════ 4. OLDAL: SCORECARD ═══════════
    story.append(PageBreak())
    story.append(SectionTitle("Scorecard", BLUE))
    story.append(Spacer(1, 6*mm))

    # GEO kategóriák
    geo_cats = data.get('geo_categories', {})
    if geo_cats:
        story.append(Paragraph("<b>GEO / SEO Kategóriák</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for label, score in geo_cats.items():
            story.append(draw_bar(label, score, CW))
        story.append(Spacer(1, 5*mm))

    # Marketing kategóriák
    mkt_cats = data.get('marketing_categories', {})
    if mkt_cats:
        story.append(Paragraph("<b>Marketing Kategóriák</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for label, score in mkt_cats.items():
            story.append(draw_bar(label, score, CW))
        story.append(Spacer(1, 5*mm))

    # AI Crawler hozzáférés
    crawlers = data.get('geo_crawler_access', {})
    if crawlers:
        story.append(Paragraph("<b>AI Crawler Hozzáférés</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        cr_rows = [[Paragraph('<b>Crawler</b>', S['TH']),
                     Paragraph('<b>Platform</b>', S['TH']),
                     Paragraph('<b>Státusz</b>', S['TH'])]]
        for name, info in crawlers.items():
            status = info.get('status', 'N/A')
            c = GREEN if 'allow' in status.lower() else RED if 'block' in status.lower() else AMBER
            cr_rows.append([
                Paragraph(name, S['TD']),
                Paragraph(info.get('platform', ''), S['TD']),
                Paragraph(f'<font color="{c.hexval()}"><b>{status}</b></font>', S['TDB']),
            ])
        story.append(stbl(cr_rows, [50*mm, 50*mm, CW - 100*mm]))

    if not geo_cats and not mkt_cats and not crawlers:
        story.append(not_available_paragraph(S, "Scorecard"))

    # ═══════════ 5. OLDAL: KÖVETKEZŐ LÉPÉS ═══════════
    story.append(PageBreak())
    story.append(SectionTitle("Következő lépés", PURPLE))
    story.append(Spacer(1, 8*mm))

    story.append(Paragraph(
        "Ez a diagnózis a weboldal nyilvánosan elérhető adataiból készült.",
        S['Blay']))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        "<b>Részletesebb elemzéshez szükséges:</b>", S['Blay11']))
    for item in ["Google Analytics hozzáférés", "Google Cégprofil adatok",
                 "Forgalmi és bevételi adatok", "15 perces konzultáció"]:
        story.append(Paragraph(f"•  {item}", S['Blay11']))
    story.append(Spacer(1, 6*mm))

    # Kész megoldások ha vannak
    schema_code = data.get('schema_code', '')
    llms_txt = data.get('llms_txt', '')
    if schema_code or llms_txt:
        story.append(Paragraph("<b>Kész megoldások ebben a diagnózisban:</b>", S['H2']))
        story.append(Spacer(1, 3*mm))
        if schema_code:
            story.append(Paragraph("✅  <b>Schema markup (JSON-LD)</b> — kész, beilleszthető a weboldalba", S['Blay11']))
        if llms_txt:
            story.append(Paragraph("✅  <b>llms.txt</b> — kész, feltölthető a domain gyökerébe", S['Blay11']))
        story.append(Spacer(1, 6*mm))

    # Elérhetőség (config-ból vagy data-ból)
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        "<b>Kérje a részletes auditot:</b>", S['Blay']))
    story.append(Spacer(1, 3*mm))

    contact_email = data.get('contact_email', CONFIG.get('contact_email', ''))
    contact_phone = data.get('contact_phone', CONFIG.get('contact_phone', ''))
    contact_website = data.get('contact_website', CONFIG.get('contact_website', ''))
    if contact_email:
        story.append(Paragraph(f"Email: {contact_email}", S['Blay11']))
    if contact_phone:
        story.append(Paragraph(f"Telefon: {contact_phone}", S['Blay11']))
    if contact_website:
        story.append(Paragraph(f"Web: {contact_website}", S['Blay11']))

    # Disclaimer
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph(CONFIG.get('disclaimer',
        "Ez a riport AI-támogatott elemzési rendszerrel készült, kizárólag nyilvánosan elérhető adatok alapján. "
        "Az eredmények tájékoztató jellegűek és nem helyettesítik a szakmai tanácsadást."),
        S['Bxs']))

    # ═══════════ BUILD ═══════════
    footer_text = CONFIG.get('footer_text', f'{brand}  •  Gyorsdiagnózis')
    company = CONFIG.get('company_name', '')

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(FONT, 7)
        canvas.setFillColor(GRAY)
        canvas.drawCentredString(PAGE_W/2, 10*mm,
            f"{footer_text}  •  {doc.page}. oldal")
        canvas.restoreState()

    doc = SimpleDocTemplate(output_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=16*mm, bottomMargin=18*mm,
        title=f"Gyorsdiagnózis — {brand}", author=company or "AI Audit Pipeline")
    doc.build(story, onFirstPage=lambda c, d: None, onLaterPages=footer)
    return output_path


# ═══════════════════════════════════════════════════════════════════════
# BUILD PDF — 9 szekciós prémium struktúra
# ═══════════════════════════════════════════════════════════════════════

def build_pdf(data, output_path, lite=False):
    S = styles()
    story = []

    # JSON validáció
    level = "szint1" if (lite or data.get("audit_level") == "szint1") else "szint2"
    missing, warnings = validate_json(data, level=level)
    if warnings:
        print("\n".join(warnings))
        print(f"\n{len(missing)} hiányzó mező — a PDF ezeket a szekciókat 'Nem elérhető' felirattal generálja.\n")

    brand = data.get('brand_name', data.get('domain', 'N/A'))
    domain = data.get('domain', '')
    date = data.get('date', datetime.now().strftime('%Y. %B %d.'))
    geo_s = data.get('geo_score', 0)
    mkt_s = data.get('marketing_score', 0)
    sls_s = data.get('sales_score', 0)
    pipe_s = data.get('pipeline_score', 0)

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 1: CÍMLAP
    # ══════════════════════════════════════════════════════════════

    cover = []
    cover.append(Spacer(1, 30*mm))
    cover.append(Paragraph("WEBOLDAL AUDIT RIPORT", ParagraphStyle('CT',
        fontName=FONT, fontSize=11, textColor=colors.HexColor("#64748B"),
        alignment=TA_LEFT, spaceAfter=3*mm, tracking=3)))
    cover.append(Spacer(1, 4*mm))
    cover.append(Paragraph(brand, S['H0']))
    cover.append(Paragraph(domain, S['H0sub']))
    cover.append(Spacer(1, 3*mm))
    cover.append(Paragraph(date, S['H0sub']))
    if CONFIG.get('company_name'):
        cover.append(Spacer(1, 2*mm))
        cover.append(Paragraph(f"Készítette: {CONFIG['company_name']}", S['H0sub']))
    cover.append(Spacer(1, 20*mm))

    # Pipeline score - nagy
    cover.append(Paragraph(str(pipe_s),
        ParagraphStyle('BigScore', fontName=FONTB, fontSize=52, textColor=W,
                       alignment=TA_CENTER, spaceAfter=1*mm)))
    cover.append(Paragraph(f"Pipeline Score  •  {sc_label(pipe_s)}  •  {sc_grade(pipe_s)}",
        ParagraphStyle('ScoreSub', fontName=FONT, fontSize=11,
                       textColor=colors.HexColor("#94A3B8"), alignment=TA_CENTER, spaceAfter=8*mm)))

    # 3 gauge egy sorban
    gauges = [draw_gauge(s, l) for l, s in [("GEO / SEO", geo_s), ("Marketing", mkt_s), ("Sales", sls_s)]]
    gt = Table([gauges], colWidths=[CW/3]*3)
    gt.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    cover.append(gt)

    # Wrap in navy background
    ct = Table([[cover]], colWidths=[CW], rowHeights=[PAGE_H - 2*MARGIN - 10*mm])
    ct.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 20*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 20*mm),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    story.append(ct)

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 2 ÚJ: MIT JELENT EZ AZ ÖN VÁLLALKOZÁSA SZÁMÁRA?
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Mit jelent ez az Ön vállalkozása számára?", BLUE))
    story.append(Spacer(1, 6*mm))

    layman_intro = data.get('executive_layman_intro', '')
    if layman_intro:
        story.append(Paragraph(layman_intro, S['Blay']))
        story.append(Spacer(1, 6*mm))
    elif 'executive_layman_intro' in missing:
        story.append(not_available_paragraph(S, "Vezetői összefoglaló"))
        story.append(Spacer(1, 6*mm))

    top3_layman = data.get('top3_layman', [])
    for item in top3_layman:
        left_content = []
        left_content.append(Paragraph(
            f'<b>{item.get("problem_simple", "")}</b>', S['Blay11']))
        left_content.append(Paragraph(
            f'<i>{item.get("analogy", "")}</i>', S['BlayIt']))

        right_content = []
        ml = item.get('monthly_loss', '')
        fe = item.get('fix_effort', '')
        fc = item.get('fix_cost', '')
        if ml:
            right_content.append(Paragraph(
                f'<font color="{RED.hexval()}"><b>Veszteség: {ml}</b></font>', S['Blay11']))
        if fe:
            right_content.append(Paragraph(
                f'<font color="{GREEN.hexval()}">Javítás: {fe}</font>', S['BlayIt']))
        if fc:
            right_content.append(Paragraph(
                f'<font color="{GREEN.hexval()}">Költség: {fc}</font>', S['BlayIt']))

        card_data = [[left_content, right_content]]
        card_table = Table(card_data, colWidths=[CW * 0.65, CW * 0.35])
        card_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('ROUNDEDCORNERS', [4, 4, 4, 4]),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (0, -1), 12),
            ('RIGHTPADDING', (-1, 0), (-1, -1), 12),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(KeepTogether([card_table, Spacer(1, 3*mm)]))

    total_loss = data.get('total_monthly_loss', '')
    if total_loss:
        story.append(Spacer(1, 4*mm))
        loss_text = Paragraph(
            f'<b>Összesen havonta kb. {total_loss} bevételt hagy az asztalon.</b>',
            ParagraphStyle('LossBox', fontName=FONTB, fontSize=12, textColor=W,
                           alignment=TA_CENTER, leading=18))
        loss_table = Table([[loss_text]], colWidths=[CW])
        loss_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), NAVY),
            ('ROUNDEDCORNERS', [4, 4, 4, 4]),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('LEFTPADDING', (0, 0), (-1, -1), 16),
            ('RIGHTPADDING', (0, 0), (-1, -1), 16),
        ]))
        story.append(loss_table)

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 3 ÚJ: MIT TEGYEN ELŐSZÖR?
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Mit tegyen először?", GREEN))
    story.append(Spacer(1, 6*mm))

    simple_steps = data.get('simple_action_steps', [])
    for i, step in enumerate(simple_steps, 1):
        story.append(Paragraph(
            f'<font color="{GREEN.hexval()}"><b>{i}.</b></font>  {step}',
            S['BlayNum']))
        story.append(Spacer(1, 4*mm))

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(
        '<i>Ha ezeket szeretné hogy mi megcsináljuk, lapozzon a Szolgáltatási ajánlat oldalra.</i>',
        S['BlayIt']))

    contact_phone = data.get('contact_phone', '')
    contact_email = data.get('contact_email', '')
    if contact_phone or contact_email:
        contact_parts = []
        if contact_phone:
            contact_parts.append(f'Hívjon: {contact_phone}')
        if contact_email:
            contact_parts.append(f'Írjon: {contact_email}')
        story.append(Spacer(1, 3*mm))
        story.append(Paragraph(
            f'<b>Kérdése van?</b> {" vagy ".join(contact_parts)}', S['Blay11']))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 4 ÚJ: ELVÁLASZTÓ OLDAL — Részletes technikai melléklet
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())

    separator_content = []
    separator_content.append(Spacer(1, 60*mm))
    separator_content.append(Paragraph("RÉSZLETES TECHNIKAI MELLÉKLET",
        ParagraphStyle('SepTitle', fontName=FONTB, fontSize=24, textColor=W,
                       alignment=TA_CENTER, spaceAfter=8*mm, leading=30)))
    separator_content.append(Paragraph(
        "A következő oldalak a technikai hátteret tartalmazzák.",
        ParagraphStyle('SepSub1', fontName=FONT, fontSize=12,
                       textColor=colors.HexColor("#94A3B8"),
                       alignment=TA_CENTER, spaceAfter=4*mm, leading=16)))
    separator_content.append(Paragraph(
        "Ha Ön nem technikai szakember, nyugodtan ugorja át — a fenti összefoglaló tartalmazza a lényeget.",
        ParagraphStyle('SepSub2', fontName=FONT, fontSize=10,
                       textColor=colors.HexColor("#94A3B8"),
                       alignment=TA_CENTER, spaceAfter=4*mm, leading=14)))

    sep_table = Table([[separator_content]], colWidths=[CW],
                      rowHeights=[PAGE_H - 2*MARGIN - 10*mm])
    sep_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), NAVY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 20*mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 20*mm),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
    ]))
    story.append(sep_table)

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 5: EXECUTIVE SUMMARY (saját oldal)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Vezetői összefoglaló", BLUE))
    story.append(Spacer(1, 6*mm))

    summary = data.get('executive_summary', '')
    if summary:
        story.append(Paragraph(summary, S['B']))
    story.append(Spacer(1, 6*mm))

    # Score összesítő kártyák
    score_rows = [
        [Paragraph('<b>Terület</b>', S['TH']),
         Paragraph('<b>Pontszám</b>', S['TH']),
         Paragraph('<b>Értékelés</b>', S['TH']),
         Paragraph('<b>Osztályzat</b>', S['TH'])],
    ]
    for lbl, sc in [('GEO / SEO', geo_s), ('Marketing', mkt_s), ('Sales készenlét', sls_s)]:
        c = sc_color(sc)
        score_rows.append([
            Paragraph(lbl, S['TD']),
            Paragraph(f'<font color="{c.hexval()}"><b>{sc}</b></font>', S['TDB']),
            Paragraph(sc_label(sc), S['TD']),
            Paragraph(f'<b>{sc_grade(sc)}</b>', S['TDB']),
        ])
    score_rows.append([
        Paragraph('<b>ÖSSZESÍTETT</b>', S['TH']),
        Paragraph(f'<b>{pipe_s}</b>', S['TH']),
        Paragraph(f'<b>{sc_label(pipe_s)}</b>', S['TH']),
        Paragraph(f'<b>{sc_grade(pipe_s)}</b>', S['TH']),
    ])
    t = stbl(score_rows, [50*mm, 30*mm, 40*mm, 30*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,-1), (-1,-1), SLATE),
        ('TEXTCOLOR', (0,-1), (-1,-1), W),
    ]))
    story.append(t)
    story.append(Spacer(1, 6*mm))

    # Top 3 üzleti rés + top 3 quick win
    findings = data.get('findings', [])
    qw = data.get('quick_wins', [])
    if findings:
        story.append(Paragraph("<b>3 fő üzleti rés</b>", S['H2']))
        for i, f in enumerate(findings[:3], 1):
            story.append(Paragraph(f"<b>{i}.</b> {f.get('title', '')} — {f.get('description', '')[:100]}",
                S['BulletItem']))
        story.append(Spacer(1, 4*mm))
    if qw:
        story.append(Paragraph("<b>3 azonnali javítás</b>", S['H2']))
        for i, w in enumerate(qw[:3], 1):
            story.append(Paragraph(f"<b>{i}.</b> {w}", S['BulletItem']))
        story.append(Spacer(1, 4*mm))

    rev_impact = data.get('estimated_revenue_impact', {})
    if rev_impact:
        total = rev_impact.get('total_monthly_estimate', '')
        if total:
            story.append(Paragraph(f"<b>Várható hatás:</b> {total}", S['B']))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 3: SCOPE + MÓDSZERTAN (saját oldal)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Audit hatókör és módszertan", TEAL))
    story.append(Spacer(1, 6*mm))

    scope_items = [
        ("Audit dátuma", date),
        ("Vizsgált domain", domain),
        ("Üzlettípus", data.get('business_type', 'N/A')),
        ("Nyelv", data.get('language', 'hu')),
        ("Audit típus", "GEO/SEO + Marketing + Sales + Proposal + Akció tervek"),
        ("Vizsgálat módja", "Automatikus + manuális ellenőrzés"),
        ("Eszközök", "WebFetch, WebSearch, robots.txt, sitemap.xml, meta tag elemzés"),
        ("Külső források", "TripAdvisor, Google Maps, Facebook, Instagram, RestaurantGuru, Gastro.hu, média cikkek"),
    ]
    scope_rows = [[Paragraph('<b>Szempont</b>', S['TH']), Paragraph('<b>Érték</b>', S['TH'])]]
    for label, val in scope_items:
        scope_rows.append([Paragraph(f'<b>{label}</b>', S['TDB']), Paragraph(str(val), S['TD'])])
    story.append(stbl(scope_rows, [50*mm, CW - 50*mm]))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph("<b>Mi NEM volt a vizsgálat része:</b>", S['H3']))
    for item in ["Belépést igénylő admin felületek", "Fizetős hirdetési kampányok részletes elemzése",
                 "Szerver-oldali teljesítmény mérés (Core Web Vitals lab tesztek)", "Jogi tanácsadás (GDPR megfelelőség csak jelzés szinten)"]:
        story.append(Paragraph(f"•  {item}", S['Bsm']))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph("<b>Pontszám rendszer</b>", S['H3']))
    story.append(Paragraph("80-100: Jó (A)  |  60-79: Elfogadható (B-C)  |  40-59: Gyenge (D)  |  0-39: Kritikus (F)", S['Bsm']))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 4: SCORECARD (saját oldal)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Scorecard", BLUE))
    story.append(Spacer(1, 6*mm))

    # GEO kategóriák
    geo_cats = data.get('geo_categories', {})
    if geo_cats:
        story.append(Paragraph("<b>GEO / SEO Kategóriák</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for label, score in geo_cats.items():
            story.append(draw_bar(label, score, CW))
        story.append(Spacer(1, 5*mm))

    # AI Platform készenlét
    platforms = data.get('geo_platforms', {})
    if platforms:
        story.append(Paragraph("<b>AI Platform Készenlét</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for label, score in platforms.items():
            story.append(draw_bar(label, score, CW))
        story.append(Spacer(1, 5*mm))

    # Marketing kategóriák
    mkt_cats = data.get('marketing_categories', {})
    if mkt_cats:
        story.append(Paragraph("<b>Marketing Kategóriák</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for label, score in mkt_cats.items():
            story.append(draw_bar(label, score, CW))
        story.append(Spacer(1, 5*mm))

    # Sales kategóriák
    sales_cats = data.get('sales_categories', {})
    if sales_cats:
        story.append(Paragraph("<b>Sales Kategóriák</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for label, score in sales_cats.items():
            story.append(draw_bar(label, score, CW))
        story.append(Spacer(1, 5*mm))

    # AI Crawler hozzáférés
    crawlers = data.get('geo_crawler_access', {})
    if crawlers:
        story.append(Paragraph("<b>AI Crawler Hozzáférés</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        cr_rows = [[Paragraph('<b>Crawler</b>', S['TH']),
                     Paragraph('<b>Platform</b>', S['TH']),
                     Paragraph('<b>Státusz</b>', S['TH'])]]
        for name, info in crawlers.items():
            status = info.get('status', 'N/A')
            c = GREEN if 'allow' in status.lower() else RED if 'block' in status.lower() else AMBER
            cr_rows.append([
                Paragraph(name, S['TD']),
                Paragraph(info.get('platform', ''), S['TD']),
                Paragraph(f'<font color="{c.hexval()}"><b>{status}</b></font>', S['TDB']),
            ])
        story.append(stbl(cr_rows, [50*mm, 50*mm, CW - 100*mm]))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 5: TOP FINDINGS (saját oldal)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Feltárt problémák", RED))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(f"Összesen <b>{len(findings)}</b> probléma azonosítva, súlyosság szerint rendezve.", S['Bsm']))
    story.append(Spacer(1, 4*mm))

    for f in findings:
        card = FindingCard(
            f.get('severity', 'medium'),
            f.get('area', ''),
            f.get('title', ''),
            f.get('description', ''),
            CW
        )
        card_elements = [card]
        # "Magyarul:" laikus analógia doboz
        analogy = find_layman_analogy(f.get('title', ''), f.get('description', ''))
        if analogy:
            magyar_text = Paragraph(
                f'<font color="{BLUE.hexval()}"><b>Magyarul:</b></font>  {analogy}',
                S['Bmagyar'])
            magyar_table = Table([[magyar_text]], colWidths=[CW])
            magyar_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
                ('ROUNDEDCORNERS', [0, 0, 4, 4]),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 12*mm),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            card_elements.append(magyar_table)
        card_elements.append(Spacer(1, 3*mm))
        story.append(KeepTogether(card_elements))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 6: QUICK WINS (saját oldal)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Azonnali teendők (1-2 hét)", GREEN))
    story.append(Spacer(1, 6*mm))

    for i, item in enumerate(qw, 1):
        story.append(KeepTogether([
            Paragraph(f'<font color="{GREEN.hexval()}"><b>{i}.</b></font>  {item}', S['B']),
            Spacer(1, 2*mm),
        ]))
    story.append(Spacer(1, 6*mm))

    # Becsült bevételi hatás
    if rev_impact:
        story.append(Paragraph("<b>Becsült bevételi hatás</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for key in ['geo_impact', 'marketing_impact', 'sales_impact', 'total_monthly_estimate']:
            val = rev_impact.get(key, '')
            if val:
                label = {'geo_impact': 'GEO/SEO', 'marketing_impact': 'Marketing',
                         'sales_impact': 'Sales', 'total_monthly_estimate': 'ÖSSZESEN'}.get(key, key)
                story.append(Paragraph(f"<b>{label}:</b> {val}", S['B']))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 7: 30-90 NAPOS ROADMAP (saját oldal)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("30-90 napos fejlesztési terv", BLUE))
    story.append(Spacer(1, 6*mm))

    action_plan = data.get('action_plan', {})
    if isinstance(action_plan, dict):
        for title, key, timeframe, col in [
            ("Azonnali lépések", 'quick_wins', "1-2 hét", GREEN),
            ("Középtávú fejlesztések", 'medium_term', "1-3 hónap", BLUE),
            ("Stratégiai fejlesztések", 'strategic', "3-6 hónap", PURPLE),
        ]:
            items = action_plan.get(key, [])
            if not items:
                items = data.get(key, [])
            if items:
                story.append(Paragraph(f'<font color="{col.hexval()}">●</font>  <b>{title}</b>  ({timeframe})', S['H2']))
                story.append(Spacer(1, 2*mm))
                for i, item in enumerate(items, 1):
                    story.append(Paragraph(f"<b>{i}.</b>  {item}", S['BulletItem']))
                story.append(Spacer(1, 5*mm))
    else:
        # Fallback: quick_wins, medium_term, strategic from root
        for title, key, timeframe, col in [
            ("Azonnali lépések", 'quick_wins', "1-2 hét", GREEN),
            ("Középtávú fejlesztések", 'medium_term', "1-3 hónap", BLUE),
            ("Stratégiai fejlesztések", 'strategic', "3-6 hónap", PURPLE),
        ]:
            items = data.get(key, [])
            if items:
                story.append(Paragraph(f'<font color="{col.hexval()}">●</font>  <b>{title}</b>  ({timeframe})', S['H2']))
                story.append(Spacer(1, 2*mm))
                for i, item in enumerate(items, 1):
                    story.append(Paragraph(f"<b>{i}.</b>  {item}", S['BulletItem']))
                story.append(Spacer(1, 5*mm))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 8: SZOLGÁLTATÁSI AJÁNLAT (saját oldal)
    # ══════════════════════════════════════════════════════════════
    proposal = data.get('proposal_packages', {})
    if not proposal and 'proposal_packages' in missing:
        story.append(PageBreak())
        story.append(SectionTitle("Szolgáltatási ajánlat", PURPLE))
        story.append(Spacer(1, 6*mm))
        story.append(not_available_paragraph(S, "Szolgáltatási csomagok"))
    if proposal:
        story.append(PageBreak())
        story.append(SectionTitle("Szolgáltatási ajánlat", PURPLE))
        story.append(Spacer(1, 6*mm))

        recommended = get_val(proposal, 'recommended', 'recommended_tier', default='standard')
        story.append(Paragraph(
            f"Az audit eredmények alapján a <b>{recommended.upper()}</b> csomag ajánlott.",
            S['B']))
        story.append(Spacer(1, 5*mm))

        tier_colors = {'basic': BLUE, 'standard': TEAL, 'premium': PURPLE}

        for tier_key in ['basic', 'standard', 'premium']:
            td = proposal.get(tier_key, {})
            if not td:
                continue
            is_rec = (tier_key == recommended)
            tc = tier_colors.get(tier_key, BLUE)
            name = td.get('name', tier_key.capitalize())
            price = get_val(td, 'price', 'price_monthly', default='N/A')
            includes = td.get('includes', [])
            solves = td.get('solves', '')
            roi = td.get('expected_roi', '')
            duration = td.get('duration', '')

            rec_badge = "  ★ AJÁNLOTT" if is_rec else ""
            dur_text = f"  ({duration})" if duration else ""

            block = []
            block.append(Paragraph(
                f'<font color="{tc.hexval()}">●</font>  <b>{name}{rec_badge}</b>  —  <b>{price}</b>{dur_text}',
                S['H2']))
            if includes:
                for inc in includes:
                    block.append(Paragraph(f"•  {inc}", ParagraphStyle('TI',
                        fontName=FONT, fontSize=8.5, textColor=DARK,
                        leftIndent=8*mm, spaceAfter=1*mm, leading=12)))
            if solves:
                block.append(Paragraph(f"<b>Megoldja:</b> {solves}", ParagraphStyle('TS',
                    fontName=FONT, fontSize=8.5, textColor=DARK,
                    leftIndent=8*mm, spaceAfter=1*mm, leading=12)))
            if roi:
                block.append(Paragraph(
                    f'<b>ROI:</b> <font color="{GREEN.hexval()}">{roi}</font>',
                    ParagraphStyle('TR', fontName=FONT, fontSize=8.5, textColor=DARK,
                    leftIndent=8*mm, spaceAfter=3*mm, leading=12)))
            block.append(Spacer(1, 3*mm))
            story.append(KeepTogether(block))

    # ══════════════════════════════════════════════════════════════
    # SZEKCIÓ 9: APPENDIX (saját oldal)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(SectionTitle("Függelék", GRAY))
    story.append(Spacer(1, 6*mm))

    # Nem elérhető szekciók jelzése az appendixben
    appendix_missing_sections = []
    for key, label in [('outreach_strategy', 'Megkeresési stratégia'),
                        ('email_sequences', 'Email szekvenciák'),
                        ('cro_recommendations', 'CRO javaslatok'),
                        ('funnel_analysis', 'Funnel elemzés'),
                        ('social_calendar_summary', 'Social naptár')]:
        if key in missing and not data.get(key):
            appendix_missing_sections.append(label)
    if appendix_missing_sections:
        for label in appendix_missing_sections:
            story.append(not_available_paragraph(S, label))
        story.append(Spacer(1, 4*mm))

    # Megkeresési stratégia
    outreach = data.get('outreach_strategy', {})
    if outreach:
        story.append(Paragraph("<b>Megkeresési stratégia</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        channel = get_val(outreach, 'primary_channel', 'recommended_channel')
        timing = outreach.get('timing', '')
        angle = outreach.get('messaging_angle', '')
        if channel: story.append(Paragraph(f"<b>Csatorna:</b> {channel}", S['B']))
        if timing: story.append(Paragraph(f"<b>Időzítés:</b> {timing}", S['B']))
        if angle: story.append(Paragraph(f"<b>Üzenet:</b> {angle}", S['B']))

        email_seq = outreach.get('email_sequence', [])
        if email_seq:
            seq_rows = [[Paragraph('<b>#</b>', S['TH']),
                         Paragraph('<b>Tárgy</b>', S['TH']),
                         Paragraph('<b>Csatorna</b>', S['TH'])]]
            for i, e in enumerate(email_seq, 1):
                subj = e.get('subject', e.get('action', ''))
                ch = e.get('channel', '')
                seq_rows.append([
                    Paragraph(str(i), S['TD']),
                    Paragraph(str(subj), S['TDB']),
                    Paragraph(str(ch), S['TD']),
                ])
            story.append(stbl(seq_rows, [10*mm, CW - 50*mm, 40*mm]))
        story.append(Spacer(1, 5*mm))

    # Email szekvenciák
    email_seqs = data.get('email_sequences', {})
    if email_seqs:
        story.append(Paragraph("<b>Email szekvenciák</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        seq_labels = {'welcome': 'Üdvözlő', 'nurture': 'Lead nurture', 'conversion': 'Konverziós'}
        es_rows = [[Paragraph('<b>Típus</b>', S['TH']),
                     Paragraph('<b>Db</b>', S['TH']),
                     Paragraph('<b>Tartalom</b>', S['TH'])]]
        for key, label in seq_labels.items():
            seq = email_seqs.get(key)
            if not seq: continue
            if isinstance(seq, list):
                cnt = str(len(seq))
                txt = '; '.join([s.get('subject','') if isinstance(s,dict) else str(s) for s in seq[:3]])
                if len(txt) > 100: txt = txt[:97] + '...'
            elif isinstance(seq, dict):
                cnt = str(seq.get('emails', 'N/A'))
                txt = seq.get('summary', '')
            else:
                cnt, txt = 'N/A', str(seq)
            es_rows.append([Paragraph(label, S['TDB']), Paragraph(cnt, S['TD']), Paragraph(txt, S['TD'])])
        story.append(stbl(es_rows, [30*mm, 12*mm, CW - 42*mm]))
        story.append(Spacer(1, 5*mm))

    # CRO javaslatok
    cro = data.get('cro_recommendations', [])
    if cro:
        story.append(Paragraph("<b>CRO Javaslatok</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        for i, item in enumerate(cro[:7], 1):
            if isinstance(item, dict):
                title = item.get('title', item.get('page', ''))
                desc = item.get('description', item.get('issue', ''))
            else:
                title, desc = str(item), ''
            story.append(Paragraph(f"<b>{i}.</b> <b>{title}</b> — {desc[:120]}", S['BulletItem']))
        story.append(Spacer(1, 5*mm))

    # Funnel
    funnel = data.get('funnel_analysis', {})
    stages = funnel.get('stages', []) if isinstance(funnel, dict) else []
    if stages:
        story.append(Paragraph("<b>Funnel elemzés</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        f_rows = [[Paragraph('<b>Szakasz</b>', S['TH']),
                    Paragraph('<b>Lemorzsolódás</b>', S['TH']),
                    Paragraph('<b>Probléma / Javítás</b>', S['TH'])]]
        for st in stages:
            nm = st.get('name', st.get('stage', ''))
            drop = st.get('drop_rate', st.get('drop_off', ''))
            fix = st.get('fix', st.get('issue', ''))
            f_rows.append([
                Paragraph(str(nm), S['TDB']),
                Paragraph(f'<font color="{RED.hexval()}"><b>{drop}</b></font>', S['TDB']),
                Paragraph(str(fix)[:150], S['TD']),
            ])
        story.append(stbl(f_rows, [35*mm, 28*mm, CW - 63*mm]))
        story.append(Spacer(1, 5*mm))

    # Social naptár
    social = data.get('social_calendar_summary', {})
    if social:
        story.append(Paragraph("<b>30 napos tartalom naptár</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        parts = []
        if social.get('platforms'):
            parts.append(f"Platformok: {', '.join(social['platforms'])}")
        if social.get('posts_per_week'):
            parts.append(f"Posztok/hét: {social['posts_per_week']}")
        if social.get('content_pillars'):
            parts.append(f"Pillérek: {', '.join(social['content_pillars'])}")
        if parts:
            story.append(Paragraph(" | ".join(parts), S['Bsm']))

        samples = social.get('sample_week', social.get('sample_posts', []))
        if samples:
            story.append(Spacer(1, 2*mm))
            for s in samples[:7]:
                if isinstance(s, dict):
                    day = s.get('day', s.get('platform', ''))
                    content = s.get('content', s.get('text', ''))
                    story.append(Paragraph(f"<b>{day}:</b> {content[:120]}", S['Bsm']))
        story.append(Spacer(1, 5*mm))

    # Versenytársak
    competitors = data.get('competitors', [])
    if competitors:
        story.append(Paragraph("<b>Versenytárs összehasonlítás</b>", S['H2']))
        story.append(Spacer(1, 2*mm))
        c_rows = [[Paragraph('<b>Versenytárs</b>', S['TH']),
                    Paragraph('<b>Pozícionálás</b>', S['TH']),
                    Paragraph('<b>Erősségek</b>', S['TH']),
                    Paragraph('<b>Gyengeségek</b>', S['TH'])]]
        for c in competitors[:4]:
            c_rows.append([
                Paragraph(c.get('name', ''), S['TDB']),
                Paragraph(c.get('positioning', ''), S['TD']),
                Paragraph(c.get('strengths', ''), S['TD']),
                Paragraph(c.get('weaknesses', ''), S['TD']),
            ])
        story.append(stbl(c_rows, [35*mm, 40*mm, 40*mm, CW - 115*mm]))
        story.append(Spacer(1, 5*mm))

    # Disclaimer
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(CONFIG.get('disclaimer',
        "Ez a riport AI-támogatott elemzési rendszerrel készült, kizárólag nyilvánosan elérhető adatok alapján. "
        "Az eredmények tájékoztató jellegűek és nem helyettesítik a szakmai tanácsadást."),
        S['Bxs']))
    story.append(Paragraph(f"Generálva: {date}", S['Bxs']))

    # Elérhetőség az utolsó oldalon
    contact_parts = []
    if CONFIG.get('contact_email'):
        contact_parts.append(CONFIG['contact_email'])
    if CONFIG.get('contact_phone'):
        contact_parts.append(CONFIG['contact_phone'])
    if CONFIG.get('contact_website'):
        contact_parts.append(CONFIG['contact_website'])
    if contact_parts:
        story.append(Paragraph(" | ".join(contact_parts), S['Bxs']))

    # ══════════════════════════════════════════════════════════════
    # BUILD
    # ══════════════════════════════════════════════════════════════

    footer_text = CONFIG.get('footer_text', f'{brand}  •  Weboldal Audit Riport')
    company = CONFIG.get('company_name', '')

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(FONT, 7)
        canvas.setFillColor(GRAY)
        canvas.drawCentredString(PAGE_W/2, 10*mm,
            f"{footer_text}  •  {doc.page}. oldal")
        canvas.restoreState()

    # Logó a címlapra ha van
    logo_path = CONFIG.get('logo_path')
    if logo_path and os.path.exists(logo_path):
        try:
            from reportlab.platypus import Image
            logo = Image(logo_path, width=40*mm, height=15*mm, kind='proportional')
            story.insert(0, logo)  # Címlap tetejére
        except Exception:
            pass  # Ha nem sikerül betölteni, kihagyjuk

    doc = SimpleDocTemplate(output_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=16*mm, bottomMargin=18*mm,
        title=f"Audit Riport — {brand}", author=company or "AI Audit Pipeline")
    doc.build(story, onFirstPage=lambda c, d: None, onLaterPages=footer)
    return output_path


# ═══════════════════════════════════════════════════════════════════════
# DEMO DATA
# ═══════════════════════════════════════════════════════════════════════

def demo_data():
    return {
        "audit_level": "szint2",
        "url": "https://peldaceg.hu", "domain": "peldaceg.hu",
        "brand_name": "Példa Kft.", "date": "2026. március 24.",
        "business_type": "Szolgáltató cég", "language": "hu",
        "pipeline_score": 52, "geo_score": 45, "marketing_score": 48, "sales_score": 62,
        "geo_categories": {"AI Citability": 35, "Brand Authority": 30, "Tartalom & E-E-A-T": 55,
            "Technikai alapok": 62, "Strukturált adatok": 25, "Platform optimalizálás": 38},
        "geo_platforms": {"Google AI Overviews": 50, "ChatGPT": 35, "Perplexity": 30,
            "Gemini": 45, "Bing Copilot": 28},
        "geo_crawler_access": {
            "GPTBot": {"status": "Allowed", "platform": "ChatGPT"},
            "ClaudeBot": {"status": "Blocked", "platform": "Claude"},
            "PerplexityBot": {"status": "Not configured", "platform": "Perplexity"}},
        "marketing_categories": {"Tartalom & Üzenetek": 42, "Konverzió": 35,
            "SEO": 58, "Versenypozíció": 38, "Brand": 55, "Növekedés": 40},
        "sales_categories": {"Cég illeszkedés": 70, "Kapcsolati hozzáférés": 55,
            "Lehetőség minőség": 72, "Versenypozíció": 50, "Megkeresési készenlét": 60},
        "executive_summary": "A peldaceg.hu weboldal több komoly hiányossággal küzd. Az AI keresőkben láthatatlan, nincs strukturált adat, és a konverziós elemek teljesen hiányoznak.",
        "findings": [
            {"severity": "critical", "area": "GEO", "title": "AI keresőkben láthatatlan",
             "description": "A robots.txt tiltja a GPTBot-ot. A ChatGPT nem tudja indexelni az oldalt."},
            {"severity": "critical", "area": "Marketing", "title": "Nincs egyetlen referencia sem",
             "description": "Az egész weboldalon nincs ügyfélvélemény, esettanulmány vagy referencia."},
            {"severity": "high", "area": "GEO", "title": "Nulla strukturált adat",
             "description": "Nincs schema.org JSON-LD. A Google keresőben nem jelennek meg kiemelt találatok."},
            {"severity": "medium", "area": "Sales", "title": "Döntéshozó nem elérhető",
             "description": "LinkedIn-en nincs cégprofil, a weboldalon nincs csapatbemutató."},
        ],
        "quick_wins": ["robots.txt frissítése: AI botok engedélyezése",
            "3 ügyfélvélemény feltöltése a főoldalra", "CTA gomb minden oldalhoz"],
        "medium_term": ["Schema.org JSON-LD implementáció", "FAQ oldal létrehozása", "Blog indítása"],
        "strategic": ["Landing page újratervezés", "Referencia program", "AI chatbot integráció"],
        "estimated_revenue_impact": {"geo_impact": "+20-30% keresési forgalom",
            "marketing_impact": "+15-25 lead/hó", "total_monthly_estimate": "1-2M Ft/hó extra bevétel"},
        "action_plan": {"quick_wins": ["robots.txt fix", "3 vélemény feltöltés"],
            "medium_term": ["Schema markup", "FAQ oldal"], "strategic": ["Landing page redesign"]},
        "proposal_packages": {
            "recommended": "standard",
            "basic": {"name": "Alap csomag", "price": "180 EUR/hó", "duration": "3 hónap",
                "includes": ["robots.txt optimalizálás", "Google Cégem beállítás", "Schema.org alap"],
                "solves": "Alapvető online láthatóság", "expected_roi": "20-30% forgalomnövekedés"},
            "standard": {"name": "Standard csomag", "price": "420 EUR/hó", "duration": "6 hónap",
                "includes": ["Alap +", "Teljes schema.org", "Blog havi 4 cikk", "Email szekvencia"],
                "solves": "AI keresőkben megjelenés + lead generálás",
                "expected_roi": "40-60% organikus növekedés"},
            "premium": {"name": "Prémium csomag", "price": "780 EUR/hó", "duration": "12 hónap",
                "includes": ["Standard +", "Social media", "Google Ads", "Heti konzultáció"],
                "solves": "Teljes digitális transzformáció", "expected_roi": "2-3x ROI 6 hónap"},
        },
        "outreach_strategy": {"primary_channel": "Email", "timing": "Hétfő reggel 8:00",
            "messaging_angle": "AI keresőkben láthatatlan — 3 lépéssel javítható",
            "email_sequence": [
                {"subject": "Látta mit mond a ChatGPT a cégéről?", "channel": "Email"},
                {"subject": "3 ingyenes javítás a Google láthatóságához", "channel": "Email"},
                {"subject": "Rövid kérdés a digitális tervekről", "channel": "LinkedIn"},
            ]},
        "email_sequences": {
            "welcome": [{"subject": "Üdvözöljük!"}, {"subject": "Ismerje meg szolgáltatásainkat"}],
            "nurture": [{"subject": "Heti SEO tipp"}, {"subject": "AI keresők trendjei"}],
            "conversion": [{"subject": "Limitált ajánlat"}, {"subject": "Esettanulmány"}],
        },
        "cro_recommendations": [
            {"title": "CTA gomb a főoldalra", "description": "Nincs egyetlen hívásra ösztönző gomb sem"},
            {"title": "Social proof szekció", "description": "3 ügyfélvélemény kártya a hajtás fölé"},
        ],
        "funnel_analysis": {"stages": [
            {"name": "Keresés → Oldal", "drop_rate": "70%", "fix": "Jobb meta description"},
            {"name": "Oldal → Érdeklődés", "drop_rate": "85%", "fix": "CTA gomb hozzáadása"},
        ]},
        "social_calendar_summary": {"platforms": ["Facebook", "Instagram"],
            "posts_per_week": 4, "content_pillars": ["Szaktippek", "Kulisszák", "Akciók"],
            "sample_week": [{"day": "Hétfő", "content": "SEO tipp poszt"},
                {"day": "Szerda", "content": "Kulisszák mögött fotó"}]},
        "competitors": [
            {"name": "Versenytárs A", "positioning": "Áralapú", "strengths": "4.8 Google", "weaknesses": "Elavult oldal"},
            {"name": "Versenytárs B", "positioning": "Prémium", "strengths": "Modern web", "weaknesses": "Drága"},
        ],
        # Új laikus szekció adatok
        "executive_layman_intro": "Az Ön weboldala jelenleg úgy működik, mintha lenne egy üzlete a város legjobb helyén — de a redőny le lenne húzva és a cégtábla hátrafelé nézne. Az üzlet kiváló, a termék kiváló, de az emberek nem találják meg.",
        "top3_layman": [
            {"problem_simple": "A Google nem az Ön oldalát mutatja", "analogy": "Mintha a telefonkönyvben rossz szám lenne", "monthly_loss": "50-150 ezer Ft/hó", "fix_effort": "15 perc", "fix_cost": "0 Ft"},
            {"problem_simple": "Nincs egyetlen ügyfélvélemény sem az oldalon", "analogy": "Mintha lenne díja de nem tenné ki a falra", "monthly_loss": "100-200 ezer Ft/hó", "fix_effort": "1 óra", "fix_cost": "0 Ft"},
            {"problem_simple": "Nincs hívásra ösztönző gomb", "analogy": "Az emberek nem tudják mit kéne csinálniuk az oldalon", "monthly_loss": "80-150 ezer Ft/hó", "fix_effort": "30 perc", "fix_cost": "0 Ft"},
        ],
        "total_monthly_loss": "230-500 ezer Ft/hó",
        "simple_action_steps": [
            "Kérje meg a webfejlesztőjét hogy javítsa ki a rossz linket a Google-ben — ez 15 perc munka, ingyen.",
            "Töltse fel 3 ügyfélvéleményt a főoldalra névvel és cégnévvel — 1 óra munka.",
            "Tegyen egy 'Kérjen árajánlatot' gombot minden oldalra — 30 perc a webfejlesztőnek.",
        ],
    }


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    lite_mode = '--lite' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--lite']

    if len(args) >= 2:
        with open(args[0], 'r', encoding='utf-8') as f:
            data = json.load(f)
        out = args[1]
    elif len(args) == 1 and args[0] == 'demo':
        print("Demo mód...")
        data = demo_data()
        out = "AUDIT-DIAGNOZIS-demo.pdf" if lite_mode else "AUDIT-RIPORT-demo.pdf"
    elif len(args) == 0:
        print("Demo mód...")
        data = demo_data()
        out = "AUDIT-DIAGNOZIS-demo.pdf" if lite_mode else "AUDIT-RIPORT-demo.pdf"
    else:
        print("Használat:")
        print("  python3 generate_full_audit_pdf.py <input.json> <output.pdf>          # Szint 2 (teljes)")
        print("  python3 generate_full_audit_pdf.py <input.json> <output.pdf> --lite    # Szint 1 (diagnózis)")
        print("  python3 generate_full_audit_pdf.py demo                                # Demo Szint 2")
        print("  python3 generate_full_audit_pdf.py demo --lite                         # Demo Szint 1")
        sys.exit(1)

    if lite_mode or data.get('audit_level') == 'szint1':
        result = build_lite_pdf(data, out)
    else:
        result = build_pdf(data, out)

    size_kb = os.path.getsize(result) / 1024
    print(f"PDF generálva: {result} ({size_kb:.0f} KB)")
