#!/usr/bin/env python3
"""
AI Audit Pipeline — Prémium PDF Generátor (WeasyPrint + Jinja2)
HTML template + CSS styling → WeasyPrint rendereli PDF-be.
Weboldal-minőségű tipográfia, layout és design.
"""

import json, sys, os
from datetime import datetime

try:
    from jinja2 import Environment, FileSystemLoader
    from weasyprint import HTML, CSS
except ImportError:
    print("HIBA: weasyprint és jinja2 szükséges.")
    print("Telepítés: pip install weasyprint jinja2 --break-system-packages")
    print("Mac: brew install cairo pango gdk-pixbuf libffi")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(SCRIPT_DIR, "templates")
STYLES_DIR = os.path.join(SCRIPT_DIR, "styles")


# ═══════════════════════════════════════════════════════════════════════
# CONFIG BETÖLTÉS
# ═══════════════════════════════════════════════════════════════════════

def load_config():
    """Betölti a white-label konfigurációt a config.json-ból."""
    config_path = os.path.join(SCRIPT_DIR, "config.json")
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


# ═══════════════════════════════════════════════════════════════════════
# JSON VALIDÁCIÓ
# ═══════════════════════════════════════════════════════════════════════

def validate_json(data, level="szint2"):
    """Validálja az audit JSON-t a séma alapján."""
    schema_path = os.path.join(SCRIPT_DIR, "audit_schema.json")
    if os.path.exists(schema_path):
        with open(schema_path, 'r', encoding='utf-8') as f:
            schema = json.load(f)
        required = schema.get(f"required_{level}", [])
    else:
        required = ["url", "domain", "brand_name", "date",
                     "geo_score", "marketing_score", "findings"]

    missing = [k for k in required if k not in data or data[k] is None]
    warnings = []
    for k in missing:
        warnings.append(f"⚠️  Hiányzó kulcs: {k}")

    return missing, warnings


# ═══════════════════════════════════════════════════════════════════════
# LAIKUS ANALÓGIÁK — finding matching
# ═══════════════════════════════════════════════════════════════════════

LAYMAN_ANALOGIES = {
    'canonical': 'A Google rossz oldalt mutat — mintha rossz telefonszám lenne a telefonkönyvben.',
    'schema': 'A Google nem tudja gépileg leolvasni a nyitvatartást, árat, értékelést — mintha egy névjegykártya lenne szöveg nélkül.',
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
    'strukturált': 'A Google nem tudja gépileg leolvasni a nyitvatartást, árat, értékelést — mintha egy névjegykártya lenne szöveg nélkül.',
}

def find_layman_analogy(title, description):
    """Find matching layman analogy for a finding."""
    text = (title + ' ' + description).lower()
    for keyword, analogy in LAYMAN_ANALOGIES.items():
        if keyword in text:
            return analogy
    return None


# ═══════════════════════════════════════════════════════════════════════
# CSS INJECTION — config színek beillesztése
# ═══════════════════════════════════════════════════════════════════════

def build_dynamic_css(config):
    """Config alapján kiegészítő CSS — primary/accent szín override + footer."""
    primary = config.get('primary_color', '#2563EB')
    accent = config.get('accent_color', '#F59E0B')
    footer_text = config.get('footer_text', 'WebLelet')
    return f"""
    :root {{
        --primary: {primary};
        --accent: {accent};
    }}
    @page {{
        @bottom-center {{
            content: counter(page) " / " counter(pages);
            font-family: 'Inter', -apple-system, Helvetica, sans-serif;
            font-size: 8pt;
            color: #94A3B8;
        }}
        @bottom-right {{
            content: "{footer_text}";
            font-family: 'Inter', -apple-system, Helvetica, sans-serif;
            font-size: 8pt;
            color: #94A3B8;
        }}
    }}
    @page :first {{
        @bottom-center {{ content: none; }}
        @bottom-right {{ content: none; }}
    }}
    """


# ═══════════════════════════════════════════════════════════════════════
# PDF GENERÁLÁS
# ═══════════════════════════════════════════════════════════════════════

