"""
Shared security utilities for TakeoffPro API endpoints.

Layers:
1. Origin validation (fail-closed in production, blocks cross-origin browser abuse)
2. Supabase JWT verification (real auth — blocks unauthenticated access to costly endpoints)
3. Rate limiting (per-IP abuse guard)
4. Request size limits
5. Required env checks (fail-closed)
6. Safe error responses (no stack traces)
"""

import os
import sys
import json
import time
import traceback

# ── Environment detection ────────────────────────────────────────────────────
_VERCEL_ENV = os.environ.get('VERCEL_ENV', '')
_NODE_ENV = os.environ.get('NODE_ENV', '')
IS_PRODUCTION = _VERCEL_ENV == 'production' or _NODE_ENV == 'production'
# Any Vercel deploy (production OR preview) is a remote environment.
# Dev-only fallbacks are ONLY allowed when running locally (no VERCEL_ENV set).
IS_LOCAL_DEV = not _VERCEL_ENV and _NODE_ENV != 'production'

# ── CORS origin configuration ────────────────────────────────────────────────
_ALLOWED_ORIGINS_RAW = os.environ.get(
    'ALLOWED_ORIGINS',
    'https://raj-nlat-dwg.vercel.app,https://takeoffpro.hu,https://www.takeoffpro.hu'
)
ALLOWED_ORIGINS = [o.strip() for o in _ALLOWED_ORIGINS_RAW.split(',') if o.strip()]

# ── Supabase Auth API config ──────────────────────────────────────────────────
# We validate tokens by calling Supabase Auth API (GET /auth/v1/user) with the
# user's access_token. This is signing-key-agnostic — works with both legacy
# HS256 shared secrets and new asymmetric JWKS signing keys.
# Requires: SUPABASE_URL (project URL, e.g. https://xxx.supabase.co)
# Strip whitespace/newlines — Vercel env var paste can introduce trailing chars
SUPABASE_URL = (os.environ.get('SUPABASE_URL', '') or os.environ.get('VITE_SUPABASE_URL', '')).strip().rstrip('/')
SUPABASE_ANON_KEY = (os.environ.get('SUPABASE_ANON_KEY', '') or os.environ.get('VITE_SUPABASE_ANON_KEY', '')).strip()

# Default max request body size: 5 MB
DEFAULT_MAX_BODY = 5 * 1024 * 1024

# ── Simple in-memory rate limiter ────────────────────────────────────────────
_RATE_WINDOW = 60
_RATE_LIMIT = 30
_rate_store = {}


def _get_client_ip(handler):
    forwarded = handler.headers.get('x-forwarded-for', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return handler.client_address[0] if handler.client_address else 'unknown'


def check_rate_limit(handler, limit=_RATE_LIMIT):
    ip = _get_client_ip(handler)
    now = time.time()
    window_start, count = _rate_store.get(ip, (now, 0))
    if now - window_start > _RATE_WINDOW:
        _rate_store[ip] = (now, 1)
        return True
    if count >= limit:
        return False
    _rate_store[ip] = (window_start, count + 1)
    return True


# ── Origin validation ────────────────────────────────────────────────────────

def _is_allowed_origin(origin):
    if not origin:
        # No Origin header: same-origin or non-browser.
        # Only allow in local dev. Block on any remote deploy (preview + production).
        return IS_LOCAL_DEV
    if IS_LOCAL_DEV and ('localhost' in origin or '127.0.0.1' in origin):
        return True
    # Exact match against configured origins
    if origin in ALLOWED_ORIGINS:
        return True
    # Allow only TakeoffPro Vercel deployment URLs (preview + production)
    if origin.startswith('https://') and origin.endswith('.vercel.app'):
        # Only accept our project's deployment URLs (takeoffpro-*.vercel.app or raj-nlat-dwg.vercel.app)
        host = origin.replace('https://', '')
        if host.startswith('takeoffpro-') or host.startswith('raj-nlat-dwg'):
            return True
    return False


def check_origin(handler):
    origin = handler.headers.get('Origin', '')
    if _is_allowed_origin(origin):
        return True
    handler.send_response(403)
    handler.send_header('Content-Type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False, 'error': 'Origin not allowed'
    }).encode())
    print(f"[SECURITY] Rejected origin: {origin!r} (production={IS_PRODUCTION})", file=sys.stderr)
    return False


def get_cors_origin(handler):
    origin = handler.headers.get('Origin', '')
    if origin and (origin in ALLOWED_ORIGINS or
                   (not IS_PRODUCTION and ('localhost' in origin or '127.0.0.1' in origin))):
        return origin
    return ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else 'null'


def send_cors_headers(handler, origin=None):
    if origin is None:
        origin = get_cors_origin(handler)
    handler.send_header('Access-Control-Allow-Origin', origin)
    handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    handler.send_header('Access-Control-Max-Age', '86400')


# ── Supabase token verification via Auth API ────────────────────────────────

