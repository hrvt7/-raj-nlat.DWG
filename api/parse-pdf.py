from http.server import BaseHTTPRequestHandler
import json, base64, traceback, io, re, os
from collections import Counter

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

SYMBOL_KEYWORDS = {
    'dugalj':        ['dugalj', 'konnektor', 'socket', 'aljzat'],
    'kapcsolo':      ['kapcsoló', 'kapcsolo', 'switch', 'villanykapcs'],
    'lampa':         ['lámpa', 'lampa', 'light', 'luminaire', 'ledfény', 'downlight', 'spot'],
    'fi_rele':       ['fi relé', 'fi rele', 'rcd', 'rcbo'],
    'kismegszakito': ['kismegszakító', 'kismegszakito', 'mcb', 'megszakít'],
    'panel':         ['elosztó', 'eloszto', 'panel', 'szekrény', 'szekreny', 'tábla'],
    'kabel':         ['kábel', 'kabel', 'cable', 'vezeték', 'nayy', 'nyy', 'cyky', 'nym'],
    'kabeltalca':    ['kábeltálca', 'kabeltalca', 'tálca', 'talca', 'cable tray', 'tray'],
}

# ── Prompt: tervrajz elemzés (kábeltálca, erőátviteli vonalrajz) ───────────────
VISION_PROMPT_PLAN = """Te egy tapasztalt magyar villamos tervező mérnök asszisztens vagy.
Ez egy VILLAMOSSÁGI TERVRAJZ – lehetséges hogy erőátviteli szerelési terv vagy kábeltálca elrendezési terv.

FONTOS TUDNIVALÓK A VONALRAJZOKRÓL:
- Kábeltálca terveken vastag vonalak/téglalapok jelölik a tálcákat – mérd/becsüld a hosszukat
- Erőátviteli terveken egyenes vonalak = kábelek vagy tálcák, méretekkel/jelölésekkel
- A tervrajzon lévő méretszámokat (pl. "300mm", "3m", "12.5m") vedd figyelembe
- Szimbólumokat számold meg: körök=dugalj/kapcsoló, kereszt=lámpa, téglalap=panel
- Ha látod a kábeltálca szimbólumot (dupla vonal vagy vastag téglalap vonal) → add meg a hosszát méterben
- Ha látod a léptéket (pl. 1:50, 1:100) → használd a hosszbecsléshez

KÁBELTÁLCA AZONOSÍTÁS:
- Dupla párhuzamos vonal = kábeltálca nyomvonal
- Általában tetőn vagy falon futó sáv jelöli
- Mérete lehet pl. 100x60, 200x60, 300x100 mm – ez a neve, de a HOSSZA kell méterben

VÁLASZOLJ KIZÁRÓLAG valid JSON-ban:
{
  "items": [
    {"name": "Kábeltálca 200x60", "type": "kabeltalca", "quantity": 45.5, "unit": "fm", "notes": "3. sor alapján"},
    {"name": "NYM-J 3x2.5", "type": "kabel", "quantity": 120, "unit": "fm", "notes": ""},
    {"name": "Dugalj 2P+F IP44", "type": "dugalj", "quantity": 8, "unit": "db", "notes": ""},
    {"name": "LED panel 60x60", "type": "lampa", "quantity": 12, "unit": "db", "notes": ""}
  ],
  "confidence": 0.65,
  "source": "vision_plan",
  "notes": "Kábeltálca elrendezési terv – vonalak alapján becsülve"
}

Ha semmit sem azonosítasz, adj vissza üres items tömböt confidence: 0.1-gyel."""

# ── Prompt: mennyiségjegyzék / táblázat ───────────────────────────────────────
VISION_PROMPT_TABLE = """Te egy tapasztalt magyar villamos tervező mérnök asszisztens vagy.
Ez egy MENNYISÉGJEGYZÉK, TÉTELJEGYZÉK vagy ANYAGKIMUTATÁS táblázat.

FELADATOD: Olvasd ki az összes sort a táblázatból.
- Keress Megnevezés/Tétel oszlopot
- Keress Mennyiség/Db/Hossz oszlopot  
- Keress Egység oszlopot (db, fm, m, méter)
- Ha nincs egység megadva és szerelvény → db, ha kábel/tálca → fm

VÁLASZOLJ KIZÁRÓLAG valid JSON-ban:
{
  "items": [
    {"name": "Kábeltálca 300x60", "type": "kabeltalca", "quantity": 85, "unit": "fm", "notes": ""},
    {"name": "Dugalj 2P+F", "type": "dugalj", "quantity": 24, "unit": "db", "notes": ""},
    {"name": "NYM-J 3x1.5", "type": "kabel", "quantity": 340, "unit": "fm", "notes": ""}
  ],
  "confidence": 0.92,
  "source": "vision_table",
  "notes": "Mennyiségjegyzék – 8 sor azonosítva"
}"""

