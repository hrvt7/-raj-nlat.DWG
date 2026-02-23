from http.server import BaseHTTPRequestHandler
import json


def calculate(data):
    try:
        blocks = data.get('blocks', [])
        lengths = data.get('lengths', [])
        mapping = data.get('mapping', {})
        price_list = data.get('priceList', {})
        norms = data.get('norms', {})
        hourly_rate = data.get('hourlyRate', 8000)  # HUF/hour default
        margin = data.get('margin', 1.15)  # 15% default
        
        line_items = []
        total_material = 0
        total_work_hours = 0
        
        # Process blocks
        block_map = mapping.get('blocks', {})
        for block in blocks:
            block_name = block['name']
            count = block['count']
            
            # Find matching item key
            item_key = None
            for pattern, mapped_key in block_map.items():
                if pattern.lower() in block_name.lower() or block_name.lower() in pattern.lower():
                    item_key = mapped_key
                    break
            
            if not item_key:
                item_key = block_name
            
            unit_price = price_list.get(item_key, 0)
            norm_minutes = norms.get(item_key, 0)
            
            material_cost = unit_price * count
            work_hours = (norm_minutes * count) / 60
            
            total_material += material_cost
            total_work_hours += work_hours
            
            line_items.append({
                "type": "block",
                "key": item_key,
                "original_name": block_name,
                "layer": block['layer'],
                "qty": count,
                "unit": "db",
                "unit_price": unit_price,
                "norm_minutes": norm_minutes,
                "material_cost": material_cost,
                "work_hours": round(work_hours, 2),
                "mapped": item_key != block_name
            })
        
        # Process lengths
        layer_map = mapping.get('layers', {})
        length_unit_factor = data.get('lengthUnitFactor', 0.001)  # default: mm to m
        
        for length_item in lengths:
            layer = length_item['layer']
            raw_length = length_item['length']
            length_m = raw_length * length_unit_factor
            
            # Find matching item key
            item_key = None
            for pattern, mapped_key in layer_map.items():
                if pattern.lower() in layer.lower() or layer.lower() in pattern.lower():
                    item_key = mapped_key
                    break
            
            if not item_key:
                item_key = layer
            
            unit_price = price_list.get(item_key, 0)
            norm_minutes = norms.get(item_key, 0)
            
            material_cost = unit_price * length_m
            work_hours = (norm_minutes * length_m) / 60
            
            total_material += material_cost
            total_work_hours += work_hours
            
            line_items.append({
                "type": "length",
                "key": item_key,
                "original_name": layer,
                "layer": layer,
                "qty": round(length_m, 2),
                "raw_qty": raw_length,
                "unit": "m",
                "unit_price": unit_price,
                "norm_minutes": norm_minutes,
                "material_cost": round(material_cost, 0),
                "work_hours": round(work_hours, 2),
                "mapped": item_key != layer
            })
        
        work_cost = total_work_hours * hourly_rate
        subtotal = (total_material + work_cost)
        total_with_margin = subtotal * margin
        vat = total_with_margin * 0.27  # Hungarian VAT 27%
        grand_total = total_with_margin + vat
        
        return {
            "success": True,
            "lineItems": line_items,
            "summary": {
                "totalMaterial": round(total_material, 0),
                "totalWorkHours": round(total_work_hours, 2),
                "workCost": round(work_cost, 0),
                "subtotal": round(subtotal, 0),
                "margin": margin,
                "totalWithMargin": round(total_with_margin, 0),
                "vat": round(vat, 0),
                "grandTotal": round(grand_total, 0),
                "currency": "HUF"
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            result = calculate(data)
            
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        pass
