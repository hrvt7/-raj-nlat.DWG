from http.server import BaseHTTPRequestHandler
import json, traceback, os, sys
from urllib.request import urlopen, Request
import urllib.error

# Import shared security helpers — with fallback for Vercel bundling edge cases
try:
    from shared import send_cors_headers, check_origin, check_rate_limit, check_required_env, safe_error_response, rate_limit_response
except ImportError:
    # Inline fallback if _security.py not available in function bundle
    def send_cors_headers(handler, origin=None):
        handler.send_header('Access-Control-Allow-Origin', os.environ.get('ALLOWED_ORIGINS', '*').split(',')[0].strip() if not origin else origin)
        handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
    def check_origin(handler): return True
    def check_rate_limit(handler, limit=30): return True
    def check_required_env(handler, *env_vars):
        missing = [v for v in env_vars if not os.environ.get(v)]
        if missing:
            handler.send_response(503)
            handler.send_header('Content-Type', 'application/json')
            handler.end_headers()
            handler.wfile.write(json.dumps({'success': False, 'error': 'Service temporarily unavailable'}).encode())
            return False
        return True
    def safe_error_response(handler, code, msg, exc=None):
        if exc: print(f"[API ERROR] {msg}: {traceback.format_exc()}", file=sys.stderr)
        handler.send_response(code)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(json.dumps({'success': False, 'error': msg}).encode())
    def rate_limit_response(handler):
        handler.send_response(429)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(json.dumps({'success': False, 'error': 'Too many requests'}).encode())

CLOUDCONVERT_API_KEY = os.environ.get('CLOUDCONVERT_API_KEY', '')


def create_job(filename):
    """
    Step 1 of 3: Create a CloudConvert job and return the pre-signed upload URL.
    The file is NOT sent here — the browser uploads directly to CloudConvert S3.
    This keeps the Vercel function body tiny and well within timeout.
    """
    if not CLOUDCONVERT_API_KEY:
        raise Exception(
            "CLOUDCONVERT_API_KEY nincs beállítva a Vercel Environment Variables-ban. "
            "Vercel Dashboard → Settings → Environment Variables → CLOUDCONVERT_API_KEY. "
            "Ingyenes tier: 25 konverzió/nap (https://cloudconvert.com)."
        )

    job_payload = json.dumps({
        "tasks": {
            "upload-file": {
                "operation": "import/upload"
            },
            "convert-file": {
                "operation": "convert",
                "input": "upload-file",
                "input_format": "dwg",
                "output_format": "dxf"
            },
            "export-file": {
                "operation": "export/url",
                "input": "convert-file"
            }
        }
    }).encode()

    req = Request(
        'https://api.cloudconvert.com/v2/jobs',
        data=job_payload,
        headers={
            'Authorization': f'Bearer {CLOUDCONVERT_API_KEY}',
            'Content-Type': 'application/json',
        }
    )
    try:
        with urlopen(req, timeout=30) as r:
            job = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')[:200]
        if e.code == 401:
            raise Exception('CloudConvert API kulcs érvénytelen vagy lejárt. Ellenőrizd a Vercel env vars-ban.')
        elif e.code == 402:
            raise Exception('CloudConvert kvóta elfogyott. Ellenőrizd a fiókod: https://cloudconvert.com/dashboard')
        elif e.code == 429:
            raise Exception('CloudConvert rate limit — túl sok kérés. Próbáld újra 1 perc múlva.')
        else:
            raise Exception(f'CloudConvert API hiba ({e.code}): {body}')
    except Exception as e:
        if 'not valid JSON' in str(e) or 'Unexpected token' in str(e):
            raise Exception('CloudConvert API nem elérhető vagy hibás választ adott. Próbáld újra később.')
        raise

    upload_task = next(
        (t for t in job['data']['tasks'] if t['name'] == 'upload-file'),
        None
    )
    if not upload_task:
        raise Exception("CloudConvert: az upload task nem jött létre.")

    form = upload_task['result']['form']
    return {
        'jobId':        job['data']['id'],
        'uploadUrl':    form['url'],
        'uploadParams': form['parameters'],
    }


def poll_job(job_id):
    """
    Step 3 of 3: Poll CloudConvert job status.
    Returns { status, downloadUrl? } — the browser downloads DXF directly from CloudConvert CDN.
    """
    if not CLOUDCONVERT_API_KEY:
        raise Exception("CLOUDCONVERT_API_KEY nincs beállítva.")

    req = Request(
        f'https://api.cloudconvert.com/v2/jobs/{job_id}',
        headers={'Authorization': f'Bearer {CLOUDCONVERT_API_KEY}'}
    )
    with urlopen(req, timeout=15) as r:
        status = json.loads(r.read())

    job_status = status['data']['status']

    if job_status == 'finished':
        export_task = next(
            (t for t in status['data']['tasks'] if t['name'] == 'export-file'),
            None
        )
        if not export_task or not export_task.get('result', {}).get('files'):
            raise Exception("CloudConvert: az export task nem tartalmazott letölthető fájlt.")
        download_url = export_task['result']['files'][0]['url']
        return {'status': 'finished', 'downloadUrl': download_url}

    if job_status == 'error':
        err_tasks = [t for t in status['data']['tasks'] if t.get('status') == 'error']
        err_msg = err_tasks[0].get('message', 'ismeretlen hiba') if err_tasks else status['data'].get('message', 'ismeretlen hiba')
        return {'status': 'error', 'error': f'CloudConvert konverzió sikertelen: {err_msg}'}

    # Still processing / waiting
    return {'status': job_status}


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        send_cors_headers(self)
        self.end_headers()

    def do_POST(self):
        if not check_origin(self): return
        if not check_rate_limit(self): return rate_limit_response(self)
        if not check_required_env(self, 'CLOUDCONVERT_API_KEY'): return
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            payload = json.loads(body)

            if 'jobId' in payload:
                # Poll mode — Step 3
                result = poll_job(payload['jobId'])
                self._respond(200, {'success': True, **result})

            elif 'filename' in payload:
                # Create mode — Step 1
                result = create_job(payload['filename'])
                self._respond(200, {'success': True, **result})

            else:
                raise Exception("Érvénytelen kérés: 'filename' (create) vagy 'jobId' (poll) megadása kötelező.")

        except Exception as e:
            safe_error_response(self, 500, 'DWG konverzió sikertelen', exc=e)

    def _respond(self, code, data):
        self.send_response(code)
        send_cors_headers(self)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, *a): pass