def generate_pdf(data, output_path, lite=False):
    """Fő PDF generáló — HTML renderelés WeasyPrint-tel."""
    config = load_config()

    # Szint meghatározás
    level = "szint1" if (lite or data.get("audit_level") == "szint1") else "szint2"

    # JSON validáció
    missing, warnings = validate_json(data, level=level)
    if warnings:
        print("\n".join(warnings))
        print(f"\n{len(missing)} hiányzó mező — a PDF ezeket 'Nem elérhető' felirattal generálja.\n")

    # Laikus analógiák injektálása a findings-ekbe
    findings = data.get('findings', [])
    for f in findings:
        analogy = find_layman_analogy(f.get('title', ''), f.get('description', ''))
        f['_layman_analogy'] = analogy

    # Jinja2 environment
    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=False
    )
    template = env.get_template("base.html")

    # Template context — audit_level és config felülírva, a többi data-ból
    context = dict(data)
    context['audit_level'] = level
    context['config'] = config
    context.setdefault('date', datetime.now().strftime('%Y. %B %d.'))

    # Render HTML
    html_content = template.render(**context)

    # CSS betöltés
    css_path = os.path.join(STYLES_DIR, "audit.css")
    stylesheets = []
    if os.path.exists(css_path):
        stylesheets.append(CSS(filename=css_path))
    stylesheets.append(CSS(string=build_dynamic_css(config)))

    # PDF generálás
    HTML(string=html_content, base_url=SCRIPT_DIR).write_pdf(
        output_path,
        stylesheets=stylesheets
    )

    size_kb = os.path.getsize(output_path) / 1024
    print(f"PDF generálva: {output_path} ({size_kb:.0f} KB)")
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
             "description": "A robots.txt tiltja a GPTBot-ot. A ChatGPT nem tudja indexelni az oldalt.", "tag": "🔴 TÉNY"},
            {"severity": "critical", "area": "Marketing", "title": "Nincs egyetlen referencia sem",
             "description": "Az egész weboldalon nincs ügyfélvélemény, esettanulmány vagy referencia.", "tag": "🔴 TÉNY"},
            {"severity": "high", "area": "GEO", "title": "Nulla strukturált adat",
             "description": "Nincs schema.org JSON-LD. A Google keresőben nem jelennek meg kiemelt találatok.", "tag": "🔴 TÉNY"},
            {"severity": "medium", "area": "Sales", "title": "Döntéshozó nem elérhető",
             "description": "LinkedIn-en nincs cégprofil, a weboldalon nincs csapatbemutató.", "tag": "🟡 ERŐS FELTÉTELEZÉS"},
            {"severity": "medium", "area": "Marketing", "title": "Nincs online foglalás",
             "description": "Csak telefonon vagy emailben lehet időpontot foglalni.", "tag": "🟢 JAVASLAT"},
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
        "executive_layman_intro": "Az Ön cége a régiója egyik legjobb szolgáltatója — de az interneten szinte láthatatlan. A weboldala úgy működik, mintha lenne egy üzlete a város legjobb helyén, de a redőny le lenne húzva és a cégtábla hátrafelé nézne.",
        "top3_layman": [
            {"problem_simple": "A Google nem az Ön oldalát mutatja", "analogy": "Mintha a telefonkönyvben rossz szám lenne", "monthly_loss": "50-150K Ft/hó", "fix_effort": "15 perc", "fix_cost": "0 Ft"},
            {"problem_simple": "Nincs online foglalás", "analogy": "Aki nem tud hívni, elmegy máshova", "monthly_loss": "100-300K Ft/hó", "fix_effort": "1-2 óra", "fix_cost": "0-5K Ft/hó"},
            {"problem_simple": "A véleményeket senki nem látja", "analogy": "Mintha díja lenne de nem tenné ki a falra", "monthly_loss": "50-150K Ft/hó", "fix_effort": "30 perc", "fix_cost": "0 Ft"},
        ],
        "business_impact_summary": "Összességében ezek a hiányosságok jelentős mennyiségű potenciális ügyfelet és bevételt veszítenek el havonta. A pontos szám a javítások végrehajtása után, Google Analytics segítségével mérhető.",
        "simple_action_steps": [
            "Javíttassa meg a webfejlesztőjével a hibás kódot — 15 perc, ingyenes.",
            "Vezessen be online foglalást — 1-2 óra beállítás, ingyenes rendszer.",
            "Tegye ki az oldalra a Google véleményeket — 30 perc, ingyenes widget.",
        ],
        "icp": {"description": "Helyi szolgáltatók 4.0+ Google értékeléssel de gyenge online jelenléttel", "characteristics": ["Van weboldal de korlátozott", "Jó reputáció offline", "Tulajdonos döntéshozó"], "where_to_find": "Google Maps top 20", "budget_range": "150-800 EUR/hó"},
        "llms_txt": "# Példa Kft.\n> Szolgáltató cég Magyarországon\n\n## Szolgáltatások\n- Szolgáltatás 1\n- Szolgáltatás 2\n\n## Elérhetőségek\n- Cím: 1234 Budapest, Példa utca 1.\n- Telefon: +36 1 234 5678",
        "schema_code": {"type": "LocalBusiness", "json_ld": "{\"@context\":\"https://schema.org\",\"@type\":\"LocalBusiness\",\"name\":\"Példa Kft.\"}", "instructions": "Illessze be a <head> tag-be"},
    }


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Használat:")
        print("  python3 generate_full_audit_pdf.py <json_path> [output.pdf] [--lite]")
        print("  python3 generate_full_audit_pdf.py demo [--lite]")
        sys.exit(1)

    lite = "--lite" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--lite"]

    if args[0] == "demo":
        data = demo_data()
        if lite:
            data["audit_level"] = "szint1"
        output = "AUDIT-DEMO.pdf"
    else:
        json_path = args[0]
        if not os.path.exists(json_path):
            print(f"HIBA: {json_path} nem található.")
            sys.exit(1)
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        output = args[1] if len(args) > 1 else f"AUDIT-RIPORT-{data.get('domain', 'output')}.pdf"

    generate_pdf(data, output, lite=lite)
