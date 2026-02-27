from http.server import BaseHTTPRequestHandler
import json, base64, traceback, io, re, os
from collections import Counter

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

# ── Hungarian electrical symbol keywords for text-based fallback ───────────────
SYMBOL_KEYWORDS = {
    'dugalj':        ['dugalj', 'konnektor', 'socket', 'aljzat'],
    'kapcsolo':      ['kapcsoló', 'kapcsolo', 'switch', 'villanykapcs'],
    'lampa':         ['lámpa', 'lampa', 'light', 'luminaire', 'ledfény', 'downlight', 'spot'],
    'fi_rele':       ['fi relé', 'fi rele', 'rcd', 'rcbo'],
    'kismegszakito': ['kismegszakító', 'kismegszakito', 'mcb', 'megszakít'],
    'panel':         ['elosztó', 'eloszto', 'panel', 'szekrény', 'szekreny', 'tábla', 'db'],
    'kabel':         ['kábel', 'kabel', 'cable', 'vezeték', 'nayy', 'nyy', 'cyky', 'nym'],
}

VISION_PROMPT = """Te egy tapasztalt magyar villamos tervező mérnök asszisztens vagy.
Ez egy villamossági tervrajz vagy mennyiségjegyzék oldala.

FELADATOD: Azonosítsd és számold meg az összes villamos eszközt, jelölést, mennyiséget.

Keress:
- Dugaljak / konnektorok (db szám)
- Kapcsolók (db szám)  
- Lámpák, luminaire-ek (db szám)
- Kismegszakítók, FI-relék (db szám)
- Elosztók, panelek (db szám)
- Kábelek (fm / méter hossz)
- Kábeltálca (fm / méter hossz)
- Bármilyen más villamos szerelvény mennyiséggel

Ha táblázatot, mennyiségjegyzéket vagy tételjegyzéket látsz: olvasd ki az összes sort.
Ha tervrajzot látsz: számold meg a szimbólumokat vizuálisan.

VÁLASZOLJ KIZÁRÓLAG valid JSON-ban:
{
  "items": [
    {"name": "Dugalj 2P+F", "type": "dugalj", "quantity": 24, "unit": "db", "notes": ""},
    {"name": "NYM-J 3x1.5 kábel", "type": "kabel", "quantity": 145, "unit": "fm", "notes": ""},
    {"name": "Kismegszakító 1P 16A", "type": "kismegszakito", "quantity": 6, "unit": "db", "notes": ""}
  ],
  "confidence": 0.85,
  "source": "vision",
  "notes": "Mennyiségjegyzék 1. oldal – 12 tétel azonosítva"
}

Ha nem látható villamos tartalom az oldalon, adj vissza üres items tömböt.
"""


def pdf_pages_to_images(file_bytes, max_pages=8, dpi=150):
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


