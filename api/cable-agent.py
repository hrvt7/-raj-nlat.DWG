from http.server import BaseHTTPRequestHandler
import json, traceback, os, urllib.request, urllib.error, base64

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
OPENAI_API_KEY    = os.environ.get('OPENAI_API_KEY', '')

SYSTEM_PROMPT = """Te egy tapasztalt magyar villamos tervező mérnök AI asszisztens vagy.
Kapsz egy DXF tervrajz képét és/vagy a belőle kinyert geometriai adatokat.

FELADATOD:
1. Azonosítsd az elosztó(ka)t (PANEL, DB, ELOSZTO jelű blokkok, vagy a képen látható szekrény szimbólumok)
2. Csoportosítsd a fogyasztókat logikus áramkörökre:
   - Max 10 dugalj / kör, térbeli közelség alapján
   - Lámpa körök külön, max 15/kör
   - Kapcsolók a hozzájuk tartozó lámpakörrel
3. Tervezd meg a legoptimálisabb kábelútvonalat:
   - Ha van kábeltálca layer: annak mentén + 1.5m/eszköz leágazás
   - Ha nincs tálca: Manhattan (fal mentén) × 1.25
   - Ha csak koordináták: Euclidean × 1.35
   - +10% ráhagyás mindig
4. Confidence score (0.0–1.0):
   - 0.85+ : elosztó OK + kábeltálca + skála
   - 0.65–0.84: elosztó OK + falak
   - 0.40–0.64: csak koordináták
   - −0.15 ha elosztót becsülni kellett

VÁLASZOLJ KIZÁRÓLAG valid JSON-ban, semmi más szöveg:
{
  "panels_identified": [{"id":"P1","x":0,"y":0,"source":"layer|image|estimated","confidence":0.9}],
  "circuits": [
    {
      "id":"K1","type":"socket|light|switch|other","panel_id":"P1",
      "device_count":8,"zone":"földszint","estimated_length_m":145,
      "method":"manhattan|tray|euclidean","notes":"Nappali dugalj kör"
    }
  ],
  "cable_total_m": 847,
  "cable_by_type": {"socket_m":480,"light_m":210,"switch_m":80,"other_m":77},
  "confidence": 0.72,
  "method": "Manhattan + 25% ráhagyás",
  "warnings": ["Kábeltálca nem azonosítható"],
  "reasoning": "Rövid magyarázat 2-3 mondatban magyarul"
}"""


def build_text_context(geometry):
    """Build concise text summary of geometry for the LLM."""
    devices  = geometry.get('devices', [])
    panels   = geometry.get('panels', [])
    polys    = geometry.get('polylines', [])
    scale    = geometry.get('scale', {})
    bounds   = geometry.get('bounds', {})

    device_counts = {}
    for d in devices:
        device_counts[d.get('type','unknown')] = device_counts.get(d.get('type','unknown'), 0) + 1

    tray_layers = [p['layer'] for p in polys if p.get('info', {}) and p.get('info', {}).get('type') == 'tray']
    wall_layers = [p['layer'] for p in polys if any(k in p['layer'].upper() for k in ['FAL','WALL','ARCH','A-WALL'])]

    uf = scale.get('factor')
    scale_str = f"1 rajzi egység = {uf*1000:.1f}mm" if uf else 'ismeretlen'

    panel_str = ', '.join(
        f"{p['name']} @ ({p['x']:.0f},{p['y']:.0f})" for p in panels
    ) or 'NINCS AZONOSÍTVA – becslés szükséges'

    device_str = '\n'.join(f"  - {t}: {c} db" for t, c in device_counts.items())

    return (
        f"SKÁLA: {scale_str}\n"
        f"HATÁROK: X: {bounds.get('minX',0):.0f}–{bounds.get('maxX',0):.0f}, "
        f"Y: {bounds.get('minY',0):.0f}–{bounds.get('maxY',0):.0f}\n"
        f"ELOSZTÓK ({len(panels)}): {panel_str}\n"
        f"ESZKÖZÖK ({len(devices)} db):\n{device_str}\n"
        f"KÁBELTÁLCA LAYER-EK: {', '.join(tray_layers) if tray_layers else 'NINCS'}\n"
        f"FAL GEOMETRIA: {'VAN' if wall_layers else 'NINCS'}"
    )


