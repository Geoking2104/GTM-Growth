#!/usr/bin/env python3
"""Patch a live gtm.kayroslab.com nginx vhost so MCP resource metadata is proxied.

Idempotent. Never prints certificate material or secrets. Exits 0 when the
live file already has the path-specific well-known location, or after a safe
insert into server blocks that already proxy the GTM Growth app (port 4300).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

LOCATION = (
    "  location ~ ^/\\.well-known/(poppy\\.json|oauth-protected-resource(/mcp)?"
    "|oauth-authorization-server/api/poppy/oauth)$ {\n"
    "    proxy_pass http://127.0.0.1:4300;\n"
    "    proxy_set_header Host $host;\n"
    "    proxy_set_header X-Real-IP $remote_addr;\n"
    "  }\n"
)
HAS_MCP_META = "oauth-protected-resource(/mcp)?"
APP_HINT = "127.0.0.1:4300"
SERVER_NAME_HINT = "gtm.kayroslab.com"


def iter_server_blocks(text: str) -> list[tuple[int, int, str]]:
    """Return (start, end, body) for each top-level server { ... } block."""
    blocks: list[tuple[int, int, str]] = []
    i, n = 0, len(text)
    while True:
        match = re.search(r"\bserver\s*\{", text[i:])
        if not match:
            break
        start = i + match.start()
        brace = i + match.end() - 1
        depth = 0
        j = brace
        while j < n:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    blocks.append((start, j + 1, text[start : j + 1]))
                    i = j + 1
                    break
            j += 1
        else:
            raise ValueError("unbalanced server block")
    return blocks


def summarize(text: str) -> list[str]:
    lines = []
    for idx, (_, _, body) in enumerate(iter_server_blocks(text), start=1):
        listens = re.findall(r"^\s*listen\s+([^;]+);", body, re.M)
        names = re.findall(r"^\s*server_name\s+([^;]+);", body, re.M)
        locations = re.findall(r"^\s*location\s+[^{]+", body, re.M)
        lines.append(
            f"server#{idx} listen={','.join(listens) or '?'} "
            f"server_name={','.join(names) or '?'} "
            f"proxies_app={APP_HINT in body} "
            f"has_mcp_meta={HAS_MCP_META in body} "
            f"locations={len(locations)}"
        )
        for loc in locations:
            compact = " ".join(loc.split())
            if any(token in compact for token in (".well-known", "/mcp", "/api/", "/console/", "/site-preview", "error_page")):
                lines.append(f"  {compact}")
    return lines


def patch_block(body: str) -> tuple[str, str]:
    """Return (new_body, action) for one server block."""
    if HAS_MCP_META in body:
        return body, "already"
    # Update a pre-existing well-known proxy that lacks the /mcp path.
    if "oauth-protected-resource" in body and "location" in body:

        def repl(match: re.Match[str]) -> str:
            line = match.group(0)
            if HAS_MCP_META in line:
                return line
            if "oauth-protected-resource" not in line:
                return line
            return line.replace("oauth-protected-resource", "oauth-protected-resource(/mcp)?", 1)

        updated, count = re.subn(r"location\s+~\s+\^/\\?\.well-known/[^\n{]+", repl, body)
        if count and HAS_MCP_META in updated:
            return updated, f"updated:{count}"
    if APP_HINT not in body or SERVER_NAME_HINT not in body:
        return body, "skipped"
    # Insert the location before the first app-related location, or before location /.
    anchors = [
        re.search(r"^\s*location\s+[^=][^\n]*\.well-known[^\n]*\{", body, re.M),
        re.search(r"^\s*location\s+/api/", body, re.M),
        re.search(r"^\s*location\s+~\s+\^/\(mcp", body, re.M),
        re.search(r"^\s*location\s+/console/", body, re.M),
        re.search(r"^\s*location\s+/\s*\{", body, re.M),
    ]
    anchor = next((m for m in anchors if m), None)
    if not anchor:
        return body, "no-anchor"
    insert_at = anchor.start()
    updated = body[:insert_at] + LOCATION + "\n" + body[insert_at:]
    return updated, "inserted"


def patch_text(text: str) -> tuple[str, list[str]]:
    actions: list[str] = []
    out = text
    # Patch from the end so earlier offsets stay valid.
    for start, end, body in reversed(iter_server_blocks(text)):
        new_body, action = patch_block(body)
        actions.append(action)
        if new_body != body:
            out = out[:start] + new_body + out[end:]
    actions.reverse()
    if HAS_MCP_META not in out:
        raise SystemExit("LIVE_WELLKNOWN_UNRECOGNIZED: could not add the MCP metadata location safely")
    return out, actions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    path = Path(args.path)
    text = path.read_text()
    for line in summarize(text):
        print(line)
    updated, actions = patch_text(text)
    print("actions=" + ",".join(actions))
    if updated == text:
        print("nginx well-known already includes /mcp")
        return 0
    if args.write:
        path.write_text(updated)
        print("nginx vhost written")
    else:
        print("nginx vhost would be updated (dry-run)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
