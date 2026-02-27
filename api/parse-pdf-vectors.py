"""
PDF Vektor Elemzés endpoint
Direkt path/drawing elemzés PyMuPDF segítségével - nem Vision AI!
Villamos szimbólumok számlálása szín és méret alapján.
Kábelvonalak hossza réteg/szín alapján, léptékkel korrigálva.
"""
from http.server import BaseHTTPRequestHandler
import json, base64, traceback, io, math, os
from collections import defaultdict

def classify_color(c, threshold_r=0.75):
    """Szín kategorizálás (tuple/list of floats 0..1)"""
    if not c or len(c) < 3:
        return 'none'
    r, g, b = float(c[0]), float(c[1]), float(c[2])
    if r > threshold_r and g < 0.35 and b < 0.35:
        return 'red'
    if r < 0.15 and g < 0.15 and b < 0.15:
        return 'black'
    if r > 0.85 and g > 0.85 and b < 0.25:
        return 'yellow'
    if r < 0.35 and g > 0.55 and b > 0.55:
        return 'cyan'
    if r < 0.35 and g < 0.35 and b > 0.65:
        return 'blue'
    if r > 0.75 and g > 0.5 and b < 0.25:
        return 'orange'
    if 0.45 < r < 0.95 and 0.45 < g < 0.95 and 0.45 < b < 0.95 and abs(r-g)<0.15 and abs(g-b)<0.15:
        return 'gray'
    return 'other'


def detect_scale(page_width_pt, page_height_pt):
    """
    Becsüli a lépték-faktort a lap mérete alapján.
    Visszaadja a méter/pt értéket.
    Tipikus villamos tervrajzok: 1:50 (emelet alaprajz) vagy 1:100 (helyszínrajz)
    """
    # 1 pt = 0.3528 mm
    pt_to_mm = 0.3528

    page_w_mm = page_width_pt * pt_to_mm
    page_h_mm = page_height_pt * pt_to_mm

    # Lapformátum azonosítás
    std_formats = {
        'A4': (297, 210), 'A3': (420, 297), 'A2': (594, 420),
        'A1': (841, 594), 'A0': (1189, 841),
    }
    best_fmt = None
    best_diff = 1e9
    for name, (fw, fh) in std_formats.items():
        for pw, ph in [(page_w_mm, page_h_mm), (page_h_mm, page_w_mm)]:
            diff = abs(pw - fw) + abs(ph - fh)
            if diff < best_diff:
                best_diff = diff
                best_fmt = name

    # Standard léptékek emelet alaprajzhoz
    # A2/A1 → 1:50 tipikus; A0 → 1:100
    default_scales = {'A4': 25, 'A3': 50, 'A2': 50, 'A1': 50, 'A0': 100}
    scale = default_scales.get(best_fmt, 50)

    m_per_pt = pt_to_mm * scale / 1000.0
    return scale, m_per_pt, best_fmt, page_w_mm, page_h_mm