# ── Prompt: jelmagyarázat/legend ──────────────────────────────────────────────
LEGEND_PROMPT = """Ez egy JELMAGYARÁZAT (legend) lap egy villamossági tervhez.

FELADATOD: Azonosítsd az összes szimbólum-jelölés párt.
Minden sorhoz: mi a szimbólum és mit jelent magyarul.

VÁLASZOLJ KIZÁRÓLAG valid JSON-ban:
{
  "legend": [
    {"symbol": "kör", "meaning": "Dugalj 2P+F 230V", "type": "dugalj"},
    {"symbol": "X jel körben", "meaning": "Vízálló dugalj IP44", "type": "dugalj"},
    {"symbol": "dupla vonal", "meaning": "Kábeltálca nyomvonal", "type": "kabeltalca"},
    {"symbol": "kereszt körben", "meaning": "Mennyezeti lámpa", "type": "lampa"}
  ],
  "notes": "Villamos jelmagyarázat – 12 szimbólum azonosítva"
}"""


def is_legend_file(filename):
    """Detektálja ha a fájl jelmagyarázat."""
    fn = filename.lower()
    return any(kw in fn for kw in [
        'jelmagyarazat', 'jelmagyarázat', 'legend', 'jeloles', 'jelölés',
        'jelmag', 'symbol', 'jelkulcs', 'jelkulcse'
    ])


def is_table_like(img_b64):
    """Rövid heurisztika: ha sok vízszintes vonal van, valószínűleg táblázat.
    Mivel nem futtatunk CV-t, ezt a fájlnévből/kontextusból döntjük el."""
    return False  # override-olható ha kell


def pdf_pages_to_images(file_bytes, max_pages=6, dpi=180):
    """Render PDF pages to PNG base64 images using PyMuPDF."""
    import fitz
    doc = fitz.open(stream=file_bytes, filetype='pdf')
    images = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes('png')
        images.append(base64.b64encode(img_bytes).decode())
    return images, len(doc)


def call_vision(img_b64, prompt, page_num=1):
    """Send page image to GPT-4o Vision with given prompt."""
    import urllib.request

    payload = json.dumps({
        'model': 'gpt-4o',
        'max_tokens': 2500,
        'response_format': {'type': 'json_object'},
        'messages': [{
            'role': 'user',
            'content': [
                {
                    'type': 'image_url',
                    'image_url': {'url': f'data:image/png;base64,{img_b64}', 'detail': 'high'}
                },
                {'type': 'text', 'text': prompt}
            ]
        }]
    }).encode()

    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=55) as r:
        resp = json.loads(r.read())

    raw = resp['choices'][0]['message']['content']
    try:
        return json.loads(raw.replace('```json', '').replace('```', '').strip())
    except Exception:
        return {'items': [], 'confidence': 0.0, 'notes': f'Parse error page {page_num}'}


def merge_vision_results(page_results):
    merged = {}
    for pr in page_results:
        for item in pr.get('items', []):
            name = item.get('name', '').strip()
            itype = item.get('type', 'egyeb')
            qty = float(item.get('quantity', 0) or 0)
            unit = item.get('unit', 'db')
            key = (name.lower(), itype)
            if key in merged:
                merged[key]['quantity'] += qty
            else:
                merged[key] = {'name': name, 'type': itype, 'quantity': qty, 'unit': unit}

    items = list(merged.values())
    avg_conf = sum(p.get('confidence', 0) for p in page_results) / max(len(page_results), 1)
    return items, avg_conf


