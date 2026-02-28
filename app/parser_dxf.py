"""
parser_dxf.py – ezdxf alapú DXF elemző
Kinyeri: block insert-ek, layer-ek, polyline hosszak, méretarány
"""

import logging
import math
from collections import defaultdict
from typing import Optional

import ezdxf
from ezdxf.document import Drawing

log = logging.getLogger(__name__)

# ── Magyar villamos tervező konvenciók ───────────────────────────────────
# Kábeltálca / kábelcsatorna layer kulcsszavak
CABLE_TRAY_KEYWORDS = [
    "talca", "tálca", "tray", "kabeltalca", "kábeltalca",
    "csatorna", "channel", "ct-", "kt-"
]

# Kábel layer kulcsszavak
CABLE_KEYWORDS = [
    "kabel", "kábel", "cable", "vez", "vezeyek", "vezeték",
    "villamos", "e-kab", "e-vez"
]

# Ismert villamos szerelvény block nevek (részleges egyezés)
DEVICE_BLOCK_KEYWORDS = {
    "aljzat": ["aljzat", "socket", "konnektor", "csatlakoz"],
    "kapcsolo": ["kapcsolo", "kapcsoló", "switch", "ksz"],
    "lampa": ["lampa", "lámpa", "light", "vilagit", "világít", "led", "luminaire"],
    "elosztó": ["eloszto", "elosztó", "tablou", "board", "panel", "mdb", "fdb", "szf"],
    "biztositek": ["biztositek", "biztosíték", "fuse", "mcb", "rcbo", "rcd"],
    "motor": ["motor", "pump", "szivattyu", "szivattyú", "fan", "ventilatór"],
    "detektor": ["detektor", "detector", "mozgas", "mozgás", "pir", "smoke", "fust"],
    "kamera": ["kamera", "camera", "cctv"],
}


def parse_dxf(dxf_path: str) -> dict:
    """
    Fő parse függvény – visszaad egy strukturált JSON-t.
    """
    try:
        doc = ezdxf.readfile(dxf_path)
    except Exception as e:
        raise RuntimeError(f"DXF olvasás sikertelen: {e}")

    msp = doc.modelspace()

    result = {
        "blocks": _parse_blocks(msp, doc),
        "layers": _parse_layers(doc),
        "lengths": _parse_lengths(msp, doc),
        "texts": _parse_texts(msp),
        "scale": _detect_scale(doc),
        "_confidence": 0.95,
        "_block_count": 0,
        "_cable_m": 0.0,
        "_tray_m": 0.0,
        "_warnings": []
    }

    # Összesítők
    result["_block_count"] = sum(v["count"] for v in result["blocks"].values())
    result["_cable_m"] = sum(
        v["length_m"] for v in result["lengths"].values()
        if v.get("category") == "cable"
    )
    result["_tray_m"] = sum(
        v["length_m"] for v in result["lengths"].values()
        if v.get("category") == "cable_tray"
    )

    # Confidence csökkentés ha kevés adat
    if result["_block_count"] == 0:
        result["_warnings"].append("Nem találhatók block INSERT-ek – lehet üres vagy 2D rajz")
        result["_confidence"] -= 0.2
    if result["_cable_m"] == 0 and result["_tray_m"] == 0:
        result["_warnings"].append("Nem találhatók kábel/tálca vonalak")
        result["_confidence"] -= 0.1

    result["_confidence"] = max(0.1, round(result["_confidence"], 2))

    log.info(
        f"Parse kész: {result['_block_count']} block, "
        f"{result['_cable_m']:.1f}m kábel, "
        f"{result['_tray_m']:.1f}m tálca, "
        f"confidence={result['_confidence']}"
    )

    return result


# ── BLOCK INSERT-ek ──────────────────────────────────────────────────────

def _parse_blocks(msp, doc: Drawing) -> dict:
    """
    Megszámolja a block INSERT entitásokat, típusonként csoportosítva.
    Returns: {"block_name": {"count": N, "category": "...", "positions": [...]}}
    """
    counts: dict = defaultdict(lambda: {"count": 0, "category": "egyéb", "positions": []})

    for entity in msp.query("INSERT"):
        name = entity.dxf.name.strip()
        category = _classify_block(name)
        counts[name]["count"] += 1
        counts[name]["category"] = category
        try:
            pos = (round(entity.dxf.insert.x, 2), round(entity.dxf.insert.y, 2))
            counts[name]["positions"].append(pos)
        except Exception:
            pass

    # Pozíciók limitálása (ne legyen óriási JSON)
    for data in counts.values():
        if len(data["positions"]) > 50:
            data["positions"] = data["positions"][:50]
            data["positions_truncated"] = True

    return dict(counts)


def _classify_block(block_name: str) -> str:
    lower = block_name.lower()
    for category, keywords in DEVICE_BLOCK_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return category
    return "egyéb"


# ── LAYER-ek ─────────────────────────────────────────────────────────────

def _parse_layers(doc: Drawing) -> list:
    """Visszaadja az összes layer-t nevükkel és kategóriájukkal."""
    layers = []
    for layer in doc.layers:
        name = layer.dxf.name
        layers.append({
            "name": name,
            "category": _classify_layer(name),
            "color": layer.dxf.color if hasattr(layer.dxf, "color") else None,
            "is_off": not layer.is_on(),
            "is_frozen": layer.is_frozen(),
        })
    return layers


def _classify_layer(layer_name: str) -> str:
    lower = layer_name.lower()
    if any(kw in lower for kw in CABLE_TRAY_KEYWORDS):
        return "cable_tray"
    if any(kw in lower for kw in CABLE_KEYWORDS):
        return "cable"
    return "egyéb"


