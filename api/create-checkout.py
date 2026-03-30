"""
api/create-checkout.py
Stripe Checkout session létrehozás — havi vagy éves előfizetés.

POST /api/create-checkout
Body: { "plan": "monthly" | "annual", "user_id": "<uuid>", "email": "<email>" }
Returns: { "url": "<stripe-checkout-url>" }
"""

from http.server import BaseHTTPRequestHandler
import json, os, sys, urllib.request, urllib.error, urllib.parse
from _security import (
    send_cors_headers, check_body_size, check_origin, check_rate_limit,
    check_required_env, require_auth, safe_error_response, rate_limit_response
)

STRIPE_SECRET_KEY      = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_PRICE_MONTHLY   = os.environ.get('STRIPE_PRICE_MONTHLY', '')   # pl. price_xxxxx
STRIPE_PRICE_ANNUAL    = os.environ.get('STRIPE_PRICE_ANNUAL', '')    # pl. price_yyyyy
APP_URL                = os.environ.get('VITE_APP_URL', 'https://raj-nlat-dwg.vercel.app')


def stripe_request(path, data):
    """Minimal Stripe API helper — urllib alapú, nincs dependency."""
    encoded = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        f'https://api.stripe.com/v1/{path}',
        data=encoded,
        headers={
            'Authorization': f'Bearer {STRIPE_SECRET_KEY}',
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def do_OPTIONS(self):
        self.send_response(200)
        send_cors_headers(self)
        self.end_headers()

    def do_POST(self):
        if not check_origin(self): return
        if not check_rate_limit(self, limit=10): return rate_limit_response(self)
        if not check_body_size(self, max_bytes=64 * 1024): return
        if not require_auth(self): return
        if not check_required_env(self, 'STRIPE_SECRET_KEY'): return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        except Exception:
            body = {}

        plan     = body.get('plan', 'monthly')
        if plan not in ('monthly', 'annual'):
            return self._error(400, 'Invalid plan: must be "monthly" or "annual"')
        user_id  = body.get('user_id', '')
        email    = body.get('email', '')
        if email and '@' not in email:
            return self._error(400, 'Invalid email address')

        if not STRIPE_SECRET_KEY:
            return self._error(503, 'Service temporarily unavailable')

        price_id = STRIPE_PRICE_ANNUAL if plan == 'annual' else STRIPE_PRICE_MONTHLY
        if not price_id:
            return self._error(500, f'STRIPE_PRICE_{plan.upper()} nincs beállítva')

        try:
            session = stripe_request('checkout/sessions', {
                'mode': 'subscription',
                'line_items[0][price]': price_id,
                'line_items[0][quantity]': '1',
                'subscription_data[trial_period_days]': '14',
                'customer_email': email,
                'client_reference_id': user_id,
                'success_url': f'{APP_URL}/success?session_id={{CHECKOUT_SESSION_ID}}',
                'cancel_url': f'{APP_URL}/?canceled=1',
                'locale': 'hu',
                'payment_method_types[]': 'card',
                'metadata[user_id]': user_id,
                'metadata[plan]': plan,
            })
        except urllib.error.HTTPError as e:
            err = json.loads(e.read())
            return self._error(400, err.get('error', {}).get('message', 'Stripe hiba'))
        except Exception as e:
            safe_error_response(self, 500, 'Checkout creation failed', exc=e)
            return

        self.send_response(200)
        send_cors_headers(self)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'url': session['url']}).encode())

    def _error(self, code, msg):
        self.send_response(code)
        send_cors_headers(self)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'error': msg}).encode())
