"""
api/stripe-webhook.py
Stripe webhook kezelő — subscription életciklus → Supabase profiles.plan frissítés.

Stripe Dashboard → Webhooks → Endpoint URL:
  https://raj-nlat-dwg.vercel.app/api/stripe-webhook

Figyelendő events:
  - checkout.session.completed       → trial_active beállítás
  - customer.subscription.updated    → active / past_due / canceled
  - customer.subscription.deleted    → inactive
  - invoice.payment_failed           → past_due
"""

from http.server import BaseHTTPRequestHandler
import json, os, hashlib, hmac, urllib.request, time

STRIPE_WEBHOOK_SECRET  = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
SUPABASE_URL           = os.environ.get('VITE_SUPABASE_URL', 'https://pprlbtsqfyrbfhbqjpai.supabase.co')
SUPABASE_SERVICE_KEY   = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')


def verify_stripe_signature(payload, sig_header, secret):
    """Stripe webhook signature ellenőrzés (stripe-python nélkül)."""
    parts = {p.split('=')[0]: p.split('=')[1] for p in sig_header.split(',') if '=' in p}
    ts    = parts.get('t', '')
    v1    = parts.get('v1', '')
    signed_payload = f"{ts}.{payload}"
    expected = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


def supabase_update_plan(user_id, plan_status, stripe_customer_id=None, subscription_id=None, current_period_end=None):
    """Supabase profiles tábla frissítés service_role kulccsal."""
    patch = {'plan': plan_status}
    if stripe_customer_id: patch['stripe_customer_id'] = stripe_customer_id
    if subscription_id:    patch['stripe_subscription_id'] = subscription_id
    if current_period_end: patch['subscription_end'] = current_period_end

    payload = json.dumps(patch).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user_id}',
        data=payload,
        method='PATCH',
        headers={
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        }
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status


def supabase_find_user_by_email(email):
    """Email alapján user_id keresés."""
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/profiles?email=eq.{email}&select=id',
        headers={
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        }
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
    return data[0]['id'] if data else None


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def do_POST(self):
        length  = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(length).decode('utf-8')
        sig     = self.headers.get('Stripe-Signature', '')

        # Aláírás ellenőrzés
        if STRIPE_WEBHOOK_SECRET and sig:
            if not verify_stripe_signature(payload, sig, STRIPE_WEBHOOK_SECRET):
                return self._respond(400, {'error': 'Invalid signature'})

        try:
            event = json.loads(payload)
        except Exception:
            return self._respond(400, {'error': 'Invalid JSON'})

        event_type = event.get('type', '')
        data_obj   = event.get('data', {}).get('object', {})

        try:
            if event_type == 'checkout.session.completed':
                # Checkout kész → trial_active
                user_id     = data_obj.get('client_reference_id') or data_obj.get('metadata', {}).get('user_id')
                customer_id = data_obj.get('customer')
                sub_id      = data_obj.get('subscription')
                email       = data_obj.get('customer_email', '')

                if not user_id and email:
                    user_id = supabase_find_user_by_email(email)

                if user_id:
                    supabase_update_plan(user_id, 'trial_active', customer_id, sub_id)

            elif event_type == 'customer.subscription.updated':
                sub_status  = data_obj.get('status')          # active / trialing / past_due / canceled
                customer_id = data_obj.get('customer')
                sub_id      = data_obj.get('id')
                period_end  = data_obj.get('current_period_end')

                # Status → plan mapping
                plan_map = {
                    'active':   'active',
                    'trialing': 'trial_active',
                    'past_due': 'past_due',
                    'canceled': 'inactive',
                    'unpaid':   'past_due',
                }
                plan_status = plan_map.get(sub_status, 'inactive')

                # user_id keresés customer_id alapján
                req = urllib.request.Request(
                    f'{SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.{customer_id}&select=id',
                    headers={
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                    }
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    rows = json.loads(r.read())

                if rows:
                    supabase_update_plan(rows[0]['id'], plan_status, subscription_id=sub_id,
                                         current_period_end=period_end)

            elif event_type == 'customer.subscription.deleted':
                customer_id = data_obj.get('customer')
                req = urllib.request.Request(
                    f'{SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.{customer_id}&select=id',
                    headers={
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                    }
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    rows = json.loads(r.read())
                if rows:
                    supabase_update_plan(rows[0]['id'], 'inactive')

            elif event_type == 'invoice.payment_failed':
                customer_id = data_obj.get('customer')
                req = urllib.request.Request(
                    f'{SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.{customer_id}&select=id',
                    headers={
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                    }
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    rows = json.loads(r.read())
                if rows:
                    supabase_update_plan(rows[0]['id'], 'past_due')

        except Exception as e:
            # Ne dobjunk 5xx-et Stripe felé — event újraküldést okozna
            print(f"Webhook processing error: {e}")

        self._respond(200, {'received': True})

    def _respond(self, code, body):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
