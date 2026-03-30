"""
Vercel Serverless Function: /api/meta-vision
Proxies PDF first-page images to OpenAI Vision API for metadata extraction.
The OpenAI API key lives server-side only — never exposed to the client bundle.
"""
from http.server import BaseHTTPRequestHandler
import json, os, sys, urllib.request, urllib.error
from _security import (
    send_cors_headers, check_origin, check_rate_limit,
    check_required_env, safe_error_response, rate_limit_response
)

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

# Max request body: ~4 MB (base64-encoded JPEG of a plan page is typically 200-800 KB)
MAX_BODY_BYTES = 4 * 1024 * 1024

OPENAI_MODEL = 'gpt-4o-mini'  # fast + cheap vision model

SYSTEM_PROMPT = """Te egy magyar villamos tervrajz metaadat-felismerő AI vagy.
A felhasználó egy épületvillamos tervrajz első oldalának képét küldi.
A képen jellemzően van fejléc / title block / bélyegző a jobb alsó sarokban.

Feladatod: strukturált JSON-t visszaadni az alábbi mezőkkel.
Ha egy mezőt nem tudsz megállapítani, adj null-t.

Mezők:
- floor: emelet kódja (pl. "fsz", "pince", "1_emelet", "2_emelet", "teto")
- floorLabel: emelet olvasható neve (pl. "Földszint", "1. emelet", "Tetőszint")
- systemType: villamos rendszer típusa, az alábbiak egyike:
    "power" | "lighting" | "fire_alarm" | "low_voltage" | "security" | "lightning_protection" | "general"
- docType: dokumentum típusa, az alábbiak egyike:
    "plan" | "single_line" | "legend" | "schedule" | "detail" | "section"
- drawingNumber: rajzszám (pl. "E-01", "V-03", "GY-02")
- revision: revízió (pl. "R1", "A", "Rev2")
- confidence: 0–1 közötti szám, mennyire vagy biztos az eredményben

FONTOS:
- Csak az képen látható információt használd
- Ne találj ki adatot
- A confidence legyen őszinte (ha alig látsz title block-ot, adj 0.3-at)
- Válaszolj KIZÁRÓLAG valid JSON-nel, semmi más szöveggel"""

VALID_SYSTEM_TYPES = {'power', 'lighting', 'fire_alarm', 'low_voltage', 'security', 'lightning_protection', 'general'}
VALID_DOC_TYPES = {'plan', 'single_line', 'legend', 'schedule', 'detail', 'section'}

EMPTY_RESULT = {
    "floor": None,
    "floorLabel": None,
    "systemType": None,
    "docType": None,
    "drawingNumber": None,
    "revision": None,
    "confidence": 0,
}


def validate_result(obj):
    """Sanitize and validate the AI response fields."""
    if not isinstance(obj, dict):
        return dict(EMPTY_RESULT)
    return {
        "floor": obj.get("floor") if isinstance(obj.get("floor"), str) else None,
        "floorLabel": obj.get("floorLabel") if isinstance(obj.get("floorLabel"), str) else None,
        "systemType": obj.get("systemType") if obj.get("systemType") in VALID_SYSTEM_TYPES else None,
        "docType": obj.get("docType") if obj.get("docType") in VALID_DOC_TYPES else None,
        "drawingNumber": obj.get("drawingNumber") if isinstance(obj.get("drawingNumber"), str) else None,
        "revision": obj.get("revision") if isinstance(obj.get("revision"), str) else None,
        "confidence": min(1.0, max(0.0, float(obj.get("confidence", 0.5)))) if isinstance(obj.get("confidence"), (int, float)) else 0.5,
    }


def parse_ai_response(raw):
    """Parse potentially markdown-fenced JSON from the AI response."""
    cleaned = raw.strip()
    if cleaned.startswith('```'):
        cleaned = cleaned.lstrip('`').lstrip('json').strip().rstrip('`').strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Fallback: extract first {...} block
    import re
    m = re.search(r'\{[\s\S]*\}', cleaned)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError("AI válasz nem valid JSON.")


def call_openai_vision(image_data_url, existing_meta=None):
    """Call OpenAI Vision API with the plan image."""
    if not OPENAI_API_KEY:
        raise Exception("OPENAI_API_KEY nincs beállítva a Vercel environment variables-ban.")

    user_content = [
        {
            "type": "image_url",
            "image_url": {"url": image_data_url, "detail": "low"},
        },
    ]

    # Add context about existing (uncertain) metadata
    if existing_meta and isinstance(existing_meta, dict):
        ctx_parts = []
        for k, v in existing_meta.items():
            if v and not str(k).startswith('meta'):
                ctx_parts.append(f"{k}: {v}")
        if ctx_parts:
            user_content.append({
                "type": "text",
                "text": f"Jelenlegi (bizonytalan) metaadatok: {', '.join(ctx_parts)}\nKérlek erősítsd meg vagy javítsd ki a kép alapján.",
            })

    payload = json.dumps({
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 300,
        "temperature": 0.1,
    }).encode()

    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json',
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')[:300]
        if e.code == 401:
            raise Exception("Érvénytelen OpenAI API kulcs.")
        if e.code == 429:
            raise Exception("OpenAI API rate limit — próbáld újra később.")
        raise Exception(f"OpenAI API hiba ({e.code}): {body}")

    raw = resp.get('choices', [{}])[0].get('message', {}).get('content', '')
    if not raw:
        raise Exception("Üres AI válasz.")

    parsed = parse_ai_response(raw)
    return validate_result(parsed)


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        send_cors_headers(self)
        self.end_headers()

    def do_POST(self):
        if not check_origin(self): return
        if not check_rate_limit(self): return rate_limit_response(self)
        if not check_required_env(self, 'OPENAI_API_KEY'): return
        try:
            # ── Validate Content-Length ──
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                return self._respond(400, {"error": "Üres kérés."})
            if length > MAX_BODY_BYTES:
                return self._respond(413, {"error": f"Túl nagy payload ({length} bytes). Max: {MAX_BODY_BYTES}."})

            body = self.rfile.read(length)
            payload = json.loads(body)

            # ── Validate image ──
            image = payload.get('image', '')
            if not image:
                return self._respond(400, {"error": "Hiányzó 'image' mező."})
            if not isinstance(image, str):
                return self._respond(400, {"error": "'image' mező szöveg (base64 data URL) kell legyen."})
            if not image.startswith('data:image/'):
                return self._respond(400, {"error": "'image' mező data:image/ prefixszel kell kezdődjön."})

            # Rough size check: base64 string for a ~1MB JPEG is about 1.4M chars
            if len(image) > 3_000_000:
                return self._respond(413, {"error": "Túl nagy kép (max ~2 MB JPEG ajánlott)."})

            existing_meta = payload.get('existingMeta', None)

            # ── Call OpenAI Vision ──
            result = call_openai_vision(image, existing_meta)
            self._respond(200, result)

        except json.JSONDecodeError:
            self._respond(400, {"error": "Érvénytelen JSON."})
        except Exception as e:
            safe_error_response(self, 500, 'Internal server error', exc=e)

    def _respond(self, code, data):
        self.send_response(code)
        send_cors_headers(self)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def log_message(self, *a):
        pass
