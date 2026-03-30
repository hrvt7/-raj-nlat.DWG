"""
Shared security utilities for TakeoffPro API endpoints.

Provides: origin validation, request size guard, API key auth, and safe error responses.
"""

import os
import sys
import json
import time
import traceback

# ── Configuration ────────────────────────────────────────────────────────────

# Comma-separated allowed origins. Default: production domain only.
_ALLOWED_ORIGINS_RAW = os.environ.get(
    'ALLOWED_ORIGINS',
    'https://raj-nlat-dwg.vercel.app,https://takeoffpro.hu,https://www.takeoffpro.hu'
)
ALLOWED_ORIGINS = [o.strip() for o in _ALLOWED_ORIGINS_RAW.split(',') if o.strip()]

# Optional API key for endpoint protection (Bearer token).
# If set, all protected endpoints require: Authorization: Bearer <key>
API_SECRET = os.environ.get('API_SECRET', '')

# Default max request body size: 5 MB
DEFAULT_MAX_BODY = 5 * 1024 * 1024

# ── Simple in-memory rate limiter ────────────────────────────────────────────
# Per-IP, per-minute. Resets each minute. Lightweight for serverless.
_RATE_WINDOW = 60  # seconds
_RATE_LIMIT = 30   # requests per window per IP
_rate_store = {}   # { ip: (window_start, count) }


def _get_client_ip(handler):
    """Extract client IP from request headers (Vercel forwards via x-forwarded-for)."""
    forwarded = handler.headers.get('x-forwarded-for', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return handler.client_address[0] if handler.client_address else 'unknown'


def check_rate_limit(handler, limit=_RATE_LIMIT):
    """Returns True if request is within rate limit, False if exceeded."""
    ip = _get_client_ip(handler)
    now = time.time()
    window_start, count = _rate_store.get(ip, (now, 0))

    if now - window_start > _RATE_WINDOW:
        # New window
        _rate_store[ip] = (now, 1)
        return True

    if count >= limit:
        return False

    _rate_store[ip] = (window_start, count + 1)
    return True


# ── Origin validation ────────────────────────────────────────────────────────

def get_cors_origin(handler):
    """
    Returns the Access-Control-Allow-Origin value.
    In development (localhost), allows the request origin.
    In production, only allows configured origins.
    """
    origin = handler.headers.get('Origin', '')

    # Allow localhost for development
    if origin and ('localhost' in origin or '127.0.0.1' in origin):
        return origin

    # Check against allowed origins
    if origin in ALLOWED_ORIGINS:
        return origin

    # If no origin header (same-origin request, curl, etc.) — allow
    if not origin:
        return ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else '*'

    # Origin not allowed — return first allowed origin (browser will block)
    return ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else 'null'


def send_cors_headers(handler, origin=None):
    """Send standard CORS headers."""
    if origin is None:
        origin = get_cors_origin(handler)
    handler.send_header('Access-Control-Allow-Origin', origin)
    handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    handler.send_header('Access-Control-Max-Age', '86400')


# ── Request guards ───────────────────────────────────────────────────────────

def check_method(handler, allowed=('POST',)):
    """Verify HTTP method. Returns True if OK, sends 405 if not."""
    if handler.command not in allowed and handler.command != 'OPTIONS':
        handler.send_response(405)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(json.dumps({'success': False, 'error': 'Method not allowed'}).encode())
        return False
    return True


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


def check_api_secret(handler):
    """
    If API_SECRET is configured, require Bearer token.
    Returns True if OK or if API_SECRET is not set (open mode for dev).
    Sends 401 if token is missing/invalid.
    """
    if not API_SECRET:
        # No secret configured — allow (development / unconfigured production)
        return True

    auth = handler.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        handler.send_response(401)
        handler.send_header('Content-Type', 'application/json')
        send_cors_headers(handler)
        handler.end_headers()
        handler.wfile.write(json.dumps({
            'success': False, 'error': 'Missing Authorization header'
        }).encode())
        return False

    token = auth[7:]
    if token != API_SECRET:
        handler.send_response(401)
        handler.send_header('Content-Type', 'application/json')
        send_cors_headers(handler)
        handler.end_headers()
        handler.wfile.write(json.dumps({
            'success': False, 'error': 'Invalid API key'
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
    """Send error response WITHOUT exposing stack traces. Logs trace to stderr."""
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
