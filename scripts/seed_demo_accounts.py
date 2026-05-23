#!/usr/bin/env python3
"""Seed demo users with public SteamID64 accounts.

The script intentionally uses public HTTP APIs instead of direct DB writes so
the same flows used by the site are exercised: registration, login, profile
update, manual Steam link, Steam sync, coach approval and coach profile fill.

Inputs:
  data/ru_steam_accounts.csv with columns:
    nickname,steam_id64,segment

Outputs:
  secrets/demo_accounts_<timestamp>.csv with generated credentials.

The output file is intentionally under secrets/ which is gitignored.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import re
import secrets
import string
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


DEFAULT_ROLES = ["POS1", "POS2", "POS3", "POS4", "POS5"]
FIRST_NAMES = [
    "ivan", "pavel", "nikita", "andrey", "dmitry", "kirill", "roman", "egor", "maxim", "timur",
    "artem", "mikhail", "denis", "ilya", "anton", "sergey", "vlad", "alex", "danil", "mark",
]
LAST_NAMES = [
    "morozov", "sokolov", "volkov", "orlov", "smirnov", "novikov", "fedorov", "belov", "egorov", "komarov",
    "kuznetsov", "ivanov", "petrov", "antonov", "zaitsev", "romanov", "titov", "nikitin", "gromov", "filatov",
]
DOMAINS = ["gmail.com", "proton.me", "mailbox.org", "outlook.com", "fastmail.com"]


class ApiError(RuntimeError):
    pass


def request_json(method: str, base_url: str, path: str, *, token: str | None = None, body: dict | None = None, timeout: int = 120, insecure_tls: bool = False) -> dict:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    if insecure_tls:
        cmd = ["curl", "-fsS", "-X", method.upper(), url, "-H", "Content-Type: application/json"]
        if token:
            cmd.extend(["-H", f"Authorization: Bearer {token}"])
        if body is not None:
            cmd.extend(["--data", json.dumps(body)])
        cmd.append("-k")
        try:
            raw = subprocess.check_output(cmd, text=True, timeout=timeout, stderr=subprocess.STDOUT)
            return json.loads(raw) if raw.strip() else {}
        except subprocess.CalledProcessError as exc:
            raise ApiError(f"{method} {path} failed via curl: {exc.output.strip()}") from exc

    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise ApiError(f"{method} {path} -> HTTP {exc.code}: {raw}") from exc
    except URLError as exc:
        raise ApiError(f"{method} {path} failed: {exc}") from exc


def retry_json(method: str, base_url: str, path: str, *, token: str | None = None, body: dict | None = None, retries: int = 4, insecure_tls: bool = False) -> dict:
    for attempt in range(retries):
        try:
            return request_json(method, base_url, path, token=token, body=body, insecure_tls=insecure_tls)
        except ApiError as exc:
            text = str(exc)
            if "HTTP 429" in text and attempt < retries - 1:
                time.sleep(10 + attempt * 10)
                continue
            raise
    raise AssertionError("unreachable")


def read_accounts(path: Path, limit: int) -> list[dict]:
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            steam_id = (row.get("steam_id64") or "").strip()
            if not steam_id or not steam_id.isdigit():
                continue
            rows.append({
                "nickname": (row.get("nickname") or f"player{len(rows)+1}").strip(),
                "steam_id64": steam_id,
                "segment": (row.get("segment") or "ru-speaking-public").strip(),
            })
    if len(rows) < limit:
        raise SystemExit(f"Need at least {limit} valid SteamID64 rows in {path}; found {len(rows)}")
    seen = set()
    unique = []
    for row in rows:
        if row["steam_id64"] in seen:
            continue
        seen.add(row["steam_id64"])
        unique.append(row)
    if len(unique) < limit:
        raise SystemExit(f"Need {limit} unique SteamID64 rows in {path}; found {len(unique)}")
    return unique[:limit]


def make_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Rp!" + "".join(secrets.choice(alphabet) for _ in range(14))


def make_identity(i: int, nickname: str) -> tuple[str, str]:
    base = re.sub(r"[^a-z0-9]+", "", nickname.lower())
    if len(base) < 4:
        first = FIRST_NAMES[(i - 1) % len(FIRST_NAMES)]
        last = LAST_NAMES[(i - 1) % len(LAST_NAMES)]
        base = f"{first}.{last}"
    domain = DOMAINS[(i - 1) % len(DOMAINS)]
    suffix = f"{i:02d}{random.randint(10, 99)}"
    login = f"{base[:18]}{suffix}"
    email = f"{base[:24]}.{suffix}@{domain}"
    return login, email


def login(base_url: str, email: str, password: str, insecure_tls: bool = False) -> str:
    data = retry_json("POST", base_url, "/auth/login", body={"email": email, "password": password}, insecure_tls=insecure_tls)
    return data["access_token"]


def register_or_login(base_url: str, *, login_name: str, email: str, password: str, role: str, insecure_tls: bool = False) -> tuple[int | None, str]:
    body = {
        "login": login_name,
        "email": email,
        "password": password,
        "confirm_password": password,
        "role": role,
        "consent_accepted": True,
        "consent_version": "demo-2026-05",
    }
    auth_user_id = None
    try:
        data = retry_json("POST", base_url, "/auth/register", body=body, insecure_tls=insecure_tls)
        auth_user_id = int(data["id"])
        # Registration is rate-limited: be gentle even on success.
        time.sleep(3.5)
    except ApiError as exc:
        if "HTTP 409" not in str(exc):
            raise
    return auth_user_id, login(base_url, email, password, insecure_tls=insecure_tls)


def seed_accounts(args: argparse.Namespace) -> Path:
    rows = read_accounts(Path(args.accounts_file), args.users)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"demo_accounts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    admin_token = None
    if args.admin_email and args.admin_password:
        admin_token = login(args.base_url, args.admin_email, args.admin_password, insecure_tls=args.insecure_tls)

    fieldnames = [
        "index", "email", "login", "password", "initial_role", "coach_candidate",
        "nickname_source", "steam_id64", "dota_account_id", "link_status", "desired_role",
    ]
    output_rows: list[dict[str, str]] = []

    def write_output() -> None:
        tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
        with tmp_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(output_rows)
        tmp_path.replace(out_path)

    for idx, row in enumerate(rows, start=1):
        coach_candidate = idx <= args.coach_applicants
        role = "COACH" if coach_candidate else "PLAYER"
        login_name, email = make_identity(idx, row["nickname"])
        password = make_password()

        print(f"[{idx}/{args.users}] register {email} role={role} steam={row['steam_id64']}", flush=True)
        output_row = {
            "index": idx,
            "email": email,
            "login": login_name,
            "password": password,
            "initial_role": role,
            "coach_candidate": "yes" if coach_candidate else "no",
            "nickname_source": row["nickname"],
            "steam_id64": row["steam_id64"],
            "dota_account_id": "",
            "link_status": "not_started",
            "desired_role": DEFAULT_ROLES[(idx - 1) % len(DEFAULT_ROLES)],
        }
        output_rows.append({k: str(v) for k, v in output_row.items()})
        write_output()

        auth_user_id, token = register_or_login(
            args.base_url,
            login_name=login_name,
            email=email,
            password=password,
            role=role,
            insecure_tls=args.insecure_tls,
        )

        profile_role = output_row["desired_role"]
        retry_json("POST", args.base_url, "/player/profile", token=token, insecure_tls=args.insecure_tls, body={
            "desired_rank_tier": "IMMORTAL" if coach_candidate else "ANCIENT",
            "desired_roles": [profile_role],
            "training_goals": ["demo-load-test", "ranked-analysis"],
            "about": f"Demo presentation account. Public Steam data source: {row['segment']}.",
        })

        link_status = "not_attempted"
        linked_account_id = None
        try:
            link_data = retry_json("POST", args.base_url, "/player/link-steam", token=token, insecure_tls=args.insecure_tls, body={
                "steam_id": row["steam_id64"],
                "trusted": False,
            })
            link_status = "linked" if not link_data.get("error") else f"error:{link_data.get('error')}"
            linked_account_id = link_data.get("account_id")
        except ApiError as exc:
            link_status = f"error:{str(exc)[:180]}"

        if coach_candidate and admin_token and auth_user_id:
            try:
                retry_json("POST", args.base_url, f"/admin/coaches/{auth_user_id}/verify", token=admin_token, insecure_tls=args.insecure_tls, body={})
                # Re-login after role flip so token contains COACH.
                coach_token = login(args.base_url, email, password, insecure_tls=args.insecure_tls)
                retry_json("POST", args.base_url, "/coach/profile", token=coach_token, insecure_tls=args.insecure_tls, body={
                    "mmr_estimate": 6500 - idx * 100,
                    "rank_tier": "IMMORTAL",
                    "main_roles": [profile_role, "POS5" if profile_role != "POS5" else "POS4"],
                    "hero_pool": ["Crystal Maiden", "Shadow Fiend", "Mirana", "Pudge"],
                    "hourly_rate": 1200 + idx * 250,
                    "experience_years": 3 + idx,
                    "about": "Русскоязычный демо-тренер для проверки каталога, заявок и сессий.",
                })
            except ApiError as exc:
                print(f"  coach approval/profile failed: {exc}", flush=True)

        output_row.update({
            "dota_account_id": linked_account_id or "",
            "link_status": link_status,
        })
        output_rows = [r for r in output_rows if r["index"] != str(idx)]
        output_rows.append({k: str(v) for k, v in output_row.items()})
        output_rows.sort(key=lambda r: int(r["index"]))
        write_output()

    return out_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed demo accounts for RuPrime presentation/load checks.")
    parser.add_argument("--base-url", default="https://ru-prime.ru", help="Public site/API base URL")
    parser.add_argument("--accounts-file", default="data/ru_steam_accounts.csv", help="CSV with nickname,steam_id64,segment")
    parser.add_argument("--out-dir", default="secrets", help="Where credentials CSV is written")
    parser.add_argument("--users", type=int, default=50)
    parser.add_argument("--coach-applicants", type=int, default=5)
    parser.add_argument("--admin-email", default="")
    parser.add_argument("--admin-password", default="")
    parser.add_argument("--insecure-tls", action="store_true", help="Use curl -k for local environments with custom CA issues")
    args = parser.parse_args()

    if args.coach_applicants > args.users:
        raise SystemExit("--coach-applicants cannot exceed --users")

    out = seed_accounts(args)
    print(f"Credentials written to: {out}")
    print("Do not commit this file.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
