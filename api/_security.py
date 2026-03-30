"""
Shared security utilities for TakeoffPro API endpoints.

Provides: origin validation (fail-closed in production), request size guard,
rate limiting, required env checks, and safe error responses.

NO browser-sent shared secrets — origin restriction + rate limiting + fail-closed
config is the real protection layer for a public SPA.
"""

import os
import sys
import json
import time
import traceback

# ── Environment detection ────────────────────────────────────────────────────
# Vercel sets VERCEL_ENV to 'production', 'preview', or 'development'.
# If not on Vercel, fall back to NODE_ENV or assume development.
_VERCEL_ENV = os.environ.get('VERCEL_ENV', '')
_NODE_ENV = os.environ.get('NODE_ENV', '')
IS_PRODUCTION = _VERCEL_ENV == 'production' or _NODE_ENV == 'production'

# ── CORS origin configuration ────────────────────────────────────────────────
# In production: ONLY allow configured origins. No fallback to '*'.
# In development: also allow localhost.
_ALLOWED_ORIGINS_RAW = os.environ.get(
    'ALLOWED_ORIGINS',
    'https://raj-nlat-dwg.vercel.app,https://takeoffpro.hu,https://www.takeoffpro.hu'
)
ALLOWED_ORIGINS = [o.strip() for o in _ALLOWED_ORIGINS_RAW.split(',') if o.strip()]

# Default max request body size: 5 MB
DEFAULT_MAX_BODY = 5 * 1024 * 1024

# ── Simple in-memory rate limiter ────────────────────────────────────────────
_RATE_WINDOW = 60  # seconds
_RATE_LIMIT = 30   # requests per window per IP
_rate_store = {}


def _get_client_ip(handler):
    """Extract client IP (Vercel forwards via x-forwarded-for)."""
    forwarded = handler.headers.get('x-forwarded-for', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return handler.client_address[0] if handler.client_address else 'unknown'


def check_rate_limit(handler, limit=_RATE_LIMIT):
    """Returns True if within rate limit, False if exceeded."""
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


# ── Origin validation (fail-closed in production) ───────────────────────────

def _is_allowed_origin(origin):
    """Check if origin is in the allowed list or is a dev origin."""
    if not origin:
        return True  # No Origin header = same-origin or non-browser (curl, etc.)
    # Always allow localhost in non-production
    if not IS_PRODUCTION and ('localhost' in origin or '127.0.0.1' in origin):
        return True
    return origin in ALLOWED_ORIGINS


def check_origin(handler):
    """
    Validate request origin. In production, reject unknown origins with 403.
    Returns True if OK, sends 403 if not.
    """
    origin = handler.headers.get('Origin', '')
    if _is_allowed_origin(origin):
        return True

    # Production: fail-closed — reject unknown origins
    handler.send_response(403)
    handler.send_header('Content-Type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False,
        'error': 'Origin not allowed'
    }).encode())
    print(f"[SECURITY] Rejected origin: {origin}", file=sys.stderr)
    return False


def get_cors_origin(handler):
    """Returns the Access-Control-Allow-Origin value for response headers."""
    origin = handler.headers.get('Origin', '')
    if _is_allowed_origin(origin) and origin:
        return origin
    return ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else 'null'


def send_cors_headers(handler, origin=None):
    """Send standard CORS headers."""
    if origin is None:
        origin = get_cors_origin(handler)
    handler.send_header('Access-Control-Allow-Origin', origin)
    handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
    handler.send_header('Access-Control-Max-Age', '86400')


# ── Request guards ───────────────────────────────────────────────────────────

def check_body_size(handler, max_bytes=DEFAULT_MAX_BODY):
    """Check Content-Length. Returns True if OK, sends 413 if too large."""
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
    """
    Fail-closed: if any required env var is missing/empty, return 503.
    Returns True if all present, sends 503 if not.
    """
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
    """Send error response WITHOUT exposing stack traces. Logs to stderr."""
    if exc:
        print(f"[API ERROR] {error_msg}: {traceback.format_exc()}", file=sys.stderr)
    handler.send_response(status_code)
    handler.send_header('Content-Type', 'application/json')
    send_cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False,
        'error': error_msg
    }).encode())


def rate_limit_response(handler):
    """Send 429 Too Many Requests."""
    handler.send_response(429)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Retry-After', '60')
    send_cors_headers(handler)
    handler.end_headers()
    handler.wfile.write(json.dumps({
        'success': False,
        'error': 'Too many requests. Please try again later.'
    }).encode())
