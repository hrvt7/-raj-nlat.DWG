import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
"""
api/notify-quote-accepted.py
Értesítési endpoint — kliens elfogadta az ajánlatot → email a vállalkozónak.

Hívás módja (client-side, elfogadás után):
  POST /api/notify-quote-accepted
  Body: { "token": "<64-hex-token>" }

Szükséges Vercel environment variables:
  SUPABASE_URL / VITE_SUPABASE_URL  — Supabase projekt URL
  SUPABASE_SERVICE_ROLE_KEY          — service role kulcs (quote_shares olvasáshoz)
  RESEND_API_KEY                     — Resend.com API kulcs (email küldéshez)
  NOTIFY_FROM_EMAIL                  — Feladó email (pl. no-reply@rajnlat.hu)
"""

from http.server import BaseHTTPRequestHandler
import json, os, re, urllib.request
from security_helpers import send_cors_headers, check_origin, check_rate_limit, rate_limit_response

SUPABASE_URL         = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
RESEND_API_KEY       = os.environ.get('RESEND_API_KEY', '')
NOTIFY_FROM_EMAIL    = os.environ.get('NOTIFY_FROM_EMAIL', 'no-reply@takeoffpro.app')

TOKEN_RE = re.compile(r'^[a-f0-9]{64}$')


def supabase_get(path):
    """Supabase REST GET with service role key."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers={
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Accept':        'application/json',
    })
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def send_resend_email(to, subject, html):
    """Resend.com API-n keresztül küld emailt."""
    payload = json.dumps({
        'from':    NOTIFY_FROM_EMAIL,
        'to':      [to],
        'subject': subject,
        'html':    html,
    }).encode()
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=payload,
        headers={
            'Authorization': f'Bearer {RESEND_API_KEY}',
            'Content-Type':  'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def build_email_html(quote_data, company_data, accepted_by_name, accepted_at):
    """Generates a simple but professional HTML email body."""
    project = quote_data.get('projectName') or quote_data.get('project_name') or 'Ismeretlen projekt'
    gross   = quote_data.get('gross', 0)
    vat_pct = quote_data.get('vatPercent', 27)
    brutto  = int(gross * (1 + vat_pct / 100))

    def fmt(n):
        return f"{int(n):,}".replace(',', '\u00a0') + ' Ft'

    company_name = (company_data or {}).get('name', 'TakeoffPro')
    accepted_ts  = accepted_at or ''
    if accepted_ts and 'T' in accepted_ts:
        accepted_ts = accepted_ts.replace('T', ' ').split('.')[0]

    return f"""
<!DOCTYPE html>
<html lang="hu">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:Inter,Arial,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
    <!-- Header -->
    <div style="background:#059669;padding:24px 28px">
      <div style="color:#fff;font-size:22px;font-weight:800">✓ Ajánlat elfogadva</div>
      <div style="color:#D1FAE5;font-size:13px;margin-top:4px">{company_name}</div>
    </div>
    <!-- Body -->
    <div style="padding:28px">
      <p style="margin:0 0 16px;font-size:15px;color:#111827">
        <strong>{accepted_by_name}</strong> elfogadta az árajánlatot:
      </p>
      <!-- Quote card -->
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:18px 20px;margin-bottom:20px">
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px">{project}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr>
            <td style="color:#6B7280;padding:4px 0">Nettó összeg</td>
            <td style="text-align:right;color:#111827;font-weight:600">{fmt(gross)}</td>
          </tr>
          <tr>
            <td style="color:#6B7280;padding:4px 0">ÁFA ({vat_pct}%)</td>
            <td style="text-align:right;color:#6B7280">{fmt(gross * vat_pct / 100)}</td>
          </tr>
          <tr style="border-top:1px solid #E5E7EB">
            <td style="color:#111827;font-weight:700;padding:8px 0 4px">Bruttó végösszeg</td>
            <td style="text-align:right;color:#059669;font-weight:800;font-size:16px">{fmt(brutto)}</td>
          </tr>
        </table>
      </div>
      <p style="margin:0;font-size:12px;color:#9CA3AF">
        Elfogadás időpontja: {accepted_ts}<br>
        Elfogadó neve: {accepted_by_name}
      </p>
    </div>
    <!-- Footer -->
    <div style="border-top:1px solid #E5E7EB;padding:14px 28px;text-align:center;font-size:11px;color:#9CA3AF">
      TakeoffPro — Elektromos felmérés és árajánlat-készítő
    </div>
  </div>
</body>
</html>
""".strip()


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        send_cors_headers(self)
        self.end_headers()

    def do_POST(self):
        if not check_origin(self): return
        if not check_rate_limit(self, limit=10): return rate_limit_response(self)
        # ── Parse body ────────────────────────────────────────────────────────
        length = int(self.headers.get('Content-Length', 0))
        body   = json.loads(self.rfile.read(length) or b'{}') if length else {}
        token  = (body.get('token') or '').strip()

        def respond(status, payload):
            data = json.dumps(payload).encode()
            self.send_response(status)
            send_cors_headers(self)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(data))
            self.end_headers()
            self.wfile.write(data)

        # ── Validate token ────────────────────────────────────────────────────
        if not TOKEN_RE.match(token):
            return respond(400, {'error': 'Érvénytelen token.'})

        # ── Config check ──────────────────────────────────────────────────────
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            return respond(503, {'error': 'Supabase nincs konfigurálva.'})
        if not RESEND_API_KEY:
            # Soft-skip: notify is optional; don't block the acceptance flow
            return respond(200, {'skipped': True, 'reason': 'RESEND_API_KEY nincs beállítva.'})

        # ── Load quote share ──────────────────────────────────────────────────
        try:
            rows = supabase_get(
                f"quote_shares?token=eq.{token}"
                f"&select=quote_data,company_data,status,accepted_by_name,accepted_at,user_id"
            )
        except Exception as e:
            return respond(502, {'error': f'Supabase hiba: {str(e)}'})

        if not rows:
            return respond(404, {'error': 'Ajánlat megosztás nem található.'})

        share = rows[0]

        if share.get('status') != 'accepted':
            return respond(200, {'skipped': True, 'reason': 'Ajánlat még nem fogadták el.'})

        # ── Determine contractor email ────────────────────────────────────────
        company_data   = share.get('company_data') or {}
        contractor_email = company_data.get('email', '').strip()

        if not contractor_email:
            # Try profiles table
            user_id = share.get('user_id', '')
            if user_id:
                try:
                    profiles = supabase_get(f"profiles?id=eq.{user_id}&select=email")
                    if profiles:
                        contractor_email = (profiles[0].get('email') or '').strip()
                except Exception:
                    pass

        if not contractor_email:
            return respond(200, {'skipped': True, 'reason': 'Vállalkozó email-je ismeretlen.'})

        # ── Send email ────────────────────────────────────────────────────────
        quote_data      = share.get('quote_data') or {}
        accepted_name   = share.get('accepted_by_name') or 'Ismeretlen ügyfél'
        accepted_at     = share.get('accepted_at') or ''
        project_name    = quote_data.get('projectName') or quote_data.get('project_name') or 'Árajánlat'

        subject = f"✓ Elfogadva: {project_name} — {accepted_name}"
        html    = build_email_html(quote_data, company_data, accepted_name, accepted_at)

        try:
            result = send_resend_email(contractor_email, subject, html)
            return respond(200, {'sent': True, 'id': result.get('id')})
        except Exception as e:
            # Log but don't fail — the acceptance itself already succeeded
            return respond(200, {'sent': False, 'error': str(e)})
