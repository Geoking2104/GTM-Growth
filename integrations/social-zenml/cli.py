"""Human-authenticated CLI using the same console routes and approval guards."""
import argparse
import json
import os
import sys
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("command", choices=["state", "analytics", "export", "queue", "approval/decide", "publish"])
parser.add_argument("--json-file", help="Exact console request JSON; omitted for state/export")
args = parser.parse_args()
base = os.environ["GTM_CONSOLE_URL"].rstrip("/")
if not base.startswith("https://"):
    raise SystemExit("HTTPS console URL required")
body = json.load(open(args.json_file, encoding="utf-8")) if args.json_file else {}
req = urllib.request.Request(base + "/social/" + args.command, json.dumps(body).encode(),
    {"Authorization": "Bearer " + os.environ["GTM_OIDC_TOKEN"], "X-Tenant": os.environ["GTM_TENANT"], "Content-Type": "application/json"})
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None
try:
    with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
        print(response.read(2_000_000).decode())
except Exception:
    print("Console request failed; check your account, scope and approval state.", file=sys.stderr)
    raise SystemExit(1)
