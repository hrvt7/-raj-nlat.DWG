from http.server import BaseHTTPRequestHandler
import json
import base64
import traceback
import os
import io


def parse_pdf_bytes(file_bytes):
    """
    Parse a PDF file and return a DXF-compatible structure using
    PyMuPDF for rendering and OpenCV for template-based symbol counting.
    """
    try:
        import fitz  # PyMuPDF
        import cv2
        import numpy as np

        # Open PDF from bytes
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise RuntimeError(f"PDF megnyitási hiba: {e}")

        page_images = []

        # Render each page to a grayscale image for template matching
        for page in doc:
            # Render page to pixmap at reasonable DPI for symbol detection
            pix = page.get_pixmap(dpi=200)
            samples = pix.samples
            h, w = pix.height, pix.width
            n = pix.n  # number of channels

            img = np.frombuffer(samples, dtype=np.uint8).reshape((h, w, n))

            # Normalize to BGR then grayscale for OpenCV
            if n == 4:
                bgr = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
            elif n == 3:
                bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            else:
                # Single channel – ensure we still have a 2D grayscale image
                gray = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
                page_images.append(gray)
                continue

            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            page_images.append(gray)

        # Load symbol templates from templates/pdf-symbols/*.png
        templates_dir = os.path.join(os.path.dirname(__file__), "templates", "pdf-symbols")
        templates = {}
        if os.path.isdir(templates_dir):
            for name in os.listdir(templates_dir):
                if not name.lower().endswith(".png"):
                    continue
                symbol_name = os.path.splitext(name)[0]
                path = os.path.join(templates_dir, name)
                tmpl = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
                if tmpl is None:
                    continue
                templates[symbol_name] = tmpl

        # If there are no templates or no pages, just return an empty but compatible structure
        from collections import Counter

        counts = Counter()
        if templates and page_images:
            method = cv2.TM_CCOEFF_NORMED
            threshold = 0.8

            for symbol_name, tmpl in templates.items():
                th, tw = tmpl.shape[:2]
                for img in page_images:
                    if img.shape[0] < th or img.shape[1] < tw:
                        continue
                    res = cv2.matchTemplate(img, tmpl, method)
                    loc = (res >= threshold)
                    # Count all positions above threshold
                    num_hits = int(loc.sum())
                    if num_hits > 0:
                        counts[symbol_name] += num_hits

        blocks = [
            {"name": name, "layer": "PDF", "count": int(count)}
            for name, count in counts.items()
            if count > 0
        ]

        # For now, we don't compute actual lengths from PDFs.
        # Provide a single zero-length entry to keep the structure consistent.
        lengths = [
            {
                "layer": "PDF",
                "length": 0.0,
                "length_raw": 0.0,
                "info": None,
            }
        ]

        layers = ["PDF"]
        units = {
            "insunits": 0,
            "name": "PDF (no scale)",
            "factor": None,
            "auto_detected": False,
        }

        summary = {
            "total_block_types": len(blocks),
            "total_blocks": sum(b["count"] for b in blocks),
            "total_layers": len(layers),
            "layers_with_lines": 1 if any(l["length"] for l in lengths) else 0,
        }

        return {
            "success": True,
            "blocks": blocks,
            "lengths": lengths,
            "layers": layers,
            "units": units,
            "title_block": {},
            "summary": summary,
        }

    except Exception as e:
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            content_type = self.headers.get("Content-Type", "")

            pdf_bytes = None

            # Primary path: JSON with base64-encoded PDF
            if "application/json" in content_type:
                try:
                    payload = json.loads(body or b"{}")
                except Exception:
                    payload = {}
                b64 = payload.get("pdf_base64") or payload.get("data") or ""
                if not b64:
                    raise ValueError("Hiányzó 'pdf_base64' vagy 'data' mező a JSON-ben.")
                pdf_bytes = base64.b64decode(b64)

            # Optional: multipart/form-data upload with a 'file' field
            elif "multipart/form-data" in content_type:
                import cgi

                env = {
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": content_type,
                    "CONTENT_LENGTH": str(length),
                }
                fp = io.BytesIO(body)
                form = cgi.FieldStorage(fp=fp, environ=env, keep_blank_values=True)
                file_field = form["file"] if "file" in form else None
                if not file_field or not getattr(file_field, "file", None):
                    raise ValueError("Nem található 'file' mező a multipart/form-data kérésben.")
                pdf_bytes = file_field.file.read()

            # Fallback: treat body as raw base64 or raw bytes
            else:
                try:
                    pdf_bytes = base64.b64decode(body)
                except Exception:
                    pdf_bytes = body

            if not pdf_bytes:
                raise ValueError("Üres PDF tartalom.")

            result = parse_pdf_bytes(pdf_bytes)
            self._respond(200, result)
        except Exception as e:
            self._respond(
                500,
                {
                    "success": False,
                    "error": str(e),
                    "trace": traceback.format_exc(),
                },
            )

    def _respond(self, code, data):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, *args):  # silence default logging
        pass

