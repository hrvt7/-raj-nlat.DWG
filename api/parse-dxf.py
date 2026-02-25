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
    try:
        import ezdxf
        from collections import Counter, defaultdict

        with tempfile.NamedTemporaryFile(suffix='.dxf', delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            doc = ezdxf.readfile(tmp_path)
            msp = doc.modelspace()

            # ── Detect drawing units from header ──────────────────
            try:
                insunits = doc.header.get('$INSUNITS', 0)
            except:
                insunits = 0

            unit_name, unit_factor = INSUNITS_MAP.get(insunits, ("unknown", None))
            
            # If unknown, try to guess from drawing extents
            if unit_factor is None:
                try:
                    extmin = doc.header.get('$EXTMIN', None)
                    extmax = doc.header.get('$EXTMAX', None)
                    if extmin and extmax:
                        dx = abs(extmax[0] - extmin[0])
                        dy = abs(extmax[1] - extmin[1])
                        max_dim = max(dx, dy)
                        if max_dim > 10000:
                            unit_name, unit_factor = "mm (guessed)", 0.001
                        elif max_dim > 100:
                            unit_name, unit_factor = "cm (guessed)", 0.01
                        else:
                            unit_name, unit_factor = "m (guessed)", 1.0
                except:
                    unit_name, unit_factor = "mm (default)", 0.001

            # ── Extract title block texts ──────────────────────────
            title_block = {}
            try:
                for e in msp:
                    if e.dxftype() in ("TEXT", "MTEXT"):
                        try:
                            layer = e.dxf.layer.upper()
                            if any(k in layer for k in ["TITLE", "CIM", "FEJLEC", "BORDER", "KERET"]):
                                text = e.dxf.text if e.dxftype() == "TEXT" else e.text
                                text = text.strip()
                                if text and len(text) > 1:
                                    title_block[layer] = title_block.get(layer, [])
                                    title_block[layer].append(text)
                        except:
                            pass
            except:
                pass

            # ── Parse entities ─────────────────────────────────────
            block_counts = Counter()
            lengths_by_layer = defaultdict(float)
            all_layers = set()
            layer_info = {}  # layer name → parsed info (cable size, tray size etc.)

            for e in msp:
                t = e.dxftype()
                try:
                    layer = e.dxf.layer
                except:
                    layer = 'DEFAULT'
                all_layers.add(layer)

                # Try to auto-parse layer name for useful info
                if layer not in layer_info:
                    info = parse_layer_name(layer)
                    if info:
                        layer_info[layer] = info

                if t == "INSERT":
                    try:
                        name = e.dxf.name
                    except:
                        name = 'UNKNOWN'
                    block_counts[(name, layer)] += 1

                elif t == "LWPOLYLINE":
                    try:
                        pts = list(e.get_points())
                        L = 0.0
                        for i in range(len(pts) - 1):
                            dx = pts[i+1][0] - pts[i][0]
                            dy = pts[i+1][1] - pts[i][1]
                            L += (dx*dx + dy*dy) ** 0.5
                        if e.closed and len(pts) > 1:
                            dx = pts[0][0] - pts[-1][0]
                            dy = pts[0][1] - pts[-1][1]
                            L += (dx*dx + dy*dy) ** 0.5
                        lengths_by_layer[layer] += L
                    except:
                        pass

                elif t == "POLYLINE":
                    try:
                        lengths_by_layer[layer] += e.length()
                    except:
                        pass

                elif t == "LINE":
                    try:
                        s, en = e.dxf.start, e.dxf.end
                        lengths_by_layer[layer] += ((en.x-s.x)**2+(en.y-s.y)**2)**0.5
                    except:
                        pass

            blocks = [
                {"name": n, "layer": l, "count": c}
                for (n, l), c in block_counts.most_common(300)
            ]
            
            # Convert lengths to meters using detected unit
            lengths = []
            for l, v in sorted(lengths_by_layer.items(), key=lambda x: -x[1]):
                if v > 0.01:
                    v_m = v * unit_factor if unit_factor else v * 0.001
                    lengths.append({
                        "layer": l,
                        "length": round(v_m, 3),
                        "length_raw": round(v, 4),
                        "info": layer_info.get(l)
                    })

            return {
                "success": True,
                "blocks": blocks,
                "lengths": lengths,
                "layers": sorted(list(all_layers)),
                "units": {
                    "insunits": insunits,
                    "name": unit_name,
                    "factor": unit_factor,
                    "auto_detected": True
                },
                "title_block": title_block,
                "summary": {
                    "total_block_types": len(set(b['name'] for b in blocks)),
                    "total_blocks": sum(b['count'] for b in blocks),
                    "total_layers": len(all_layers),
                    "layers_with_lines": len(lengths)
                }
            }
        finally:
            try: os.unlink(tmp_path)
            except: pass

    except Exception as e:
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}


def parse_layer_name(layer):
    """Try to extract useful info from layer name."""
    import re
    layer_up = layer.upper()
    info = {}

    # Tray size: TRAY_300x60, TALCA_500X100, CABLE_TRAY_300
    m = re.search(r'(\d{2,4})[xX×](\d{2,4})', layer_up)
    if m:
        info['tray_width'] = int(m.group(1))
        info['tray_height'] = int(m.group(2))
        info['type'] = 'tray'

    # Cable cross section: NYY_4x10, CYKY_3x2.5, YKY_1x95
    m = re.search(r'(\d+)[xX×](\d+\.?\d*)', layer_up)
    if m and not info.get('type'):
        info['cores'] = int(m.group(1))
        info['cross_section'] = float(m.group(2))
        info['type'] = 'cable'

    # Cable type keywords
    for cable_type in ['NYY', 'CYKY', 'YKY', 'NAYY', 'NYM', 'H07V']:
        if cable_type in layer_up:
            info['cable_type'] = cable_type
            if 'type' not in info:
                info['type'] = 'cable'
            break

    # Tray keywords
    for tray_kw in ['TRAY', 'TALCA', 'TÁLCA', 'CABLE_TRAY']:
        if tray_kw in layer_up:
            if 'type' not in info:
                info['type'] = 'tray'
            break

    return info if info else None


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
