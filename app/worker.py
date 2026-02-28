"""
TakeoffPro DWG Worker
---------------------
Flask REST API + background job processor.
"""

import os
import time
import threading
import logging
from flask import Flask, jsonify
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

app = Flask(__name__)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "takeoffpro-dwg-worker"})


@app.route("/process/<job_id>", methods=["POST"])
def trigger_job(job_id):
    threading.Thread(target=_run_job_by_id, args=(job_id,), daemon=True).start()
    return jsonify({"status": "triggered", "job_id": job_id})


def _run_job_by_id(job_id: str):
    try:
        from db import get_supabase
        sb = get_supabase()
        res = sb.table("job_queue").select("*").eq("id", job_id).single().execute()
        if res.data:
            _process_single_job(res.data)
    except Exception as e:
        log.error(f"_run_job_by_id hiba: {e}")


def polling_loop():
    log.info("Polling loop indult – 5s intervallum")
    while True:
        try:
            from db import fetch_pending_jobs
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
        from db import mark_processing, mark_done, mark_error
        from converter import process_job
        mark_processing(job_id)
        result = process_job(job)
        mark_done(job_id, result)
        log.info(f"✅ Job kész: {job_id} | confidence={result.get('_confidence', '?')}")
    except Exception as e:
        log.error(f"❌ Job hiba: {job_id} | {e}")
        try:
            from db import mark_error
            mark_error(job_id, str(e))
        except Exception:
            pass


if __name__ == "__main__":
    t = threading.Thread(target=polling_loop, daemon=True)
    t.start()

    port = int(os.environ.get("PORT", 8080))
    log.info(f"Worker indul – port {port}")
    app.run(host="0.0.0.0", port=port)
