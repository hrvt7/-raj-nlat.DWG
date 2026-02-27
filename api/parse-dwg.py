"""
DWG Parser endpoint – two strategies:
1. Try to extract text sections from binary DWG (works for some DWG versions)
2. GPT-4o Vision: render DWG pages as images via LibreCAD/fallback trick
   Since we can't render DWG natively without heavy deps, we use a text-extraction
   approach and Vision as secondary.
"""
from http.server import BaseHTTPRequestHandler
import json, base64, traceback, os, re
from collections import Counter

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

SYMBOL_KEYWORDS = {
    'dugalj':        ['dugalj', 'konnektor', 'socket', 'aljzat'],
    'kapcsolo':      ['kapcsoló', 'kapcsolo', 'switch', 'villanykapcs'],
    'lampa':         ['lámpa', 'lampa', 'light', 'luminaire', 'ledfény', 'downlight'],
    'fi_rele':       ['fi relé', 'fi rele', 'rcd', 'rcbo'],
    'kismegszakito': ['kismegszakító', 'kismegszakito', 'mcb', 'megszakít'],
    'panel':         ['elosztó', 'eloszto', 'panel', 'szekrény', 'szekreny', 'tábla'],
    'kabel':         ['kábel', 'kabel', 'cable', 'vezeték', 'nayy', 'nyy', 'cyky', 'nym'],
}

VISION_PROMPT = """Te egy tapasztalt magyar villamos tervező mérnök asszisztens vagy.
Ez egy DWG/DXF villamos tervrajz.

FELADATOD: Azonosítsd és számold meg az összes villamos eszközt és jelölést.

Keress:
- Dugaljak / konnektorok (db)
- Kapcsolók (db)
- Lámpák, luminaire-ek (db)
- Kismegszakítók, FI-relék (db)
- Elosztók, panelek (db)
- Kábelek, vonalak (fm/méter becsült hossz)
- Kábeltálca (fm/méter)
- Bármilyen más villamos szerelvény

VÁLASZOLJ KIZÁRÓLAG valid JSON-ban:
{
  "items": [
    {"name": "Dugalj 2P+F", "type": "dugalj", "quantity": 24, "unit": "db", "notes": ""},
    {"name": "NYM-J 3x1.5", "type": "kabel", "quantity": 145, "unit": "fm", "notes": ""}
  ],
  "confidence": 0.75,
  "source": "vision_dwg",
  "notes": "DWG tervrajz vizuális elemzése"
}"""


def extract_text_from_dwg(file_bytes):
    """
    DWG files contain ASCII text strings embedded in the binary.
    Extract printable ASCII runs of 4+ chars – catches layer names,
    block names, and text entities even from binary DWG.
    """
    # Decode as latin-1 to avoid UnicodeDecodeError on binary
    raw = file_bytes.decode('latin-1', errors='replace')
    
    # Extract runs of printable ASCII characters (min 3 chars)
    strings = re.findall(r'[ -~\t\n]{3,}', raw)
    text = ' '.join(strings).lower()
    
    # Count keyword hits
    counts = Counter()
    for symbol, keywords in SYMBOL_KEYWORDS.items():
        for kw in keywords:
            hits = text.count(kw.lower())
            if hits > 0:
                counts[symbol] += hits

    # Explicit quantities
    qty_patterns = [
        r'(\d+)\s*db\s+(\w+)',
        r'(\w+)[:\s]+(\d+)\s*db',
    ]
    explicit = Counter()
    for pat in qty_patterns:
        for m in re.finditer(pat, text):
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

    # Cable lengths
    lengths = []
    for m in re.finditer(r'(\d+[\.,]?\d*)\s*(fm|m\b|méter|lm)', text):
        try:
            val = float(m.group(1).replace(',', '.'))
            if 1 < val < 50000:  # sanity check
                lengths.append({'layer': 'DWG_TEXT', 'length': val, 'length_raw': val, 'info': None})
        except Exception:
            pass

    # Also try to extract DXF-like content from DWG
    # DWG AC1015+ (2000) has DXF-like sections partially readable
    blocks = [
        {'name': n, 'layer': 'DWG', 'count': int(c)}
        for n, c in final.items() if c > 0
    ]

    found_something = len(blocks) > 0 or any(l['length'] > 0 for l in lengths)
    return blocks, lengths, found_something


def call_vision_on_image(img_b64):
    """Send a screenshot/image of the DWG to GPT-4o Vision."""
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
                    'image_url': {'url': f'data:image/png;base64,{img_b64}', 'detail': 'high'}
                },
                {'type': 'text', 'text': VISION_PROMPT}
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
    return json.loads(raw.replace('```json', '').replace('```', '').strip())


