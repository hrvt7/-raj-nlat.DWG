# TakeoffPro – DXF → Árajánlat generátor

## Gyors indítás (lokális fejlesztés)

```bash
npm install
npm run dev
```

A frontend elindul: http://localhost:5173

> **Megjegyzés**: az API endpointok (`/api/parse`, `/api/calculate`) Vercel-en futnak Python serverless function-ként.
> Lokálisan teszteléshez: a DXF parse-t le tudod futtatni közvetlenül Python-ban is (ld. lent).

---

## Deploy Vercel-re (1x, 5 perc)

### 1. GitHub repo létrehozása
```bash
git init
git add .
git commit -m "Initial commit – TakeoffPro MVP"
git remote add origin https://github.com/YOURUSERNAME/takeoff-pro.git
git push -u origin main
```

### 2. Vercel import
- Menj ide: https://vercel.com/new
- Import: GitHub repo
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Kattints: Deploy

### 3. Python dependency
A `requirements.txt` automatikusan felismeri a Vercel, az `ezdxf` telepítve lesz.

---

## Lokális Python tesztelés

```bash
pip install ezdxf
python3 - << 'EOF'
import ezdxf
from collections import Counter, defaultdict

doc = ezdxf.readfile("test.dxf")
msp = doc.modelspace()
block_counts = Counter()
lengths = defaultdict(float)

for e in msp:
    if e.dxftype() == "INSERT":
        block_counts[(e.dxf.name, e.dxf.layer)] += 1
    if e.dxftype() in ("LWPOLYLINE", "POLYLINE"):
        try: lengths[e.dxf.layer] += e.length()
        except: pass
    if e.dxftype() == "LINE":
        s, en = e.dxf.start, e.dxf.end
        lengths[e.dxf.layer] += ((en.x-s.x)**2+(en.y-s.y)**2)**0.5

print("BLOKKOK:")
for k,v in block_counts.most_common(30): print(f"  {k}: {v} db")
print("\nHOSSZAK:")
for l,h in sorted(lengths.items(), key=lambda x:-x[1])[:20]: print(f"  {l}: {h/1000:.1f} m")
EOF
```

---

## Struktúra

```
takeoff-app/
├── api/
│   ├── parse.py          # DXF feldolgozás (ezdxf)
│   └── calculate.py      # Kalkuláció (anyag + munkadíj)
├── src/
│   ├── App.jsx           # Teljes React app (4 lépés)
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── requirements.txt
```

---

## Flow

```
1. Feltöltés  → DXF → /api/parse → block_counts + lengths JSON
2. Ellenőrzés → mapping alkalmazása (melyik block = melyik tétel)
3. Árazás     → egységárak + normaidők beállítása
4. Ajánlat    → /api/calculate → összesítés + PDF print
```

---

## Mapping (első ügyféllel 1x beállítani)

```json
{
  "blocks": {
    "SOCKET": "Dugalj 2P+F",
    "SWITCH": "Kapcsoló 1G",
    "LIGHT": "Lámpatest"
  },
  "layers": {
    "TRAY_300": "Kábeltálca 300×60",
    "CABLE": "Kábel NYY-J"
  }
}
```

A mapping a Review képernyőn szerkeszthető közvetlenül a UI-ból.

---

## DWG → DXF konverzió

Ingyenes eszköz: **ODA File Converter**
https://opendesign.com/guestfiles/oda_file_converter

Beállítás: Output format → R2013 DXF

---

## Egységek kalibrálása

A DXF-ek általában mm-ben vannak. A UI-ban:
- `mm → m`: osztó 1000 (0.001 szorzó) ← **legtöbb esetben ez**
- `cm → m`: osztó 100
- `m → m`: 1:1

Ellenőrzés: mérd meg egy ismert falszakasz hosszát a DXF-ből.
