"""
db.py – Supabase kapcsolat és job_queue műveletek
"""

import os
import logging
from datetime import datetime, timezone
from supabase import create_client, Client

log = logging.getLogger(__name__)

_client: Client = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


def fetch_pending_jobs(limit: int = 3) -> list:
    """Legfeljebb `limit` db pending jobot ad vissza, legrégebbieket először."""
    sb = get_supabase()
    try:
        res = (
            sb.schema("takeoffpro")
            .table("job_queue")
            .select("*")
            .eq("status", "pending")
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.error(f"fetch_pending_jobs hiba: {e}")
        return []


def mark_processing(job_id: str):
    sb = get_supabase()
    sb.schema("takeoffpro").table("job_queue").update({
        "status": "processing",
        "started_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", job_id).execute()


def mark_done(job_id: str, result: dict):
    sb = get_supabase()
    sb.schema("takeoffpro").table("job_queue").update({
        "status": "done",
        "result_json": result,
        "confidence": result.get("_confidence", 0.0),
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", job_id).execute()

    # Ha van plan_id, frissítsük a plans táblát is
    job_res = sb.schema("takeoffpro").table("job_queue").select("plan_id, file_type").eq("id", job_id).single().execute()
    if job_res.data and job_res.data.get("plan_id"):
        plan_id = job_res.data["plan_id"]
        file_type = job_res.data["file_type"]
        source = f"oda_{file_type}" if file_type in ("dwg", "pdf") else "dxf_direct"
        sb.schema("takeoffpro").table("plans").update({
            "parsed_data": result,
            "job_id": job_id,
            "source": source
        }).eq("id", plan_id).execute()
        log.info(f"Plans tábla frissítve: plan_id={plan_id}")


def mark_error(job_id: str, error_message: str):
    sb = get_supabase()
    sb.schema("takeoffpro").table("job_queue").update({
        "status": "error",
        "error_message": error_message,
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", job_id).execute()