def vision_results_to_blocks(items):
    blocks = []
    lengths = []

    for item in items:
        itype = item.get('type', 'egyeb')
        name = item.get('name', itype)
        unit = item.get('unit', 'db')
        qty_raw = item.get('quantity', 0) or 0

        if itype in ('kabel', 'kabeltalca') or unit in ('fm', 'm', 'méter', 'lm'):
            lengths.append({
                'layer': f'PDF_{itype.upper()}',
                'length': float(qty_raw),
                'length_raw': float(qty_raw),
                'info': {'name': name, 'type': itype},
            })
        else:
            qty = int(round(float(qty_raw)))
            if qty > 0:
                blocks.append({'name': name, 'layer': f'PDF_{itype.upper()}', 'count': qty})

    if not lengths:
        lengths = [{'layer': 'PDF', 'length': 0.0, 'length_raw': 0.0, 'info': None}]

    return blocks, lengths


def parse_pdf_text_fallback(file_bytes):
    import fitz
    doc = fitz.open(stream=file_bytes, filetype='pdf')
    all_text = [page.get_text('text') for page in doc]
    full_text = '\n'.join(all_text).lower()

    counts = Counter()
    for symbol, keywords in SYMBOL_KEYWORDS.items():
        for kw in keywords:
            hits = full_text.count(kw.lower())
            if hits > 0:
                counts[symbol] += hits

    blocks = [{'name': n, 'layer': 'PDF', 'count': int(c)} for n, c in counts.items() if c > 0]
    lengths = []
    for m in re.finditer(r'(\d+[\.,]?\d*)\s*(fm|m\b|méter|lm)', full_text):
        try:
            val = float(m.group(1).replace(',', '.'))
            if val > 0.5:
                lengths.append({'layer': 'PDF_TEXT', 'length': val, 'length_raw': val, 'info': None})
        except Exception:
            pass
    if not lengths:
        lengths = [{'layer': 'PDF', 'length': 0.0, 'length_raw': 0.0, 'info': None}]
    return blocks, lengths, len(doc), 'text_fallback'


def parse_legend_pdf(file_bytes):
    """Jelmagyarázat PDF feldolgozása – kontextusként visszaadja a legendát, nem mennyiségként."""
    try:
        import fitz
        images, page_count = pdf_pages_to_images(file_bytes, max_pages=4, dpi=200)
        if not images or not OPENAI_API_KEY:
            raise ValueError('Nincs kép vagy API kulcs')

        all_legend = []
        for i, img_b64 in enumerate(images):
            result = call_vision(img_b64, LEGEND_PROMPT, i + 1)
            all_legend.extend(result.get('legend', []))

        return {
            'success': True,
            'is_legend': True,
            'blocks': [],
            'lengths': [{'layer': 'LEGEND', 'length': 0.0, 'length_raw': 0.0, 'info': None}],
            'layers': ['LEGEND'],
            'units': {'insunits': 0, 'name': 'Jelmagyarázat', 'factor': None, 'auto_detected': False},
            'title_block': {},
            'summary': {
                'total_block_types': 0,
                'total_blocks': 0,
                'total_layers': 0,
                'layers_with_lines': 0,
            },
            '_source': 'legend_pdf',
            '_confidence': 1.0,
            '_legend': all_legend,
            '_pages': page_count,
            '_note': f'Jelmagyarázat – {len(all_legend)} szimbólum azonosítva. Ez a fájl kontextusként kerül felhasználásra a többi terv elemzésekor.',
            'warnings': [],
        }
    except Exception as e:
        return {
            'success': True,
            'is_legend': True,
            'blocks': [],
            'lengths': [{'layer': 'LEGEND', 'length': 0.0, 'length_raw': 0.0, 'info': None}],
            'layers': ['LEGEND'],
            'units': {'insunits': 0, 'name': 'Jelmagyarázat', 'factor': None, 'auto_detected': False},
            'title_block': {},
            'summary': {'total_block_types': 0, 'total_blocks': 0, 'total_layers': 0, 'layers_with_lines': 0},
            '_source': 'legend_pdf',
            '_confidence': 0.5,
            '_legend': [],
            '_note': f'Jelmagyarázat – nem sikerült feldolgozni ({e}). Kézzel is felhasználható.',
            'warnings': [str(e)],
        }


