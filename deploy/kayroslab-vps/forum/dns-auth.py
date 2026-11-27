#!/usr/bin/env python3
"""Wait for publication of this forum's single public ACME DNS-01 proof."""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

host = "forum.gtmgrowth.kayroslab.com"
if os.environ.get("CERTBOT_DOMAIN") != host or os.environ.get("FORUM_DNS_SESSION") != "1":
    sys.exit("Run the production forum workflow with DNS validation enabled to publish the TXT record.")

proof = os.environ["CERTBOT_VALIDATION"]
if not re.fullmatch(r"[A-Za-z0-9_-]{43}", proof):
    sys.exit("Unexpected ACME TXT format.")
pending = Path("/run/gtmgrowth-forum-acme/proof")
temporary = pending.with_suffix(".tmp")
temporary.write_text(proof)
temporary.replace(pending)
query = f"https://dns.google/resolve?name=_acme-challenge.{host}&type=TXT"
for attempt in range(100):
    try:
        with urllib.request.urlopen(query, timeout=8) as response:
            answers = json.load(response).get("Answer", [])
        if any(a.get("type") == 16 and a.get("data", "").strip('"') == proof for a in answers):
            time.sleep(35)
            sys.exit(0)
    except (OSError, ValueError):
        pass
    time.sleep(12)
sys.exit("The forum TXT record was not visible before the verification deadline.")
