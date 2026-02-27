from http.server import BaseHTTPRequestHandler
import json, traceback, os, urllib.request, urllib.error

# n8n webhook URL – set as Vercel env var N8N_CABLE_WEBHOOK_URL
N8N_WEBHOOK_URL = os.environ.get('N8N_CABLE_WEBHOOK_URL', '')

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

            if not N8N_WEBHOOK_URL:
                # Return helpful error if env var not set
                self._respond(503, {
                    'success': False,
                    'error': 'N8N_CABLE_WEBHOOK_URL nincs beállítva a Vercel environment variables-ban.',
                    'setup_required': True,
                })
                return

            # Forward to n8n webhook (synchronous – n8n responds via "Respond to Webhook" node)
            req_data = json.dumps(payload).encode()
            req = urllib.request.Request(
                N8N_WEBHOOK_URL,
                data=req_data,
                headers={
                    'Content-Type': 'application/json',
                    'Content-Length': str(len(req_data)),
                },
                method='POST',
            )

            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    result = json.loads(resp.read())
                self._respond(200, result)
            except urllib.error.HTTPError as e:
                err_body = e.read().decode('utf-8', errors='replace')
                self._respond(502, {
                    'success': False,
                    'error': f'n8n hiba ({e.code}): {err_body[:500]}',
                })
            except urllib.error.URLError as e:
                self._respond(502, {
                    'success': False,
                    'error': f'n8n nem elérhető: {str(e.reason)}',
                })

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
