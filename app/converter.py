"""
converter.py – DWG/PDF → DXF konverzió + parse pipeline
"""

import os
import shutil
import subprocess
import tempfile
import logging
import httpx
from parser_dxf import parse_dxf
from db import get_supabase

log = logging.getLogger(__name__)

# ODA bináris keresési sorrendben
ODA_CANDIDATES = [
    "/usr/bin/ODAFileConverter",
    "/usr/local/bin/ODAFileConverter",
    "/opt/ODAFileConverter/ODAFileConverter",
]


def find_oda() -> str:
    """Megkeresi az ODA binárist."""
    env_path = os.environ.get("ODA_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    for p in ODA_CANDIDATES:
        if os.path.isfile(p):
            return p
    # Utolsó próba: PATH-ban van?
    result = subprocess.run(["which", "ODAFileConverter"], capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout.strip()
    raise RuntimeError("ODAFileConverter nem található! Ellenőrizd a Docker telepítést.")


def process_job(job: dict) -> dict:
    """
    Teljes pipeline:
    1. Letöltés Supabase Storage-ból
    2. ODA konverzió (DWG→DXF vagy PDF→DWG→DXF)
    3. ezdxf parse
    4. Cleanup
    """
    file_path = job["file_path"]
    file_type = job["file_type"].lower()  # 'dwg' | 'pdf' | 'dxf'
    original_name = job.get("original_name", f"file.{file_type}")

    tmpdir = tempfile.mkdtemp(prefix="takeoff_")
    try:
        # ── 1. Letöltés ─────────────────────────────────────────
        local_input = os.path.join(tmpdir, f"input.{file_type}")
        _download_from_storage(file_path, local_input)
        log.info(f"Letöltve: {local_input} ({os.path.getsize(local_input)} bytes)")

        # ── 2. DXF előállítása ──────────────────────────────────
        if file_type == "dxf":
            dxf_file = local_input
            source_tag = "dxf_direct"
        elif file_type == "dwg":
            dxf_file = _dwg_to_dxf(tmpdir, local_input)
            source_tag = "oda_dwg"
        elif file_type == "pdf":
            dxf_file = _pdf_to_dxf(tmpdir, local_input)
            source_tag = "oda_pdf"
        else:
            raise ValueError(f"Ismeretlen file_type: {file_type}")

        # ── 3. Parse ────────────────────────────────────────────
        result = parse_dxf(dxf_file)
        result["_source"] = source_tag
        result["_original_name"] = original_name

        return result

    finally:
        # ── 4. Cleanup ──────────────────────────────────────────
        shutil.rmtree(tmpdir, ignore_errors=True)
        log.info(f"Temp könyvtár törölve: {tmpdir}")


def _download_from_storage(file_path: str, local_path: str):
    """Supabase Storage-ból letölti a fájlt signed URL-en keresztül."""
    sb = get_supabase()
    bucket = "dwg-files"

    # Signed URL generálás (5 perc érvényes)
    signed = sb.storage.from_(bucket).create_signed_url(file_path, 300)
    url = signed.get("signedURL") or signed.get("data", {}).get("signedURL")

    if not url:
        raise RuntimeError(f"Signed URL generálás sikertelen: {signed}")

    with httpx.Client(timeout=120) as client:
        response = client.get(url)
        response.raise_for_status()
        with open(local_path, "wb") as f:
            f.write(response.content)


def _run_oda(input_dir: str, output_dir: str, version: str = "ACAD2010", fmt: str = "DXF"):
    """
    ODAFileConverter futtatása.
    Parancs: ODAFileConverter inputDir outputDir version format recurse audit
    """
    oda = find_oda()
    os.makedirs(output_dir, exist_ok=True)

    cmd = [oda, input_dir, output_dir, version, fmt, "0", "1"]
    log.info(f"ODA parancs: {' '.join(cmd)}")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ, "QT_QPA_PLATFORM": "offscreen"}
    )

    log.info(f"ODA stdout: {result.stdout[:500]}")
    if result.stderr:
        log.warning(f"ODA stderr: {result.stderr[:500]}")

    if result.returncode != 0:
        raise RuntimeError(f"ODA konverzió sikertelen (rc={result.returncode}): {result.stderr[:300]}")


def _dwg_to_dxf(tmpdir: str, dwg_file: str) -> str:
    """DWG → DXF R2010 konverzió ODA-val."""
    input_dir = os.path.join(tmpdir, "dwg_in")
    output_dir = os.path.join(tmpdir, "dxf_out")
    os.makedirs(input_dir)

    # ODA mappából dolgozik – fájlt bemásoljuk
    shutil.copy(dwg_file, os.path.join(input_dir, "input.dwg"))
    _run_oda(input_dir, output_dir, "ACAD2010", "DXF")

    dxf = _find_file(output_dir, ".dxf")
    if not dxf:
        raise RuntimeError(f"ODA nem generált DXF-et a(z) {output_dir} mappába")
    return dxf


def _pdf_to_dxf(tmpdir: str, pdf_file: str) -> str:
    """PDF → DWG → DXF kétlépéses konverzió ODA-val."""
    # 1. PDF → DWG
    pdf_in = os.path.join(tmpdir, "pdf_in")
    dwg_out = os.path.join(tmpdir, "dwg_out")
    os.makedirs(pdf_in)
    shutil.copy(pdf_file, os.path.join(pdf_in, "input.pdf"))

    _run_oda(pdf_in, dwg_out, "ACAD2010", "DWG")
    dwg = _find_file(dwg_out, ".dwg")
    if not dwg:
        raise RuntimeError(f"ODA nem generált DWG-t PDF-ből: {dwg_out}")

    # 2. DWG → DXF
    dwg_in = os.path.join(tmpdir, "dwg_in2")
    dxf_out = os.path.join(tmpdir, "dxf_out")
    os.makedirs(dwg_in)
    shutil.copy(dwg, os.path.join(dwg_in, "input.dwg"))

    _run_oda(dwg_in, dxf_out, "ACAD2010", "DXF")
    dxf = _find_file(dxf_out, ".dxf")
    if not dxf:
        raise RuntimeError(f"ODA nem generált DXF-et a DWG-ből: {dxf_out}")
    return dxf


def _find_file(directory: str, extension: str) -> str | None:
    """Megkeresi az első adott kiterjesztésű fájlt a mappában."""
    for fname in os.listdir(directory):
        if fname.lower().endswith(extension):
            return os.path.join(directory, fname)
    return None
