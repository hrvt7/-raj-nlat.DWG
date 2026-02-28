"""
TakeoffPro DWG Worker
---------------------
Flask REST API + background job processor.
Supabase job_queue-ból vesz fel jobokat, ODA-val konvertál, ezdxf-fel parse-ol.
"""

import os
import time
import threading
import logging
from flask import Flask, jsonify, request
from dotenv import load_dotenv
from converter import process_job
from db import get_supabase, fetch_pending_jobs, mark_processing, mark_done, mark_error

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

app = Flask(__name__)

# ── Health check ─────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "takeoffpro-dwg-worker"})


# ── Manual trigger (webhook / tesztelés) ─────────────────────────
@app.route("/process/<job_id>", methods=["POST"])
def trigger_job(job_id):
    """Kézzel triggerelhető egy adott job feldolgozása."""
    threading.Thread(target=_run_job_by_id, args=(job_id,), daemon=True).start()
    return jsonify({"status": "triggered", "job_id": job_id})


def _run_job_by_id(job_id: str):
    sb = get_supabase()
    res = sb.table("job_queue").select("*").eq("id", job_id).single().execute()
    if res.data:
        _process_single_job(res.data)


# ── Background polling loop ───────────────────────────────────────
def polling_loop():
    """5 másodpercenként lekéri a pending jobokat és feldolgozza."""
    log.info("Polling loop indult – 5s intervallum")
    while True:
        try:
            jobs = fetch_pending_jobs()
            for job in jobs:
                log.info(f"Job feldolgozás: {job['id']} ({job['file_type']})")
                _process_single_job(job)
        except Exception as e:
            log.error(f"Polling hiba: {e}")
        time.sleep(5)


def _process_single_job(job: dict):
    job_id = job["id"]
    try:
        mark_processing(job_id)
        result = process_job(job)
        mark_done(job_id, result)
        log.info(f"✅ Job kész: {job_id} | confidence={result.get('_confidence', '?')}")
    except Exception as e:
        log.error(f"❌ Job hiba: {job_id} | {e}")
        mark_error(job_id, str(e))


# ── Indítás ───────────────────────────────────────────────────────
if __name__ == "__main__":
    # Polling thread indítása
    t = threading.Thread(target=polling_loop, daemon=True)
    t.start()

    port = int(os.environ.get("PORT", 8080))
    log.info(f"Worker indul – port {port}")
    app.run(host="0.0.0.0", port=port)