def parse_pdf_bytes(file_bytes, filename='', legend_context=None):
    try:
        import fitz
    except ImportError:
        return {'success': False, 'error': 'PyMuPDF nincs telepítve a szerveren.'}

    # ── Jelmagyarázat detektálás ──────────────────────────────────────────────
    if is_legend_file(filename):
        return parse_legend_pdf(file_bytes)

    warnings = []

    if OPENAI_API_KEY:
        try:
            images, page_count = pdf_pages_to_images(file_bytes, max_pages=6, dpi=180)
            if not images:
                raise ValueError('Nem sikerült képet renderelni a PDF-ből.')

            # Ha van legend kontextus, építsd be a promptba
            plan_prompt = VISION_PROMPT_PLAN
            if legend_context:
                legend_str = '\n'.join(
                    f"- {l.get('symbol','?')} → {l.get('meaning','?')} ({l.get('type','?')})"
                    for l in legend_context
                )
                plan_prompt = VISION_PROMPT_PLAN + f"""

JELMAGYARÁZAT KONTEXTUS (a projekthez tartozó jelölések):
{legend_str}

Ezeket a szimbólumokat keresd a tervrajzon!"""

            page_results = []
            for i, img_b64 in enumerate(images):
                # Első oldal: tervrajz prompt; ha táblázatszerű, table prompt
                prompt = plan_prompt
                pr = call_vision(img_b64, prompt, i + 1)
                page_results.append(pr)

            vision_items, avg_conf = merge_vision_results(page_results)
            blocks, lengths = vision_results_to_blocks(vision_items)

            return {
                'success': True,
                'blocks': blocks,
                'lengths': lengths,
                'layers': ['PDF_VISION'],
                'units': {'insunits': 0, 'name': 'PDF (Vision AI)', 'factor': None, 'auto_detected': False},
                'title_block': {},
                'summary': {
                    'total_block_types': len(blocks),
                    'total_blocks': sum(b['count'] for b in blocks),
                    'total_layers': 1,
                    'layers_with_lines': len([l for l in lengths if l['length'] > 0]),
                },
                '_source': 'vision_gpt4o',
                '_pages': page_count,
                '_pages_analyzed': len(images),
                '_vision_confidence': round(avg_conf, 2),
                '_vision_items': vision_items,
                '_note': f'GPT-4o Vision elemezte ({len(images)}/{page_count} oldal). Átlagos bizalom: {round(avg_conf*100)}%.',
                'warnings': warnings,
            }

        except Exception as e:
            warnings.append(f'Vision elemzés hiba ({e}), szövegalapú módra váltás.')

    # ── Text fallback ─────────────────────────────────────────────────────────
    try:
        blocks, lengths, page_count, source = parse_pdf_text_fallback(file_bytes)
        return {
            'success': True,
            'blocks': blocks,
            'lengths': lengths,
            'layers': ['PDF'],
            'units': {'insunits': 0, 'name': 'PDF (szöveg)', 'factor': None, 'auto_detected': False},
            'title_block': {},
            'summary': {
                'total_block_types': len(blocks),
                'total_blocks': sum(b['count'] for b in blocks),
                'total_layers': 1,
                'layers_with_lines': len([l for l in lengths if l['length'] > 0]),
            },
            '_source': source,
            '_pages': page_count,
            '_note': 'PDF szöveg alapú felismerés. Pontosabb eredményhez DXF ajánlott.',
            'warnings': warnings,
        }
    except Exception as e:
        return {'success': False, 'error': str(e), 'trace': traceback.format_exc()}


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            content_type = self.headers.get('Content-Type', '')

            pdf_bytes = None
            filename = ''
            legend_context = None

            if 'application/json' in content_type:
                payload = json.loads(body or b'{}')
                b64 = payload.get('pdf_base64') or payload.get('data') or ''
                if not b64:
                    raise ValueError('pdf_base64 mező hiányzik')
                pdf_bytes = base64.b64decode(b64)
                filename = payload.get('filename', '')
                legend_context = payload.get('legend_context')  # opcionális: [{symbol, meaning, type}]
            else:
                try:
                    pdf_bytes = base64.b64decode(body)
                except Exception:
                    pdf_bytes = body

            if not pdf_bytes:
                raise ValueError('Üres PDF tartalom.')

            result = parse_pdf_bytes(pdf_bytes, filename=filename, legend_context=legend_context)
            self._respond(200, result)

        except Exception as e:
            self._respond(500, {'success': False, 'error': str(e), 'trace': traceback.format_exc()})

    def _respond(self, code, data):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *a): pass