def vision_items_to_blocks(items):
    blocks, lengths = [], []
    for item in items:
        qty = int(round(float(item.get('quantity', 0) or 0)))
        itype = item.get('type', 'egyeb')
        name = item.get('name', itype)
        unit = item.get('unit', 'db')
        if itype == 'kabel' or unit in ('fm', 'm', 'méter', 'lm'):
            lengths.append({'layer': 'DWG_VISION', 'length': float(item['quantity']),
                            'length_raw': float(item['quantity']), 'info': {'name': name}})
        elif qty > 0:
            blocks.append({'name': name, 'layer': f'DWG_{itype.upper()}', 'count': qty})
    if not lengths:
        lengths = [{'layer': 'DWG', 'length': 0.0, 'length_raw': 0.0, 'info': None}]
    return blocks, lengths


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            payload = json.loads(body)

            file_b64 = payload.get('dwg_base64') or payload.get('data', '')
            screenshot_b64 = payload.get('screenshot_base64')  # optional frontend screenshot
            filename = payload.get('filename', 'file.dwg')

            if not file_b64:
                raise ValueError('dwg_base64 mező hiányzik')

            file_bytes = base64.b64decode(file_b64)
            warnings = []
            source = 'dwg_text'

            # ── Strategy 1: Vision on screenshot (if frontend sends one) ──────
            if screenshot_b64 and OPENAI_API_KEY:
                try:
                    vision_result = call_vision_on_image(screenshot_b64)
                    items = vision_result.get('items', [])
                    blocks, lengths = vision_items_to_blocks(items)
                    confidence = vision_result.get('confidence', 0.6)
                    source = 'vision_screenshot'
                    return self._respond(200, self._build_result(
                        blocks, lengths, source, confidence, filename, warnings,
                        note='DWG képernyőkép Vision AI elemzése (GPT-4o).'
                    ))
                except Exception as e:
                    warnings.append(f'Screenshot Vision hiba: {e}')

            # ── Strategy 2: Binary text extraction ───────────────────────────
            try:
                blocks, lengths, found = extract_text_from_dwg(file_bytes)
            except Exception as ex:
                blocks, lengths, found = [], [], False
                warnings.append(f'Bináris kinyerési hiba: {ex}')

            if not lengths:
                lengths = [{'layer': 'DWG', 'length': 0.0, 'length_raw': 0.0, 'info': None}]

            # Gyenge eredmény de NEM hiba – a frontend Vision modalt nyit alacsony confidence-nél
            confidence = 0.45 if found else 0.15
            note = (
                'DWG bináris szöveg-kinyerés – adatok találhatók.' if found
                else 'DWG-ből kevés szöveges adat nyerhető ki – ez normális viselkedés erőátviteli '
                     'és kábeltálca DWG-knél. Pontosabb eredményhez használd a Vision AI pontosítást '
                     '(képernyőkép feltöltés) vagy exportálj DXF formátumba.'
            )
            if not found:
                warnings.append(
                    'A DWG bináris formátumból nem sikerült szöveges adatot kinyerni. '
                    'Nyisd meg a fájlt AutoCAD DWG TrueView-ban, zoom ki hogy az egész terv látsszon, '
                    'készíts képernyőképet, és töltsd fel Vision AI elemzéshez.'
                )

            self._respond(200, self._build_result(
                blocks, lengths, source, confidence, filename, warnings, note
            ))

        except Exception as e:
            # Még általános hibánál is success:true – a frontend kezeli
            self._respond(200, {
                'success': True,
                'blocks': [],
                'lengths': [{'layer': 'DWG', 'length': 0.0, 'length_raw': 0.0, 'info': None}],
                'layers': ['DWG'],
                'units': {'insunits': 0, 'name': 'DWG', 'factor': None, 'auto_detected': False},
                'title_block': {},
                'summary': {'total_block_types': 0, 'total_blocks': 0, 'total_layers': 0, 'layers_with_lines': 0},
                '_source': 'dwg_text',
                '_confidence': 0.1,
                '_filename': filename,
                '_note': f'DWG feldolgozási hiba: {e}. Vision AI pontosítás ajánlott.',
                'warnings': [str(e)],
            })

    def _build_result(self, blocks, lengths, source, confidence, filename, warnings, note):
        return {
            'success': True,
            'blocks': blocks,
            'lengths': lengths,
            'layers': list({b['layer'] for b in blocks} | {l['layer'] for l in lengths}),
            'units': {'insunits': 0, 'name': 'DWG', 'factor': None, 'auto_detected': False},
            'title_block': {},
            'summary': {
                'total_block_types': len(blocks),
                'total_blocks': sum(b['count'] for b in blocks),
                'total_layers': 1,
                'layers_with_lines': len([l for l in lengths if l['length'] > 0]),
            },
            '_source': source,
            '_confidence': confidence,
            '_filename': filename,
            '_note': note,
            'warnings': warnings,
        }

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