def verify_supabase_token(handler):
    """
    Verify Supabase access token by calling the Supabase Auth API.

    Calls GET {SUPABASE_URL}/auth/v1/user with the user's Bearer token.
    Supabase validates the token server-side (signing-key-agnostic).
    Returns (user_dict, None) if valid, (None, reason_code) otherwise.

    Fail-closed on any remote deploy (production + preview) without Supabase config.
    Synthetic dev-user ONLY on localhost (IS_LOCAL_DEV).
    """
    auth = handler.headers.get('Authorization', '')

    if not auth.startswith('Bearer ') or len(auth) < 20:
        return None, 'no_token'

    token = auth[7:]

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        if not IS_LOCAL_DEV:
            # Any remote environment (production, preview, staging) — fail-closed
            print(f"[SECURITY] Supabase not configured on remote env (VERCEL_ENV={_VERCEL_ENV!r}) — blocking. "
                  f"SUPABASE_URL={'set' if SUPABASE_URL else 'MISSING'}, "
                  f"SUPABASE_ANON_KEY={'set' if SUPABASE_ANON_KEY else 'MISSING'}, "
                  f"VITE_SUPABASE_URL={'set' if os.environ.get('VITE_SUPABASE_URL') else 'MISSING'}, "
                  f"VITE_SUPABASE_ANON_KEY={'set' if os.environ.get('VITE_SUPABASE_ANON_KEY') else 'MISSING'}",
                  file=sys.stderr)
            return None, 'config_missing'
        # Strictly local dev only — allow with synthetic user
        print("[SECURITY] Supabase not configured — allowing in local dev only", file=sys.stderr)
        return {'id': 'dev-user', 'email': 'dev@localhost'}, None

    try:
        import urllib.request
        import urllib.error
        auth_url = f'{SUPABASE_URL}/auth/v1/user'
        req = urllib.request.Request(
            auth_url,
            headers={
                'Authorization': f'Bearer {token}',
                'apikey': SUPABASE_ANON_KEY,
            }
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            user = json.loads(resp.read())
        if user.get('id'):
            return user, None
        return None, 'token_no_user_id'
    except urllib.error.HTTPError as e:
        status = e.code
        if status == 401:
            print(f"[SECURITY] Supabase token invalid/expired (401)", file=sys.stderr)
        else:
            body_hint = ''
            try: body_hint = e.read().decode('utf-8', errors='replace')[:100]
            except: pass
            print(f"[SECURITY] Supabase auth API HTTP {status}: {body_hint}", file=sys.stderr)
        return None, f'supabase_{status}'
    except urllib.error.URLError as e:
        print(f"[SECURITY] Supabase URL error: {e.reason} | URL={auth_url}", file=sys.stderr)
        return None, 'url_error'
    except Exception as e:
        print(f"[SECURITY] Supabase auth exception: {type(e).__name__}: {e} | URL={SUPABASE_URL}/auth/v1/user | apikey_len={len(SUPABASE_ANON_KEY)}", file=sys.stderr)
        return None, 'auth_api_error'


def require_auth(handler):
    """
    Require valid Supabase session for costly AI endpoints.
    Returns user payload if OK, sends 401 if not.
    Response includes a diagnostic 'code' field to aid debugging.
    """
    payload, reason = verify_supabase_token(handler)
    if payload:
        return payload

    handler.send_response(401)
    handler.send_header('Content-Type', 'application/json')
    send_cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False,
        'error': 'Bejelentkezés szükséges az AI funkciók használatához.',
        'code': reason or 'auth_failed',
    }).encode())
    return None


# ── Request guards ───────────────────────────────────────────────────────────

def check_body_size(handler, max_bytes=DEFAULT_MAX_BODY):
    content_length = int(handler.headers.get('Content-Length', 0))
    if content_length > max_bytes:
        handler.send_response(413)
        handler.send_header('Content-Type', 'application/json')
        send_cors_headers(handler)
        handler.end_headers()
        handler.wfile.write(json.dumps({
            'success': False,
            'error': f'Request too large ({content_length} bytes, max {max_bytes})'
        }).encode())
        return False
    return True


def check_required_env(handler, *env_vars):
    missing = [v for v in env_vars if not os.environ.get(v)]
    if missing:
        handler.send_response(503)
        handler.send_header('Content-Type', 'application/json')
        send_cors_headers(handler)
        handler.end_headers()
        handler.wfile.write(json.dumps({
            'success': False, 'error': 'Service temporarily unavailable'
        }).encode())
        print(f"[SECURITY] Missing required env vars: {missing}", file=sys.stderr)
        return False
    return True


# ── Safe error response ──────────────────────────────────────────────────────

def safe_error_response(handler, status_code, error_msg, exc=None):
    if exc:
        print(f"[API ERROR] {error_msg}: {traceback.format_exc()}", file=sys.stderr)
    handler.send_response(status_code)
    handler.send_header('Content-Type', 'application/json')
    send_cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False, 'error': error_msg
    }).encode())


def rate_limit_response(handler):
    handler.send_response(429)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Retry-After', '60')
    send_cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False, 'error': 'Too many requests. Please try again later.'
    }).encode())