def analyze_pdf_vectors(file_bytes, filename=''):
    """
    Direkt PDF vektoros elemzés:
    - Szimbólumok számlálása (zárt kis alakzatok szín/méret szerint)
    - Vonal hosszak szín szerint (kábel nyomvonalak)
    """
    import fitz

    doc = fitz.open(stream=file_bytes, filetype='pdf')
    total_pages = len(doc)

    all_symbols = []      # erőátviteli szimbólumok
    all_cable_lengths = defaultdict(float)  # szín → összesített hossz (pt)
    scale_info = None

    for page_num, page in enumerate(doc):
        paths = page.get_drawings()

        # Lépték detektálás az első oldalon
        if page_num == 0:
            scale, m_per_pt, fmt, pw_mm, ph_mm = detect_scale(page.rect.width, page.rect.height)
            scale_info = {
                'scale': scale, 'm_per_pt': m_per_pt,
                'format': fmt, 'page_w_mm': round(pw_mm), 'page_h_mm': round(ph_mm)
            }

        for p in paths:
            rect = p.get('rect')
            if not rect:
                continue
            w, h = rect.width, rect.height
            fill = p.get('fill')
            stroke = p.get('color')
            fill_color = classify_color(fill)
            stroke_color = classify_color(stroke)

            # ── SZIMBÓLUM DETEKTÁLÁS ──────────────────────────────────────────
            # Villamos szimbólumok: 6-60pt méret, általában négyzetes vagy pici téglalap
            if 5 < w < 65 and 5 < h < 65:
                # Piros szimbólum = erőátviteli elem (dugalj, kapcsoló stb.)
                if fill_color == 'red' or stroke_color == 'red':
                    cx = (rect.x0 + rect.x1) / 2
                    cy = (rect.y0 + rect.y1) / 2
                    all_symbols.append({
                        'cx': cx, 'cy': cy, 'w': w, 'h': h,
                        'color': 'red', 'page': page_num,
                        'square': abs(w - h) < max(w, h) * 0.4,
                    })

            # ── VONAL HOSSZAK ─────────────────────────────────────────────────
            items = p.get('items', [])
            length_pt = 0.0
            prev_pt = None
            for item in items:
                if item[0] == 'm':
                    prev_pt = item[1]
                elif item[0] == 'l' and prev_pt:
                    dx = item[1].x - prev_pt.x
                    dy = item[1].y - prev_pt.y
                    length_pt += math.sqrt(dx**2 + dy**2)
                    prev_pt = item[1]
                elif item[0] == 'l':
                    prev_pt = item[1]
                elif item[0] in ('c', 'v', 'y'):  # bezier curves
                    if prev_pt and item[-1]:
                        dx = item[-1].x - prev_pt.x
                        dy = item[-1].y - prev_pt.y
                        length_pt += math.sqrt(dx**2 + dy**2) * 1.2  # curve correction
                        prev_pt = item[-1]

            if length_pt > 0:
                # Szín szerint kategorizálva
                cat = stroke_color if stroke_color != 'none' else ('fill_' + fill_color)
                all_cable_lengths[cat] += length_pt

    # ── SZIMBÓLUM CLUSTERING ──────────────────────────────────────────────────
    # Közel lévő piros elemek = egy szimbólum
    def cluster(elements, threshold=12):
        clusters = []
        used = [False] * len(elements)
        for i, e in enumerate(elements):
            if used[i]:
                continue
            group = [e]
            used[i] = True
            for j, other in enumerate(elements):
                if used[j]:
                    continue
                if abs(e['cx']-other['cx']) < threshold and abs(e['cy']-other['cy']) < threshold:
                    group.append(other)
                    used[j] = True
            cx = sum(x['cx'] for x in group) / len(group)
            cy = sum(x['cy'] for x in group) / len(group)
            avg_w = sum(x['w'] for x in group) / len(group)
            avg_h = sum(x['h'] for x in group) / len(group)
            clusters.append({
                'cx': cx, 'cy': cy, 'parts': len(group),
                'avg_size': (avg_w + avg_h) / 2,
                'color': group[0]['color'],
            })
        return clusters

    red_clusters = cluster(all_symbols, threshold=14)

    # ── EREDMÉNY ÖSSZEÁLLÍTÁSA ────────────────────────────────────────────────
    mpp = scale_info['m_per_pt'] if scale_info else 0.0176  # default 1:50 A2

    # Kábel hosszak méterben
    red_cable_m = (all_cable_lengths.get('red', 0) + all_cable_lengths.get('fill_red', 0)) * mpp
    black_cable_m = (all_cable_lengths.get('black', 0) + all_cable_lengths.get('fill_black', 0)) * mpp
    cyan_cable_m = (all_cable_lengths.get('cyan', 0) + all_cable_lengths.get('blue', 0) + all_cable_lengths.get('fill_cyan', 0)) * mpp
    gray_m = all_cable_lengths.get('gray', 0) * mpp  # falak, bútorok (kiszűrendő)

    # Szimbólumok méret szerint szegregálva
    small_symbols = [s for s in red_clusters if s['avg_size'] < 15]   # dugalj, kapcsoló
    medium_symbols = [s for s in red_clusters if 15 <= s['avg_size'] < 35]  # lámpa, panel
    large_symbols = [s for s in red_clusters if s['avg_size'] >= 35]   # elosztó, nagy panel

    # Blokkok és hosszak összeállítása a wizard formátumba
    blocks = []
    lengths = []

    if small_symbols:
        blocks.append({
            'name': 'Erőátviteli szerelvény (kis)',
            'layer': 'PDF_RED_SMALL',
            'count': len(small_symbols),
        })
    if medium_symbols:
        blocks.append({
            'name': 'Erőátviteli szerelvény (közepes)',
            'layer': 'PDF_RED_MEDIUM',
            'count': len(medium_symbols),
        })
    if large_symbols:
        blocks.append({
            'name': 'Elosztó / panel',
            'layer': 'PDF_RED_LARGE',
            'count': len(large_symbols),
        })

    # Kábel hosszak - piros vonalak = erőátviteli kábelek
    if red_cable_m > 1:
        lengths.append({
            'layer': 'PDF_RED_CABLE',
            'length': round(red_cable_m, 1),
            'length_raw': round(red_cable_m, 1),
            'info': {'name': 'Erőátviteli kábel (piros)', 'type': 'kabel', 'color': 'red'},
        })
    if cyan_cable_m > 1:
        lengths.append({
            'layer': 'PDF_CYAN_TRAY',
            'length': round(cyan_cable_m, 1),
            'length_raw': round(cyan_cable_m, 1),
            'info': {'name': 'Kábeltálca (kék/türkiz)', 'type': 'kabeltalca', 'color': 'cyan'},
        })

    # Ha piros kábel nincs de fekete van (régebbi tervek)
    if not lengths and black_cable_m > 5:
        lengths.append({
            'layer': 'PDF_BLACK_CABLE',
            'length': round(black_cable_m * 0.25, 1),  # ~25% a falaktól különböző kábel
            'length_raw': round(black_cable_m, 1),
            'info': {'name': 'Kábel (fekete, becsült)', 'type': 'kabel'},
        })

    if not lengths:
        lengths.append({'layer': 'PDF_VECTOR', 'length': 0.0, 'length_raw': 0.0, 'info': None})

    # Confidence: ha vannak szimbólumok és vonalak → jó
    confidence = 0.3
    if red_clusters:
        confidence = 0.65
    if red_clusters and red_cable_m > 5:
        confidence = 0.80

    notes_parts = [
        f"PDF vektoros elemzés ({scale_info['format']} lap, 1:{scale_info['scale']} lépték).",
        f"Piros szimbólumcsoportok: {len(red_clusters)} db.",
        f"Piros vonalak: {red_cable_m:.0f}m, kék/türkiz: {cyan_cable_m:.0f}m.",
        f"Szürke (falak/bútorok, kiszűrve): {gray_m:.0f}m.",
    ]

    warnings = []
    if confidence < 0.6:
        warnings.append(
            'Kevés piros/kék szimbólum azonosítható. A terv esetleg más színkódolást használ. '
            'Vision AI módra váltás ajánlott a pontosabb elemzéshez.'
        )
    if scale_info['scale'] != 50:
        warnings.append(
            f"Lépték automatikusan {scale_info['scale']}:1-re becsülve "
            f"({scale_info['format']} lapméret alapján). Ha ez eltér, a hosszak aránytévesek lehetnek."
        )

    return {
        'success': True,
        'blocks': blocks,
        'lengths': lengths,
        'layers': list({b['layer'] for b in blocks} | {l['layer'] for l in lengths}),
        'units': {
            'insunits': 0,
            'name': f"PDF (vektor 1:{scale_info['scale']})",
            'factor': mpp,
            'auto_detected': True,
        },
        'title_block': {},
        'summary': {
            'total_block_types': len(blocks),
            'total_blocks': sum(b['count'] for b in blocks),
            'total_layers': len(set(b['layer'] for b in blocks)),
            'layers_with_lines': len([l for l in lengths if l['length'] > 0]),
        },
        '_source': 'pdf_vector',
        '_confidence': confidence,
        '_scale': scale_info,
        '_symbol_count': len(red_clusters),
        '_red_cable_m': round(red_cable_m, 1),
        '_cyan_cable_m': round(cyan_cable_m, 1),
        '_pages': total_pages,
        '_note': ' '.join(notes_parts),
        'warnings': warnings,
    }


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            payload = json.loads(body or b'{}')

            b64 = payload.get('pdf_base64') or payload.get('data') or ''
            if not b64:
                raise ValueError('pdf_base64 mező hiányzik')
            filename = payload.get('filename', '')

            try:
                import fitz  # noqa
            except ImportError:
                raise RuntimeError('PyMuPDF nincs telepítve')

            pdf_bytes = base64.b64decode(b64)
            result = analyze_pdf_vectors(pdf_bytes, filename)
            self._respond(200, result)

        except Exception as e:
            self._respond(500, {
                'success': False,
                'error': str(e),
                'trace': traceback.format_exc()
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
