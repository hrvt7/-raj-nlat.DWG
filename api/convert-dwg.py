from http.server import BaseHTTPRequestHandler
import json, base64, traceback, os, tempfile, subprocess

# CloudConvert API key - set as Vercel environment variable CLOUDCONVERT_API_KEY
CLOUDCONVERT_API_KEY = os.environ.get('CLOUDCONVERT_API_KEY', '')


def convert_dwg_to_dxf_cloudconvert(file_bytes, filename):
    """Convert DWG to DXF using CloudConvert API."""
    import urllib.request
    import urllib.error

    if not CLOUDCONVERT_API_KEY:
        raise Exception("CLOUDCONVERT_API_KEY environment variable nincs beállítva. Kérjük állítsd be a Vercel project settings-ben.")

    # Step 1: Create a job
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

    req = urllib.request.Request(
        'https://api.cloudconvert.com/v2/jobs',
        data=job_payload,
        headers={
            'Authorization': f'Bearer {CLOUDCONVERT_API_KEY}',
            'Content-Type': 'application/json'
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        job = json.loads(r.read())

    # Find upload task
    upload_task = next(t for t in job['data']['tasks'] if t['name'] == 'upload-file')
    upload_url = upload_task['result']['form']['url']
    upload_params = upload_task['result']['form']['parameters']

    # Step 2: Upload the file using multipart form
    import io
    boundary = b'----CloudConvertBoundary'

    body = b''
    for key, val in upload_params.items():
        body += b'--' + boundary + b'\r\n'
        body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
        body += val.encode() + b'\r\n'

    body += b'--' + boundary + b'\r\n'
    body += f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    body += b'Content-Type: application/octet-stream\r\n\r\n'
    body += file_bytes + b'\r\n'
    body += b'--' + boundary + b'--\r\n'

    upload_req = urllib.request.Request(
        upload_url,
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary.decode()}'}
    )
    with urllib.request.urlopen(upload_req, timeout=60) as r:
        pass  # Just needs to succeed

    # Step 3: Wait for job to complete (poll)
    import time
    job_id = job['data']['id']
    for _ in range(30):  # max 30s
        time.sleep(1)
        req = urllib.request.Request(
            f'https://api.cloudconvert.com/v2/jobs/{job_id}',
            headers={'Authorization': f'Bearer {CLOUDCONVERT_API_KEY}'}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            status = json.loads(r.read())
        job_status = status['data']['status']
        if job_status == 'finished':
            break
        elif job_status == 'error':
            raise Exception(f"CloudConvert konverzió hiba: {status['data'].get('message', 'ismeretlen')}")

    # Step 4: Get download URL
    export_task = next(t for t in status['data']['tasks'] if t['name'] == 'export-file')
    download_url = export_task['result']['files'][0]['url']

    # Step 5: Download the DXF
    with urllib.request.urlopen(download_url, timeout=30) as r:
        dxf_bytes = r.read()

    return dxf_bytes


def convert_dwg_fallback(file_bytes, filename):
    """
    Fallback: try ezdxf recovery mode which can sometimes read DWG-like files.
    This won't work for true DWG but is a graceful fallback.
    """
    raise Exception(
        "DWG konverzió: Kérjük állítsd be a CLOUDCONVERT_API_KEY környezeti változót a Vercel dashboard-ban "
        "(Settings → Environment Variables). Ingyenes: 25 konverzió/nap. "
        "Alternatíva: konvertáld a DWG-t DXF-re az ODA File Converter segítségével (ingyenes): "
        "https://www.opendesign.com/guestfiles/oda_file_converter"
    )


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
            filename = payload.get('filename', 'file.dwg')
            file_bytes = base64.b64decode(payload.get('data', ''))

            if CLOUDCONVERT_API_KEY:
                dxf_bytes = convert_dwg_to_dxf_cloudconvert(file_bytes, filename)
            else:
                dxf_bytes = convert_dwg_fallback(file_bytes, filename)

            dxf_b64 = base64.b64encode(dxf_bytes).decode()
            dxf_filename = filename.replace('.dwg', '.dxf').replace('.DWG', '.dxf')

            self._respond(200, {
                'success': True,
                'data': dxf_b64,
                'filename': dxf_filename
            })
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
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *a): pass
