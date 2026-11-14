"""Short, uncached social runs. Human approvals live durably in the GTM API.

No external write is retried by ZenML. A run carries an intent ID and input hash,
not a social token, reviewer identity, caption, recipient or API response.
"""
import json
import os
import urllib.request
from pathlib import Path
from zenml import pipeline, step, get_step_context

PIPELINES = (
    "social_content_intake", "social_publish_prepare", "social_publish_execute",
    "social_analytics_daily", "influencer_discovery", "influencer_scoring_vetting",
    "influencer_outreach", "social_account_sync",
)

def request(route: str, payload: dict) -> dict:
    base = os.environ["SOCIAL_BACKEND"].rstrip("/")
    if not (base.startswith("https://") or base.startswith("http://gtm-growth:") or base.startswith("http://127.0.0.1:")):
        raise RuntimeError("Invalid backend origin")
    token = Path(os.environ["SOCIAL_WORKER_TOKEN_FILE"]).read_text().strip()
    req = urllib.request.Request(base + route, json.dumps(payload).encode(),
                                 {"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    # No redirect can carry a worker credential to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    with urllib.request.build_opener(NoRedirect).open(req, timeout=240) as response:
        data = response.read(2_000_001)
        if len(data) > 2_000_000:
            raise RuntimeError("Backend response too large")
        return json.loads(data)

@step(enable_cache=False)
def execute_intent(intent_id: str, input_hash: str) -> dict:
    # Lease/token stay outside pipeline parameters and materialized artifacts.
    lease = os.environ["SOCIAL_JOB_LEASE"]
    run_id = str(get_step_context().pipeline_run.id)
    result = request("/execute", {"id": intent_id, "lease": lease, "zenmlRunId": run_id})
    if result.get("status") != "completed":
        raise RuntimeError("Social intent did not complete: " + result.get("error", "SOCIAL_FAILED"))
    if result.get("inputHash") != input_hash:
        raise RuntimeError("Social input digest changed")
    return result

@pipeline(enable_cache=False)
def social_content_intake(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)

@pipeline(enable_cache=False)
def social_publish_prepare(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)

@pipeline(enable_cache=False)
def social_publish_execute(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)

@pipeline(enable_cache=False)
def social_analytics_daily(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)

@pipeline(enable_cache=False)
def influencer_discovery(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)

@pipeline(enable_cache=False)
def influencer_scoring_vetting(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)

@pipeline(enable_cache=False)
def influencer_outreach(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)

@pipeline(enable_cache=False)
def social_account_sync(intent_id: str, input_hash: str):
    execute_intent(intent_id, input_hash)
