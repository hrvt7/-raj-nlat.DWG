from http.server import BaseHTTPRequestHandler
import json, base64, traceback, io, re
from collections import Counter


# Hungarian electrical symbol keywords (text-based detection in PDF)
SYMBOL_KEYWORDS = {
    'dugalj':    ['dugalj', 'konnektor', 'socket', 'aljzat'],
    'kapcsolo':  ['kapcsoló', 'kapcsolo', 'switch', 'villanykapcs'],
    'lampa':     ['lámpa', 'lampa', 'light', 'luminaire', 'ledfény'],
    'fi_rele':   ['fi relé', 'fi rele', 'rcd', 'rcbo'],
    'kismegszakito': ['kismegszakító', 'kismegszakito', 'mcb', 'megszakít'],
    'panel':     ['elosztó', 'eloszto', 'panel', 'szekrény', 'szekreny', 'tábla'],
    'kabel':     ['kábel', 'kabel', 'cable', 'vezeték', 'nayy', 'nyy', 'cyky'],
}


def parse_pdf_bytes(file_bytes):
    try:
        import fitz  # PyMuPDF – text extraction only, no OpenCV

        doc = fitz.open(stream=file_bytes, filetype='pdf')

        all_text = []
        page_count = len(doc)

        for page in doc:
            text = page.get_text('text')
            all_text.append(text)

        full_text = '\n'.join(all_text).lower()

        # Count symbol keywords in text
        counts = Counter()
        for symbol, keywords in SYMBOL_KEYWORDS.items():
            for kw in keywords:
                hits = full_text.count(kw.lower())
                if hits > 0:
                    counts[symbol] += hits

        # Try to extract quantities like "12 db dugalj" or "dugalj: 8"
        qty_patterns = [
            r'(\d+)\s*db\s+(\w+)',       # "12 db dugalj"
            r'(\w+)[:\s]+(\d+)\s*db',    # "dugalj: 8 db"
            r'(\d+)\s*x\s*(\w+)',        # "12x dugalj"
        ]

        explicit_counts = Counter()
        for pat in qty_patterns:
            for m in re.finditer(pat, full_text):
                try:
                    qty = int(m.group(1))
                    word = m.group(2).lower()
                    for symbol, keywords in SYMBOL_KEYWORDS.items():
                        if any(kw in word for kw in keywords):
                            explicit_counts[symbol] = max(explicit_counts[symbol], qty)
                except:
                    pass

        # Prefer explicit qty if found, else keyword presence as count
        final_counts = {**counts}
        for s, q in explicit_counts.items():
            final_counts[s] = q

        blocks = [
            {'name': name, 'layer': 'PDF', 'count': int(count)}
            for name, count in final_counts.items()
            if count > 0
        ]

        # Extract any mentions of cable lengths
        lengths = []
        cable_pattern = r'(\d+[\.,]?\d*)\s*(fm|m|méter|meter|lm)'
        for m in re.finditer(cable_pattern, full_text):
            try:
                val = float(m.group(1).replace(',', '.'))
                if val > 0.5:
                    lengths.append({'layer': 'PDF_TEXT', 'length': val, 'length_raw': val, 'info': None})
            except:
                pass

        if not lengths:
            lengths = [{'layer': 'PDF', 'length': 0.0, 'length_raw': 0.0, 'info': None}]

        return {
            'success': True,
            'blocks': blocks,
            'lengths': lengths,
            'layers': ['PDF'],
            'units': {'insunits': 0, 'name': 'PDF (szöveg alapú)', 'factor': None, 'auto_detected': False},
            'title_block': {},
            'summary': {
                'total_block_types': len(blocks),
                'total_blocks': sum(b['count'] for b in blocks),
                'total_layers': 1,
                'layers_with_lines': len(lengths),
            },
            '_source': 'pdf_text',
            '_pages': page_count,
            '_note': 'PDF szöveg alapú felismerés – pontosabb eredményhez használj DXF fájlt.',
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
                pdf_bytes = base64.b64decode(b64)
            elif 'multipart/form-data' in content_type:
                import cgi
                env = {'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type, 'CONTENT_LENGTH': str(length)}
                form = cgi.FieldStorage(fp=io.BytesIO(body), environ=env, keep_blank_values=True)
                if 'file' in form:
                    pdf_bytes = form['file'].file.read()
            else:
                try:
                    pdf_bytes = base64.b64decode(body)
                except:
                    pdf_bytes = body

            if not pdf_bytes:
                raise ValueError('Üres PDF tartalom.')

            result = parse_pdf_bytes(pdf_bytes)
            self._respond(200, result)
        except Exception as e:
            self._respond(500, {'success': False, 'error': str(e), 'trace': traceback.format_exc()})

    def _respond(self, code, data):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *a): pass