def call_vision_for_page(img_b64, page_num):
    """Send one page image to GPT-4o Vision and get structured result."""
    import urllib.request

    payload = json.dumps({
        'model': 'gpt-4o',
        'max_tokens': 2000,
        'response_format': {'type': 'json_object'},
        'messages': [{
            'role': 'user',
            'content': [
                {
                    'type': 'image_url',
                    'image_url': {
                        'url': f'data:image/png;base64,{img_b64}',
                        'detail': 'high'
                    }
                },
                {
                    'type': 'text',
                    'text': VISION_PROMPT
                }
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
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read())

    raw = resp['choices'][0]['message']['content']
    try:
        parsed = json.loads(raw.replace('```json', '').replace('```', '').strip())
    except Exception:
        parsed = {'items': [], 'confidence': 0.0, 'source': 'vision', 'notes': f'Parse error on page {page_num}'}
    return parsed


def merge_vision_results(page_results):
    """Merge items from multiple pages, aggregate by type."""
    merged = {}  # key = (name.lower(), type) → item
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
    """Convert vision items to the block/length format the wizard expects."""
    blocks = []
    lengths = []

    for item in items:
        qty = int(round(item['quantity']))
        itype = item.get('type', 'egyeb')
        name = item.get('name', itype)
        unit = item.get('unit', 'db')

        if itype == 'kabel' or unit in ('fm', 'm', 'méter', 'lm'):
            lengths.append({
                'layer': 'PDF_VISION',
                'length': float(item['quantity']),
                'length_raw': float(item['quantity']),
                'info': {'name': name},
            })
        elif qty > 0:
            blocks.append({
                'name': name,
                'layer': f'PDF_{itype.upper()}',
                'count': qty,
            })

    if not lengths:
        lengths = [{'layer': 'PDF', 'length': 0.0, 'length_raw': 0.0, 'info': None}]

    return blocks, lengths


def parse_pdf_text_fallback(file_bytes):
    """Original text-based extraction as fallback when no OpenAI key or vision fails."""
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

    qty_patterns = [
        r'(\d+)\s*db\s+(\w+)',
        r'(\w+)[:\s]+(\d+)\s*db',
        r'(\d+)\s*x\s*(\w+)',
    ]
    explicit = Counter()
    for pat in qty_patterns:
        for m in re.finditer(pat, full_text):
            try:
                qty = int(m.group(1))
                word = m.group(2).lower()
                for symbol, keywords in SYMBOL_KEYWORDS.items():
                    if any(kw in word for kw in keywords):
                        explicit[symbol] = max(explicit[symbol], qty)
            except Exception:
                pass

    final = {**counts}
    for s, q in explicit.items():
        final[s] = q

    blocks = [{'name': n, 'layer': 'PDF', 'count': int(c)} for n, c in final.items() if c > 0]

    lengths = []
    for m in re.finditer(r'(\d+[\.,]?\d*)\s*(fm|m|méter|meter|lm)', full_text):
        try:
            val = float(m.group(1).replace(',', '.'))
            if val > 0.5:
                lengths.append({'layer': 'PDF_TEXT', 'length': val, 'length_raw': val, 'info': None})
        except Exception:
            pass

    if not lengths:
        lengths = [{'layer': 'PDF', 'length': 0.0, 'length_raw': 0.0, 'info': None}]

    return blocks, lengths, len(doc), 'text_fallback'


def parse_pdf_bytes(file_bytes):
    """Main entry point: tries Vision first, falls back to text extraction."""
    try:
        import fitz  # noqa – ensure PyMuPDF available
    except ImportError:
        return {'success': False, 'error': 'PyMuPDF nincs telepítve a szerveren.'}

    page_count = 0
    source = 'text_fallback'
    warnings = []

    # ── VISION PATH (GPT-4o) ──────────────────────────────────────────────────
    if OPENAI_API_KEY:
        try:
            images, page_count = pdf_pages_to_images(file_bytes, max_pages=8, dpi=150)

            if not images:
                raise ValueError('Nem sikerült képet renderelni a PDF-ből.')

            page_results = []
            for i, img_b64 in enumerate(images):
                pr = call_vision_for_page(img_b64, i + 1)
                page_results.append(pr)

            vision_items, avg_conf = merge_vision_results(page_results)
            blocks, lengths = vision_results_to_blocks(vision_items)
            source = 'vision_gpt4o'

            return {
                'success': True,
                'blocks': blocks,
                'lengths': lengths,
                'layers': ['PDF_VISION'],
                'units': {
                    'insunits': 0,
                    'name': 'PDF (Vision AI)',
                    'factor': None,
                    'auto_detected': False,
                },
                'title_block': {},
                'summary': {
                    'total_block_types': len(blocks),
                    'total_blocks': sum(b['count'] for b in blocks),
                    'total_layers': 1,
                    'layers_with_lines': len([l for l in lengths if l['length'] > 0]),
                },
                '_source': source,
                '_pages': page_count,
                '_pages_analyzed': len(images),
                '_vision_confidence': round(avg_conf, 2),
                '_vision_items': vision_items,
                '_note': f'GPT-4o Vision elemezte ({len(images)}/{page_count} oldal). Átlagos bizalom: {round(avg_conf*100)}%.',
                'warnings': warnings,
            }

        except Exception as e:
            warnings.append(f'Vision elemzés nem sikerült ({e}), szövegalapú módra váltás.')

    # ── TEXT FALLBACK ─────────────────────────────────────────────────────────
    try:
        blocks, lengths, page_count, source = parse_pdf_text_fallback(file_bytes)
        return {
            'success': True,
            'blocks': blocks,
            'lengths': lengths,
            'layers': ['PDF'],
            'units': {
                'insunits': 0,
                'name': 'PDF (szöveg alapú)',
                'factor': None,
                'auto_detected': False,
            },
            'title_block': {},
            'summary': {
                'total_block_types': len(blocks),
                'total_blocks': sum(b['count'] for b in blocks),
                'total_layers': 1,
                'layers_with_lines': len([l for l in lengths if l['length'] > 0]),
            },
            '_source': source,
            '_pages': page_count,
            '_note': 'PDF szöveg alapú felismerés (nincs OPENAI_API_KEY vagy Vision hiba). Pontosabb eredményhez DXF fájlt használj.',
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
            if 'application/json' in content_type:
                payload = json.loads(body or b'{}')
                b64 = payload.get('pdf_base64') or payload.get('data') or ''
                if not b64:
                    raise ValueError('pdf_base64 mező hiányzik')
                pdf_bytes = base64.b64decode(b64)
            elif 'multipart/form-data' in content_type:
                import cgi
                env = {
                    'REQUEST_METHOD': 'POST',
                    'CONTENT_TYPE': content_type,
                    'CONTENT_LENGTH': str(length),
                }
                form = cgi.FieldStorage(fp=io.BytesIO(body), environ=env, keep_blank_values=True)
                if 'file' in form:
                    pdf_bytes = form['file'].file.read()
            else:
                try:
                    pdf_bytes = base64.b64decode(body)
                except Exception:
                    pdf_bytes = body

            if not pdf_bytes:
                raise ValueError('Üres PDF tartalom.')

            result = parse_pdf_bytes(pdf_bytes)
            self._respond(200, result)

        except Exception as e:
            self._respond(500, {
                'success': False,
                'error': str(e),
                'trace': traceback.format_exc(),
            })

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
