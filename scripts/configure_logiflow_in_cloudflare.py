#!/usr/bin/env python3
"""
DEPRECATED — LogiFlow no longer uses Cloudflare Workers in the production path.

Production API: GCP Cloud Run (see docs/deployment.md). Vercel env vars point
directly at the Cloud Run URL.

This script only remains for teams that still host DNS on Cloudflare and want
api.logiflow.in as a CNAME to a backend. Prefer pointing the domain at Cloud Run
or a GCP HTTPS Load Balancer with Cloud Armor for edge DDoS.

Usage (legacy):
  export CLOUDFLARE_API_TOKEN="..."   # Zone:Edit on logiflow.in
  python scripts/configure_logiflow_in_cloudflare.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

ZONE_NAME = "logiflow.in"
API_SUBDOMAIN = "api"
RENDER_CNAME_TARGET = "logiflow-solution-challenge-2026.onrender.com"
API_BASE = "https://api.cloudflare.com/client/v4"


def _request(method: str, path: str, body: dict | None = None) -> dict:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        print("ERROR: Set CLOUDFLARE_API_TOKEN (Zone DNS Edit + Zone Settings Edit).", file=sys.stderr)
        sys.exit(1)

    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode()
        print(f"HTTP {exc.code} {method} {path}\n{payload}", file=sys.stderr)
        sys.exit(1)


def get_zone_id() -> str:
    data = _request("GET", f"/zones?name={ZONE_NAME}")
    zones = data.get("result") or []
    if not zones:
        print(
            f"Zone '{ZONE_NAME}' not found on this Cloudflare account.\n"
            "Add it at https://dash.cloudflare.com → Add a site, then point GoDaddy NS to Cloudflare.",
            file=sys.stderr,
        )
        sys.exit(1)
    zone = zones[0]
    print(f"Zone: {zone['name']} ({zone['id']}) status={zone['status']}")
    if zone["status"] != "active":
        print("WARNING: Zone is not active yet — update nameservers at GoDaddy and wait.")
    return zone["id"]


def upsert_cname(zone_id: str) -> None:
    fqdn = f"{API_SUBDOMAIN}.{ZONE_NAME}"
    existing = _request("GET", f"/zones/{zone_id}/dns_records?type=CNAME&name={fqdn}")
    records = existing.get("result") or []
    payload = {
        "type": "CNAME",
        "name": API_SUBDOMAIN,
        "content": RENDER_CNAME_TARGET,
        "proxied": True,
        "ttl": 1,
    }
    if records:
        rid = records[0]["id"]
        _request("PUT", f"/zones/{zone_id}/dns_records/{rid}", payload)
        print(f"Updated CNAME {fqdn} → {RENDER_CNAME_TARGET} (proxied)")
    else:
        _request("POST", f"/zones/{zone_id}/dns_records", payload)
        print(f"Created CNAME {fqdn} → {RENDER_CNAME_TARGET} (proxied)")


def patch_setting(zone_id: str, setting_id: str, value: str) -> None:
    _request("PATCH", f"/zones/{zone_id}/settings/{setting_id}", {"value": value})
    print(f"Setting {setting_id} = {value}")


def main() -> None:
    zone_id = get_zone_id()
    upsert_cname(zone_id)
    patch_setting(zone_id, "ssl", "full")
    patch_setting(zone_id, "always_use_https", "on")
    patch_setting(zone_id, "security_level", "medium")
    patch_setting(zone_id, "min_tls_version", "1.2")

    api_url = f"https://{API_SUBDOMAIN}.{ZONE_NAME}"
    print("\n✅ Cloudflare DNS + SSL configured.")
    print(f"   API URL: {api_url}")
    print("\nNext steps:")
    print("  1. Render → Custom Domains → verify api.logiflow.in")
    print(f"  2. Vercel → BACKEND_URL + NEXT_PUBLIC_API_URL = {api_url}")
    print("  3. GitHub → Secrets → BACKEND_URL = same URL")
    print(f"  4. curl -I {api_url}/health  (look for server: cloudflare)")


if __name__ == "__main__":
    main()
