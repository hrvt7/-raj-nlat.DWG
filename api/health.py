import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from http.server import BaseHTTPRequestHandler
import json

# Test _security import
try:
     from security_helpers import check_origin
    sec_ok = True
    sec_err = None
except Exception as e:
    sec_ok = False
    sec_err = str(e)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'status': 'ok',
            'python': True,
            'security_import': sec_ok,
            'security_error': sec_err,
        }).encode())
    def log_message(self, *a): pass
