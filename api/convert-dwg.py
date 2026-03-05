from http.server import BaseHTTPRequestHandler
import json, traceback, os
from urllib.request import urlopen, Request

# CloudConvert API key — set as Vercel env var CLOUDCONVERT_API_KEY
CLOUDCONVERT_API_KEY = os.environ.get('CLOUDCONVERT_API_KEY', '')
ALLOWED_ORIGIN      = os.environ.get('ALLOWED_ORIGIN', '*')


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
    with urlopen(req, timeout=30) as r:
        job = json.loads(r.read())

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
        self._cors()
        self.end_headers()

    def do_POST(self):
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
        self.wfile.write(json.dumps(data).encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *a): pass