def call_claude(text_context, screenshot_b64=None):
    """Call Anthropic claude-sonnet-4-6 with optional Vision input."""
    if not ANTHROPIC_API_KEY:
        raise Exception('ANTHROPIC_API_KEY nincs beállítva')

    user_content = []

    # Vision: attach screenshot if available
    if screenshot_b64:
        user_content.append({
            'type': 'image',
            'source': {'type': 'base64', 'media_type': 'image/png', 'data': screenshot_b64}
        })
        user_content.append({
            'type': 'text',
            'text': 'A fenti képen látod a DXF tervrajzot. Használd a vizuális információt az elosztók és kábelútvonalak azonosításához.'
        })

    user_content.append({
        'type': 'text',
        'text': f"GEOMETRIAI ADATOK:\n{text_context}\n\nElemezd a tervet és add vissza a JSON eredményt."
    })

    payload = json.dumps({
        'model': 'claude-sonnet-4-6',
        'max_tokens': 4000,
        'system': SYSTEM_PROMPT,
        'messages': [{'role': 'user', 'content': user_content}]
    }).encode()

    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages',
        data=payload,
        headers={
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        resp = json.loads(r.read())

    raw = resp['content'][0]['text']
    return parse_ai_response(raw, source='claude_vision' if screenshot_b64 else 'claude_text')


def call_gpt4o(text_context, screenshot_b64=None):
    """Call GPT-4o as fallback, with optional Vision input."""
    if not OPENAI_API_KEY:
        raise Exception('OPENAI_API_KEY nincs beállítva')

    user_content = []

    if screenshot_b64:
        user_content.append({
            'type': 'image_url',
            'image_url': {'url': f'data:image/png;base64,{screenshot_b64}', 'detail': 'high'}
        })
        user_content.append({'type': 'text', 'text': 'A fenti képen látod a DXF tervrajzot.'})

    user_content.append({
        'type': 'text',
        'text': f"GEOMETRIAI ADATOK:\n{text_context}\n\nElemezd a tervet és add vissza a JSON eredményt."
    })

    payload = json.dumps({
        'model': 'gpt-4o',
        'max_tokens': 4000,
        'response_format': {'type': 'json_object'},
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': user_content}
        ]
    }).encode()

    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        resp = json.loads(r.read())

    raw = resp['choices'][0]['message']['content']
    return parse_ai_response(raw, source='gpt4o_vision' if screenshot_b64 else 'gpt4o_text')


def parse_ai_response(raw, source):
    """Parse and validate JSON from AI response."""
    clean = raw.replace('```json', '').replace('```', '').strip()
    try:
        parsed = json.loads(clean)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{[\s\S]*\}', clean)
        if match:
            parsed = json.loads(match.group(0))
        else:
            raise ValueError(f'Nem valid JSON az AI válaszban: {raw[:300]}')

    # Ensure required fields
    if 'circuits' not in parsed or not isinstance(parsed['circuits'], list):
        parsed['circuits'] = []
    if not parsed.get('cable_total_m'):
        parsed['cable_total_m'] = sum(c.get('estimated_length_m', 0) for c in parsed['circuits'])
    parsed['confidence'] = max(0.0, min(1.0, float(parsed.get('confidence', 0.5))))
    parsed['_source'] = source
    parsed['success'] = True
    return parsed


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

            geometry      = payload.get('geometry', {})
            screenshot_b64 = payload.get('screenshot_base64')  # optional PNG base64

            if not geometry:
                raise ValueError('geometry mező hiányzik')

            text_context = build_text_context(geometry)

            # ── Try Claude first ──────────────────────────────────────────────
            result = None
            claude_error = None
            if ANTHROPIC_API_KEY:
                try:
                    result = call_claude(text_context, screenshot_b64)
                except Exception as e:
                    claude_error = str(e)

            # ── GPT-4o fallback ───────────────────────────────────────────────
            if result is None:
                if OPENAI_API_KEY:
                    try:
                        result = call_gpt4o(text_context, screenshot_b64)
                        if claude_error:
                            result['_claude_fallback_reason'] = claude_error
                    except Exception as e:
                        raise Exception(f'Claude hiba: {claude_error} | GPT-4o hiba: {e}')
                else:
                    raise Exception(
                        f'Nincs elérhető AI. Claude: {claude_error or "ANTHROPIC_API_KEY hiányzik"}. '
                        'OPENAI_API_KEY sem beállítva.'
                    )

            self._respond(200, result)

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
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *a): pass
