"""One scoped worker, one intent at a time. Never retries a publish itself."""
import os
import time
import pipelines

def tick():
    job = pipelines.request("/claim", {}).get("job")
    if not job:
        return False
    if job["pipeline"] not in pipelines.PIPELINES:
        raise RuntimeError("Unknown pipeline")
    os.environ["SOCIAL_JOB_LEASE"] = job["lease"]
    try:
        getattr(pipelines, job["pipeline"])(intent_id=job["id"], input_hash=job["inputHash"])
    finally:
        os.environ.pop("SOCIAL_JOB_LEASE", None)
    return True

if __name__ == "__main__":
    while True:
        try:
            tick()
        except Exception:
            # Do not log request headers, provider bodies, credentials or customer content.
            print("Social run failed; inspect the scoped console run ledger.", flush=True)
        time.sleep(15)
