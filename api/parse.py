from http.server import BaseHTTPRequestHandler
import json
import tempfile
import os

def parse_dxf(file_bytes):
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
            polyline_length_by_layer = defaultdict(float)
            all_layers = set()
            
            for e in msp:
                t = e.dxftype()
                layer = e.dxf.layer if hasattr(e.dxf, 'layer') else 'DEFAULT'
                all_layers.add(layer)
                
                if t == "INSERT":
                    name = e.dxf.name if hasattr(e.dxf, 'name') else 'UNKNOWN'
                    block_counts[(name, layer)] += 1
                
                if t in ("LWPOLYLINE", "POLYLINE"):
                    try:
                        length = e.length()
                    except:
                        length = 0.0
                    polyline_length_by_layer[layer] += float(length)
                
                if t == "LINE":
                    try:
                        start = e.dxf.start
                        end = e.dxf.end
                        length = ((end.x-start.x)**2 + (end.y-start.y)**2) ** 0.5
                        polyline_length_by_layer[layer] += float(length)
                    except:
                        pass
            
            blocks = [
                {"name": name, "layer": layer, "count": count}
                for (name, layer), count in block_counts.most_common(200)
            ]
            
            lengths = [
                {"layer": layer, "length": round(length, 3)}
                for layer, length in sorted(polyline_length_by_layer.items(), key=lambda x: -x[1])
                if length > 0
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
            os.unlink(tmp_path)
            
    except Exception as e:
        return {"success": False, "error": str(e)}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            content_type = self.headers.get('Content-Type', '')
            
            # CORS headers
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            body = self.rfile.read(content_length)
            
            # Parse multipart form data to get file bytes
            if 'multipart/form-data' in content_type:
                boundary = content_type.split('boundary=')[1].encode()
                parts = body.split(b'--' + boundary)
                file_bytes = None
                for part in parts:
                    if b'filename=' in part:
                        # Extract file content after double CRLF
                        file_content = part.split(b'\r\n\r\n', 1)
                        if len(file_content) > 1:
                            file_bytes = file_content[1].rstrip(b'\r\n')
                            break
                
                if file_bytes:
                    result = parse_dxf(file_bytes)
                else:
                    result = {"success": False, "error": "No file found in request"}
            else:
                result = {"success": False, "error": "Expected multipart/form-data"}
            
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        pass
