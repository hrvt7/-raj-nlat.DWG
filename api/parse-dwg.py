"""
DWG Parser endpoint – utolsó tartalék, ha a CloudConvert DWG→DXF konverzió sikertelen.
Stratégia: bináris szöveg kinyerés az ASCII stringekből (rétegnevek, blokk nevek, szöveg entitások).
Vision AI NINCS – csak a tényleges fájl adataiból dolgozunk.
"""
from http.server import BaseHTTPRequestHandler
import json, base64, traceback, os, re
from collections import Counter

SYMBOL_KEYWORDS = {
    'dugalj':        ['dugalj', 'konnektor', 'socket', 'aljzat'],
    'kapcsolo':      ['kapcsoló', 'kapcsolo', 'switch', 'villanykapcs'],
    'lampa':         ['lámpa', 'lampa', 'light', 'luminaire', 'ledfény', 'downlight'],
    'fi_rele':       ['fi relé', 'fi rele', 'rcd', 'rcbo'],
    'kismegszakito': ['kismegszakító', 'kismegszakito', 'mcb', 'megszakít'],
    'panel':         ['elosztó', 'eloszto', 'panel', 'szekrény', 'szekreny', 'tábla'],
    'kabel':         ['kábel', 'kabel', 'cable', 'vezeték', 'nayy', 'nyy', 'cyky', 'nym'],
}


def extract_text_from_dwg(file_bytes):
    """
    DWG fájlok binárisban ASCII stringeket tartalmaznak.
    Legalább 5 karakteres, érvényes ASCII karaktereket tartalmazó sorozatokat nyerünk ki.
    A 3-4 karakteres stringek kizárása csökkenti a bináris szemét mennyiségét.
    DWG AC1015+ (2000+) verzióknál a rétegnevek, blokk nevek és szöveg entitások
    általában kinyerhetők.
    """
    raw = file_bytes.decode('latin-1', errors='replace')

    # Legalább 5 karakteres printable ASCII sorozatok – kevesebb bináris szemét
    strings = re.findall(r'[ -~\t]{5,}', raw)
    # Szűrés: csak értelmes szavakat tartalmazó sorok (legalább 1 betű)
    strings = [s for s in strings if re.search(r'[A-Za-záéíóöőúüűÁÉÍÓÖŐÚÜŰ]{3,}', s)]
    text = ' '.join(strings).lower()

    # Kulcsszó találatok számlálása
    counts = Counter()
    for symbol, keywords in SYMBOL_KEYWORDS.items():
        for kw in keywords:
            hits = text.count(kw.lower())
            if hits > 0:
                counts[symbol] += hits

    # Explicit mennyiségek keresése (pl. "24 db dugalj" vagy "dugalj: 24 db")
    qty_patterns = [
        r'(\d+)\s*db\s+(\w+)',
        r'(\w+)[:\s]+(\d+)\s*db',
    ]
    explicit = Counter()
    for pat in qty_patterns:
        for m in re.finditer(pat, text):
            try:
                qty = int(m.group(1))
                if qty > 500:
                    continue  # valószínűtlen érték, kihagyjuk
                word = m.group(2).lower()
                for symbol, keywords in SYMBOL_KEYWORDS.items():
                    if any(kw in word for kw in keywords):
                        explicit[symbol] = max(explicit.get(symbol, 0), qty)
            except Exception:
                pass

    final = {**counts}
    for s, q in explicit.items():
        final[s] = q

    # Kábelhossz keresése numerikus értékekből (fm, m, méter)
    lengths = []
    seen_vals = set()
    for m in re.finditer(r'(\d+[\.,]?\d*)\s*(fm|m\b|méter|lm)', text):
        try:
            val = float(m.group(1).replace(',', '.'))
            if 5 < val < 50000 and val not in seen_vals:
                seen_vals.add(val)
                lengths.append({'layer': 'DWG_TEXT', 'length': val, 'length_raw': val, 'info': None})
        except Exception:
            pass

    blocks = [
        {'name': n, 'layer': 'DWG', 'count': int(c)}
        for n, c in final.items() if c > 0
    ]

    found_something = len(blocks) > 0 or any(l['length'] > 0 for l in lengths)
    return blocks, lengths, found_something


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        filename = 'file.dwg'
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            payload = json.loads(body)

            file_b64 = payload.get('dwg_base64') or payload.get('data', '')
            filename = payload.get('filename', 'file.dwg')

            if not file_b64:
                raise ValueError('dwg_base64 mező hiányzik')

            file_bytes = base64.b64decode(file_b64)
            warnings = []

            # ── Bináris szöveg kinyerés ───────────────────────────────────────
            try:
                blocks, lengths, found = extract_text_from_dwg(file_bytes)
            except Exception as ex:
                blocks, lengths, found = [], [], False
                warnings.append(f'Bináris kinyerési hiba: {ex}')

            if not lengths:
                lengths = [{'layer': 'DWG', 'length': 0.0, 'length_raw': 0.0, 'info': None}]

            confidence = 0.45 if found else 0.15
            if found:
                note = 'DWG bináris szöveg-kinyerés – adatok találhatók. Pontosabb eredményhez exportálj DXF formátumba.'
            else:
                note = (
                    'A DWG bináris formátumból nem sikerült szöveges adatot kinyerni – '
                    'ez normális viselkedés modern DWG fájloknál. '
                    'Nyisd meg a fájlt AutoCAD / DWG TrueView programban és exportáld DXF formátumba.'
                )
                warnings.append(
                    'DWG automatikus DXF konverzió sikertelen. Exportálj DXF formátumba az AutoCAD / '
                    'DWG TrueView programból: Fájl → Mentés másként → AutoCAD DXF (*.dxf).'
                )

            self._respond(200, self._build_result(
                blocks, lengths, 'dwg_text', confidence, filename, warnings, note
            ))

        except Exception as e:
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
                '_note': f'DWG feldolgozási hiba: {e}. Exportálj DXF formátumba az AutoCAD / DWG TrueView programból.',
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
