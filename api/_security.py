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

# ── CORS origin configuration ────────────────────────────────────────────────
_ALLOWED_ORIGINS_RAW = os.environ.get(
    'ALLOWED_ORIGINS',
    'https://raj-nlat-dwg.vercel.app,https://takeoffpro.hu,https://www.takeoffpro.hu'
)
ALLOWED_ORIGINS = [o.strip() for o in _ALLOWED_ORIGINS_RAW.split(',') if o.strip()]

# ── Supabase JWT config ──────────────────────────────────────────────────────
SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET', '')

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
        # In dev: allow. In production: handled per-endpoint.
        return not IS_PRODUCTION
    if not IS_PRODUCTION and ('localhost' in origin or '127.0.0.1' in origin):
        return True
    return origin in ALLOWED_ORIGINS


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


# ── Supabase JWT verification ────────────────────────────────────────────────

def verify_supabase_token(handler):
    """
    Verify Supabase access token from Authorization: Bearer header.
    Returns the decoded payload (with 'sub' = user UUID) if valid.
    Returns None if missing/invalid.

    In development without SUPABASE_JWT_SECRET: logs warning, allows request.
    In production without SUPABASE_JWT_SECRET: blocks request (fail-closed).
    """
    auth = handler.headers.get('Authorization', '')

    if not auth.startswith('Bearer ') or len(auth) < 20:
        return None

    token = auth[7:]

    if not SUPABASE_JWT_SECRET:
        if IS_PRODUCTION:
            print("[SECURITY] SUPABASE_JWT_SECRET not set in production — blocking", file=sys.stderr)
            return None
        # Dev mode: decode without verification to extract user info
        print("[SECURITY] SUPABASE_JWT_SECRET not set — skipping verification (dev mode)", file=sys.stderr)
        try:
            import jwt
            return jwt.decode(token, options={"verify_signature": False})
        except Exception:
            return None

    try:
        import jwt
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=['HS256'],
            options={'verify_aud': False}
        )
        return payload
    except Exception as e:
        print(f"[SECURITY] JWT verification failed: {e}", file=sys.stderr)
        return None


def require_auth(handler):
    """
    Require valid Supabase session for costly AI endpoints.
    Returns user payload if OK, sends 401 if not.
    """
    payload = verify_supabase_token(handler)
    if payload:
        return payload

    handler.send_response(401)
    handler.send_header('Content-Type', 'application/json')
    send_cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False,
        'error': 'Bejelentkezés szükséges az AI funkciók használatához.'
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
