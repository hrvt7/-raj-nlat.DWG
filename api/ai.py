from http.server import BaseHTTPRequestHandler
import json, base64, traceback, os, urllib.request, urllib.error

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

def openai_chat(messages, model='gpt-4o', max_tokens=2000):
    if not OPENAI_API_KEY:
        raise Exception("OPENAI_API_KEY nincs beállítva a Vercel environment variables-ban.")
    payload = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "response_format": {"type": "json_object"}
    }).encode()
    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json'
        }
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read())
    return json.loads(resp['choices'][0]['message']['content'])


def analyze_spec(spec_text, takeoff_items):
    """Analyze technical specification PDF text against takeoff items."""
    prompt = f"""Te egy tapasztalt villanyszerelő mérnök asszisztens vagy Magyarországon.
Elemezd az alábbi műszaki leírást és takeoff adatokat.

TAKEOFF TÉTELEK (DXF-ből kinyerve):
{json.dumps(takeoff_items, ensure_ascii=False, indent=2)}

MŰSZAKI LEÍRÁS:
{spec_text[:4000]}

Válaszolj KIZÁRÓLAG valid JSON formátumban, magyarul:
{{
  "ip_requirement": "pl. IP44 nedves helyiségekhez",
  "cable_type": "pl. NYY-J 3×2.5mm²",
  "standard": "pl. MSZ HD 60364",
  "installation_method": "pl. vakolat alá, kötődobozba",
  "warnings": ["lista a figyelmeztetésekről ha van"],
  "missing_items": ["tételek amik a leírásban szerepelnek de a DXF-ben nem"],
  "suggestions": ["konkrét javaslatok a kivitelezőnek"],
  "summary": "2-3 mondatos összefoglaló magyarul"
}}"""
    
    return openai_chat([
        {"role": "system", "content": "Válaszolj mindig valid JSON-ban, magyarul. Ne írj semmit a JSON-on kívül."},
        {"role": "user", "content": prompt}
    ])


def suggest_materials(item_name, quantity, unit):
    """Suggest specific Hungarian market products for an item."""
    prompt = f"""Te egy tapasztalt villanyszerelő mérnök asszisztens vagy Magyarországon.

Javasolj konkrét termékeket a magyar piacról az alábbi tételhez:
Tétel: {item_name}
Mennyiség: {quantity} {unit}

Válaszolj KIZÁRÓLAG valid JSON formátumban:
{{
  "item": "{item_name}",
  "products": [
    {{
      "name": "Termék neve",
      "brand": "Márka",
      "type": "Típus/cikkszám ha ismert",
      "price_range": "becsült ár tartomány HUF-ban",
      "pros": "előnyök röviden",
      "availability": "általánosan kapható / speciális rendelés"
    }}
  ],
  "recommendation": "Melyiket és miért ajánlod a legjobban",
  "note": "Fontos megjegyzés a tételhez ha van"
}}

Adj 2-3 konkrét terméket, valós magyar forgalmazóknál elérhető termékeket."""

    return openai_chat([
        {"role": "system", "content": "Válaszolj mindig valid JSON-ban, magyarul. Valós termékeket javasolj."},
        {"role": "user", "content": prompt}
    ])


def explain_quote(quote_summary, project_name):
    """Generate a human-readable explanation of the quote for the client."""
    prompt = f"""Te egy tapasztalt villanyszerelő vállalkozó vagy Magyarországon.
Az ügyfél kérdezi: "Miért ennyi az ajánlat?"

Projekt: {project_name}
Árajánlat adatok:
{json.dumps(quote_summary, ensure_ascii=False, indent=2)}

Írj egy barátságos, szakszerű magyarázatot az ügyfélnek magyarul.
Válaszolj KIZÁRÓLAG valid JSON formátumban:
{{
  "greeting": "Rövid bevezető mondat",
  "material_explanation": "Anyagköltség magyarázata (2-3 mondat)",
  "labor_explanation": "Munkadíj magyarázata (2-3 mondat)",
  "value_points": ["3 pont miért éri meg ezt a kivitelezőt választani"],
  "closing": "Záró mondat"
}}"""

    return openai_chat([
        {"role": "system", "content": "Válaszolj mindig valid JSON-ban, magyarul, ügyfélbarát hangnemben."},
        {"role": "user", "content": prompt}
    ])


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
            action = payload.get('action', '')

            if action == 'analyze_spec':
                spec_text = payload.get('spec_text', '')
                takeoff_items = payload.get('takeoff_items', [])
                result = analyze_spec(spec_text, takeoff_items)
                self._respond(200, {'success': True, 'result': result})

            elif action == 'suggest_materials':
                item_name = payload.get('item_name', '')
                quantity = payload.get('quantity', 0)
                unit = payload.get('unit', 'db')
                result = suggest_materials(item_name, quantity, unit)
                self._respond(200, {'success': True, 'result': result})

            elif action == 'explain_quote':
                quote_summary = payload.get('quote_summary', {})
                project_name = payload.get('project_name', 'Projekt')
                result = explain_quote(quote_summary, project_name)
                self._respond(200, {'success': True, 'result': result})

            else:
                self._respond(400, {'success': False, 'error': f'Ismeretlen action: {action}'})

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
