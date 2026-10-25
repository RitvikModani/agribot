"""Prove the database rules against the real Supabase project.

Needs two test users created in Supabase → Authentication → Users (signups are off):
    set SUPABASE_URL=https://<project>.supabase.co
    set SUPABASE_ANON_KEY=<anon public key>
    set USER_A_EMAIL=... & set USER_A_PASSWORD=...
    set USER_B_EMAIL=... & set USER_B_PASSWORD=...
    python supabase/tests/rls_check.py
Exit code 0 only if every check passes. Creates and then deletes one test device.
"""
from __future__ import annotations

import os
import sys
import uuid

import httpx

URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["SUPABASE_ANON_KEY"]
TABLES = ("devices", "device_state", "captures")
results: list[tuple[bool, str]] = []


def check(ok: bool, what: str) -> None:
    results.append((ok, what))
    print(f"{'PASS' if ok else 'FAIL'}  {what}")


def client(token: str | None = None) -> httpx.Client:
    headers = {"apikey": ANON, "Authorization": f"Bearer {token or ANON}"}
    return httpx.Client(base_url=URL, headers=headers, timeout=20)


def sign_in(email: str, password: str) -> str:
    r = client().post("/auth/v1/token", params={"grant_type": "password"},
                      json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def main() -> int:
    anon = client()
    for table in TABLES:
        r = anon.get(f"/rest/v1/{table}", params={"select": "*"})
        check(r.status_code in (401, 403) or r.json() == [], f"anon cannot read {table} (HTTP {r.status_code})")

    a = client(sign_in(os.environ["USER_A_EMAIL"], os.environ["USER_A_PASSWORD"]))
    b = client(sign_in(os.environ["USER_B_EMAIL"], os.environ["USER_B_PASSWORD"]))

    r = a.post("/rest/v1/rpc/create_device", json={"p_name": "rls-check"})
    token = r.json() if r.status_code == 200 else ""
    check(isinstance(token, str) and token.startswith("agb_") and len(token) == 47, "create_device returns an agb_ token")

    devices = a.get("/rest/v1/devices", params={"select": "id,token_hash", "name": "eq.rls-check"}).json()
    check(len(devices) == 1, "user A sees their new device")
    device_id = devices[0]["id"] if devices else str(uuid.uuid4())
    check(bool(devices) and devices[0]["token_hash"] != token, "plaintext token is not stored")

    for table, key in (("devices", "id"), ("device_state", "device_id"), ("captures", "device_id")):
        rows = b.get(f"/rest/v1/{table}", params={"select": "*", key: f"eq.{device_id}"}).json()
        check(rows == [], f"user B cannot read user A's {table}")

    r = b.patch("/rest/v1/device_state", params={"device_id": f"eq.{device_id}"},
                json={"patrol_on": True}, headers={"Prefer": "return=representation"})
    check(r.status_code in (401, 403) or r.json() == [], "user B cannot change user A's device_state")

    r = b.post("/rest/v1/rpc/rotate_device_token", json={"p_device_id": device_id})
    check(r.status_code >= 400, "user B cannot rotate user A's token")

    r = a.post("/rest/v1/captures", json={
        "id": str(uuid.uuid4()), "device_id": device_id, "owner": "00000000-0000-0000-0000-000000000000",
        "image_path": "x", "label": "healthy", "confidence": 1, "verdict": "confident",
        "leaf_fraction": 1, "top3": [], "model_version": "x"})
    check(r.status_code in (401, 403), f"user A cannot insert captures directly (HTTP {r.status_code})")

    r = a.patch("/rest/v1/devices", params={"id": f"eq.{device_id}"}, json={"token_hash": "x"})
    check(r.status_code in (401, 403), f"user A cannot overwrite token_hash (HTTP {r.status_code})")

    a.delete("/rest/v1/devices", params={"id": f"eq.{device_id}"})
    failed = [w for ok, w in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
