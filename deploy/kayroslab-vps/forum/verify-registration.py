"""Correlate one normal registration attempt with the challenge access logs."""
import json
import re
import subprocess
import sys
from contextlib import ExitStack
from pathlib import Path

HOST = "forum.gtmgrowth.kayroslab.com"
CHALLENGE = "/.well-known/discourse-id-challenge"
SHARED = Path("/var/discourse/shared/gtmgrowth-forum/log")
LOGS = {
    "rails": SHARED / "rails/production.log",
    "container nginx": SHARED / "var-log/nginx/access.log",
    "host nginx": Path("/var/log/nginx/access.log"),
}
SAFE_WORDS = set("""
you supplied invalid parameters to the request couldn't could not failed verify verifying validation
validate fetching fetch challenge token from domain hostname for site url callback redirect uri http
https connection connect opening read open timed out timeout by after seconds network unreachable
certificate ssl tls refused returned received response body json invalid mismatch doesn't match
unexpected bad status error remote server address is unavailable blocked private ip dns resolve
allowed endpoint ownership proof verification of at attempting to contact a an the was during
discourse id get well known connectiontimeout readtimeout execution expired end of file reached
logo small download image port forbidden retry domain_verification_failed
""".split())


def report_provider(lines):
    for line in lines.splitlines():
        status = re.search(r"Request to '(/register|/challenge)' failed: (\d{3})", line)
        if status:
            print("ID endpoint and status:", *status.groups())
        if 'Error: {' not in line:
            continue
        try:
            payload, _ = json.JSONDecoder().raw_decode(line.split("Error: ", 1)[1])
        except ValueError:
            continue
        for message in payload.get("errors", []) if isinstance(payload, dict) else []:
            if isinstance(message, str):
                words = re.findall(r"[a-z_']+", message.lower())[:100]
                print("ID error terms:", " ".join(w for w in words if w in SAFE_WORDS))


def observe(stream):
    # Cap memory even if another service is writing heavily to the shared nginx log.
    data = stream.read(2 * 1024 * 1024).decode(errors="replace")
    events = [s for s in data.splitlines() if re.search(
        r'\b(?:GET|HEAD) "?/\.well-known/discourse-id-challenge(?:[ ?"\x27])', s)]
    return data, len(events)


def main():
    with ExitStack() as stack:
        logs = {}
        for name, path in LOGS.items():
            if path.is_file():
                stream = stack.enter_context(path.open("rb"))
                stream.seek(0, 2)
                logs[name] = stream
        with open("first-login.rb", "rb") as script:
            result = subprocess.run([
                "timeout", "100", "docker", "exec", "-i", "--user", "discourse", "--workdir",
                "/var/www/discourse", "gtmgrowth-forum", "bundle", "exec", "rails", "runner", "-"
            ], stdin=script)
        if result.returncode == 0:
            return 0
        attempts = {}
        for name, stream in logs.items():
            lines, attempts[name] = observe(stream)
            if name == "rails":
                report_provider(lines)
        # A local control distinguishes zero incoming requests from an unreadable log.
        subprocess.run(["curl", "-sS", "--max-time", "8", "--resolve", f"{HOST}:443:127.0.0.1",
                        "-o", "/dev/null", "-w", "Challenge control HTTP %{http_code}\\n",
                        f"https://{HOST}{CHALLENGE}"])
        for name, stream in logs.items():
            _, controls = observe(stream)
            print(f"{name}: challenge requests during registration={attempts[name]}, control={controls}")
        return result.returncode


if __name__ == "__main__":
    sys.exit(main())
