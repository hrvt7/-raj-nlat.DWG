from http.server import BaseHTTPRequestHandler
import json, tempfile, os, base64, traceback


# DXF $INSUNITS values → (unit_name, factor_to_meters)
INSUNITS_MAP = {
    0:  ("unknown", None),
    1:  ("inches",  0.0254),
    2:  ("feet",    0.3048),
    3:  ("miles",   1609.34),
    4:  ("mm",      0.001),
    5:  ("cm",      0.01),
    6:  ("m",       1.0),
    7:  ("km",      1000.0),
    8:  ("microinches", 2.54e-8),
    9:  ("mils",    2.54e-5),
    10: ("yards",   0.9144),
    11: ("angstroms", 1e-10),
    12: ("nanometers", 1e-9),
    13: ("microns", 1e-6),
    14: ("decimeters", 0.1),
    15: ("decameters", 10.0),
    16: ("hectometers", 100.0),
    17: ("gigameters", 1e9),
    18: ("AU",      1.496e11),
    19: ("light-years", 9.461e15),
    20: ("parsecs", 3.086e16),
}


def parse_dxf_bytes(file_bytes):
    """
    Server-side DXF parser using stdlib only (no ezdxf).
    This is a fallback – primary parsing runs client-side in the browser.
    """
    try:
        from collections import Counter, defaultdict
        import re

        text = file_bytes.decode('utf-8', errors='replace')
        lines = text.split('\n')

        # Tokenize DXF: alternating group_code / value lines
        tokens = []
        for i in range(0, len(lines) - 1, 2):
            try:
                code = int(lines[i].strip())
                val = lines[i + 1].strip()
                tokens.append((code, val))
            except ValueError:
                continue

        # Detect $INSUNITS
        insunits = 0
        in_header, current_var = False, None
        for code, val in tokens:
            if code == 0 and val == 'SECTION': in_header = False
            if code == 2 and val == 'HEADER': in_header = True
            if code == 2 and val != 'HEADER' and in_header: current_var = val
            if in_header and current_var == '$INSUNITS' and code == 70:
                insunits = int(val); break

        INSUNITS_MAP_LOCAL = {0:('unknown',None),1:('inches',0.0254),2:('feet',0.3048),
            4:('mm',0.001),5:('cm',0.01),6:('m',1.0),14:('decimeters',0.1)}
        unit_name, unit_factor = INSUNITS_MAP_LOCAL.get(insunits, ('unknown', None))

        # Find ENTITIES section start
        entity_start = 0
        section_name, in_section = '', False
        for i, (code, val) in enumerate(tokens):
            if code == 0 and val == 'SECTION': in_section = True
            elif in_section and code == 2:
                section_name = val; in_section = False
                if val == 'ENTITIES': entity_start = i + 1; break

        block_counts = Counter()
        lengths_by_layer = defaultdict(float)
        all_layers = set()

        etype, elayer = None, 'DEFAULT'
        pts, pt_x, pt_y = [], None, None
        closed, line_start = False, None

        def flush_poly():
            if etype == 'LWPOLYLINE' and len(pts) > 1:
                L = sum(((pts[j+1][0]-pts[j][0])**2+(pts[j+1][1]-pts[j][1])**2)**0.5
                        for j in range(len(pts)-1))
                if closed:
                    L += ((pts[0][0]-pts[-1][0])**2+(pts[0][1]-pts[-1][1])**2)**0.5
                lengths_by_layer[elayer] += L

        i = entity_start
        while i < len(tokens):
            code, val = tokens[i]
            if code == 0 and val == 'ENDSEC': break
            if code == 0:
                flush_poly()
                etype, elayer = val, 'DEFAULT'
                pts, pt_x, pt_y, closed, line_start = [], None, None, False, None
                i += 1; continue
            if code == 8:
                elayer = val; all_layers.add(val)
            if etype == 'INSERT' and code == 2:
                block_counts[(val, elayer)] += 1
            if etype == 'LWPOLYLINE':
                if code == 70: closed = bool(int(val) & 1)
                if code == 10:
                    if pt_x is not None: pts.append((pt_x, pt_y or 0))
                    pt_x = float(val); pt_y = None
                if code == 20: pt_y = float(val)
            if etype == 'LINE':
                if code == 10: line_start = [float(val), 0]
                if code == 20 and line_start: line_start[1] = float(val)
                if code == 11 and line_start:
                    ex = float(val)
                    ey = float(tokens[i+1][1]) if i+1 < len(tokens) and tokens[i+1][0] == 21 else 0
                    dx, dy = ex - line_start[0], ey - line_start[1]
                    lengths_by_layer[elayer] += (dx*dx + dy*dy)**0.5
                    line_start = None
            i += 1
        flush_poly()

        if not unit_factor:
            max_raw = max(lengths_by_layer.values(), default=0)
            if max_raw > 10000: unit_name, unit_factor = 'mm (guessed)', 0.001
            elif max_raw > 100: unit_name, unit_factor = 'cm (guessed)', 0.01
            else: unit_name, unit_factor = 'm (guessed)', 1.0

        blocks = [{'name': n, 'layer': l, 'count': c}
                  for (n, l), c in block_counts.most_common(300)]
        lengths = [{'layer': l, 'length': round(v * unit_factor, 3),
                    'length_raw': round(v, 4), 'info': None}
                   for l, v in sorted(lengths_by_layer.items(), key=lambda x: -x[1]) if v > 0.01]

        return {
            'success': True, 'blocks': blocks, 'lengths': lengths,
            'layers': sorted(all_layers),
            'units': {'insunits': insunits, 'name': unit_name, 'factor': unit_factor, 'auto_detected': True},
            'title_block': {},
            'summary': {'total_block_types': len(set(b['name'] for b in blocks)),
                        'total_blocks': sum(b['count'] for b in blocks),
                        'total_layers': len(all_layers), 'layers_with_lines': len(lengths)},
            '_source': 'server_stdlib',
        }
    except Exception as e:
        return {'success': False, 'error': str(e), 'trace': traceback.format_exc()}

class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors(); self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            payload = json.loads(body)
            file_bytes = base64.b64decode(payload.get('data', ''))
            result = parse_dxf_bytes(file_bytes)
            self._respond(200, result)
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e), "trace": traceback.format_exc()})

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
