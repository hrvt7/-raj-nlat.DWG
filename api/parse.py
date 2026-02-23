from http.server import BaseHTTPRequestHandler
import json, tempfile, os, base64, traceback


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

            block_counts = Counter()
            lengths_by_layer = defaultdict(float)
            all_layers = set()

            for e in msp:
                t = e.dxftype()
                try:
                    layer = e.dxf.layer
                except:
                    layer = 'DEFAULT'
                all_layers.add(layer)

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
            lengths = [
                {"layer": l, "length": round(v, 4)}
                for l, v in sorted(lengths_by_layer.items(), key=lambda x: -x[1])
                if v > 0.01
            ]

            return {
                "success": True,
                "blocks": blocks,
                "lengths": lengths,
                "layers": sorted(list(all_layers)),
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