# ── VONALAK / POLYLINE-OK hosszai ────────────────────────────────────────

def _parse_lengths(msp, doc: Drawing) -> dict:
    """
    Összegzi az összes LWPOLYLINE, POLYLINE, LINE hosszát layer-enként.
    Returns: {"layer_name": {"length_m": X.X, "category": "...", "segment_count": N}}
    """
    scale = _detect_scale(doc)
    unit_factor = scale["unit_to_meter"]

    lengths: dict = defaultdict(lambda: {"length_m": 0.0, "category": "egyéb", "segment_count": 0})

    # LWPOLYLINE (leggyakoribb 2D DXF-ben)
    for entity in msp.query("LWPOLYLINE"):
        layer = entity.dxf.layer
        length = _lwpolyline_length(entity) * unit_factor
        lengths[layer]["length_m"] += length
        lengths[layer]["segment_count"] += 1
        lengths[layer]["category"] = _classify_layer(layer)

    # POLYLINE
    for entity in msp.query("POLYLINE"):
        layer = entity.dxf.layer
        length = _polyline_length(entity) * unit_factor
        lengths[layer]["length_m"] += length
        lengths[layer]["segment_count"] += 1
        lengths[layer]["category"] = _classify_layer(layer)

    # LINE entitások (egyes vonalak)
    for entity in msp.query("LINE"):
        layer = entity.dxf.layer
        try:
            start = entity.dxf.start
            end = entity.dxf.end
            length = math.sqrt(
                (end.x - start.x) ** 2 +
                (end.y - start.y) ** 2 +
                (end.z - start.z) ** 2
            ) * unit_factor
            lengths[layer]["length_m"] += length
            lengths[layer]["segment_count"] += 1
            lengths[layer]["category"] = _classify_layer(layer)
        except Exception:
            pass

    # Kerekítés
    for data in lengths.values():
        data["length_m"] = round(data["length_m"], 2)

    return dict(lengths)


def _lwpolyline_length(entity) -> float:
    """LWPOLYLINE hossza – pontok közötti euklideszi távolságok összege."""
    points = list(entity.get_points("xy"))
    if len(points) < 2:
        return 0.0
    total = 0.0
    for i in range(len(points) - 1):
        dx = points[i + 1][0] - points[i][0]
        dy = points[i + 1][1] - points[i][1]
        total += math.sqrt(dx * dx + dy * dy)
    if entity.is_closed and len(points) >= 2:
        dx = points[0][0] - points[-1][0]
        dy = points[0][1] - points[-1][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


def _polyline_length(entity) -> float:
    """POLYLINE hossza a vertices-eken keresztül."""
    try:
        vertices = list(entity.vertices)
        if len(vertices) < 2:
            return 0.0
        total = 0.0
        for i in range(len(vertices) - 1):
            p1 = vertices[i].dxf.location
            p2 = vertices[i + 1].dxf.location
            total += math.sqrt(
                (p2.x - p1.x) ** 2 +
                (p2.y - p1.y) ** 2 +
                (p2.z - p1.z) ** 2
            )
        return total
    except Exception:
        return 0.0


# ── SZÖVEG elemek ─────────────────────────────────────────────────────────

def _parse_texts(msp) -> list:
    """TEXT és MTEXT entitások kinyerése (szobaazonosítók, megjegyzések)."""
    texts = []
    for entity in msp.query("TEXT MTEXT"):
        try:
            if entity.dxftype() == "TEXT":
                content = entity.dxf.text
            else:
                content = entity.plain_mtext()
            content = content.strip()
            if content and len(content) < 200:
                texts.append({
                    "text": content,
                    "layer": entity.dxf.layer,
                })
        except Exception:
            pass
        if len(texts) >= 100:  # Limitálás
            break
    return texts


# ── MÉRETARÁNY detektálás ─────────────────────────────────────────────────

def _detect_scale(doc: Drawing) -> dict:
    """
    DXF HEADER alapján meghatározza a mértékegységet.
    $INSUNITS: 1=inch, 4=mm, 5=cm, 6=m, stb.
    """
    insunits_to_meter = {
        0: 1.0,        # Unitless – feltételezzük 1 unit = 1 mm
        1: 0.0254,     # Inch
        2: 0.3048,     # Foot
        3: 1609.344,   # Mile
        4: 0.001,      # Millimeter ← leggyakoribb magyar DWG-ben
        5: 0.01,       # Centimeter
        6: 1.0,        # Meter
        7: 1000.0,     # Kilometer
        8: 0.0000254,  # Microinch
        9: 0.0000001,  # Mil
        10: 0.9144,    # Yard
        11: 1.0e-10,   # Angstrom
        12: 1.0e-9,    # Nanometer
        13: 1.0e-6,    # Micron
        14: 0.001,     # Decimeter (=mm nominálisan)
        15: 100.0,     # Decameter
        16: 10.0,      # Hectometer
        17: 1.0e9,     # Gigameter
        18: 1.496e11,  # Astronomical unit
        19: 3.086e16,  # Light year
        20: 3.086e16,  # Parsec
    }

    try:
        insunits = doc.header.get("$INSUNITS", 4)
        unit_factor = insunits_to_meter.get(insunits, 0.001)
        unit_name = {4: "mm", 5: "cm", 6: "m", 1: "inch"}.get(insunits, f"unit_{insunits}")
    except Exception:
        insunits = 4
        unit_factor = 0.001
        unit_name = "mm (default)"

    return {
        "insunits": insunits,
        "unit_name": unit_name,
        "unit_to_meter": unit_factor,
    }
