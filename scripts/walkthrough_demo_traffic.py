#!/usr/bin/env python3
"""Simulate one day of believable demo-account traffic on RuPrime.

Designed to be invoked once per day (e.g. from cron at 08:00 MSK). Each
run plans a single day's window 08:00 -> 03:00 next-day MSK and walks a
subset of accounts from `secrets/demo_accounts_*.csv` through the site:

* Each account gets a *persistent* persona (heavy/regular/casual/
  dormant) on first sight; the assignment is stored in a state file and
  reused on every later run, so the same accounts stay "the same kind
  of user" across days.
* Per day every account does 0, 1 or up to 2 short visits (never more),
  scattered across the day window. Many accounts skip the day entirely.
* Each visit is a longer browse than before (typically 6-14 page
  transitions) with random dwell times. Inside a visit the user may
  send 0/1/2 messages to /ai/chat (one is the common case, two is rare,
  zero is also fine) - never more than 2 per visit.
* Very rarely (a few % of player visits, and only if not already
  engaged) the user opens /coaches and submits a real training request
  via POST /matchmaking/requests. The coach to whom the request was
  sent then logs in later in the day and approves it via PATCH
  /matchmaking/requests/{id} with action=CHOOSE_COACH and a scheduled
  datetime. After that, the player is marked "engaged" for several
  days and switches to a persona with more visits / more pages.

State is kept in `secrets/walkthrough_state.json` (gitignored): persona
mapping, coach profile ids, current engagements (with expiry).

Run --dry-run to inspect today's plan without touching the network.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


MSK = timezone(timedelta(hours=3))


# --- Site map -------------------------------------------------------------

PAGE_GETS: dict[str, list[str]] = {
    "dashboard": ["/me/overview", "/player/steam-data", "/player/profile"],
    "stats": ["/me/overview", "/player/steam-data"],
    "coaches": ["/coaches", "/player/steam-data"],
    "requests": ["/matchmaking/requests/my"],
    "schedule": ["/training-sessions/my"],
    "settings": ["/player/profile", "/player/steam-data"],
    "ai-chat": ["/ai/history"],
}

# Markov-ish transitions. Stay-on-page weights are higher than before so
# users wander more; ai-chat stickiness is lower because LLM is rare.
PAGE_TRANSITIONS: dict[str, list[tuple[str, float]]] = {
    "dashboard": [
        ("stats", 0.32), ("coaches", 0.16), ("requests", 0.10),
        ("schedule", 0.08), ("settings", 0.08), ("ai-chat", 0.10),
        ("close", 0.16),
    ],
    "stats": [
        ("dashboard", 0.35), ("ai-chat", 0.18), ("coaches", 0.18),
        ("settings", 0.10), ("schedule", 0.07), ("close", 0.12),
    ],
    "coaches": [
        ("requests", 0.25), ("dashboard", 0.25), ("schedule", 0.12),
        ("ai-chat", 0.10), ("settings", 0.08), ("close", 0.20),
    ],
    "requests": [
        ("coaches", 0.30), ("dashboard", 0.30), ("schedule", 0.18),
        ("settings", 0.07), ("close", 0.15),
    ],
    "schedule": [
        ("dashboard", 0.40), ("requests", 0.22), ("coaches", 0.15),
        ("settings", 0.08), ("close", 0.15),
    ],
    "settings": [
        ("dashboard", 0.50), ("stats", 0.20), ("schedule", 0.10),
        ("close", 0.20),
    ],
    "ai-chat": [
        ("dashboard", 0.35), ("stats", 0.30), ("coaches", 0.10),
        ("settings", 0.08), ("close", 0.17),
    ],
}


LLM_PROMPTS = [
    "Что у меня просело по фарму за последние 50 каток?",
    "Дай разбор моих слабых сторон в керри-роли.",
    "Какой герой даёт мне самый высокий винрейт и почему?",
    "Посмотри последние ranked-матчи, где я плохо отыграл лейн.",
    "Сравни мой GPM/XPM с медианой моего ранга.",
    "Что мне исправить в макроигре в первые 15 минут?",
    "Стоит ли мне пробовать 3 позицию на основе статы?",
    "Какие герои контрят мой пул? Что добавить?",
    "Почему у меня плохая статистика на Pudge — стоит ли удалять?",
    "Нужны 2 короткие тренировки по фарм-патернам, что предложишь?",
    "Где я больше всего теряю темп: лейн, мид-гейм или тимфайты?",
    "Дай план тренировок на эту неделю исходя из моих гэпов.",
]

REQUEST_FOCUS_AREAS = [
    "lane_control", "macro", "hero_pool", "teamfight", "communication",
]
REQUEST_MESSAGES = [
    "Хочу разбор последних каток, особенно лейн.",
    "Прошу помочь с переходом в новую роль.",
    "Нужен взгляд со стороны на мои тимфайты.",
    "Готов взять разбор по моему пулу героев.",
    "Хочу системно потренировать макроигру.",
]


# --- Personas -------------------------------------------------------------

@dataclass(frozen=True)
class Persona:
    name: str
    visits_per_day_dist: tuple[float, float, float]   # P(0), P(1), P(2)
    pages_per_visit: tuple[int, int]
    llm_msgs_dist: tuple[float, float, float]         # P(0), P(1), P(2)
    coach_request_chance: float                       # per visit, only if not engaged
    logout_chance: float


PERSONAS: dict[str, Persona] = {
    "heavy":   Persona("heavy",   (0.10, 0.45, 0.45), (8, 15), (0.15, 0.65, 0.20), 0.06, 0.30),
    "regular": Persona("regular", (0.30, 0.55, 0.15), (6, 12), (0.25, 0.65, 0.10), 0.04, 0.40),
    "casual":  Persona("casual",  (0.60, 0.35, 0.05), (5, 10), (0.45, 0.50, 0.05), 0.02, 0.55),
    "dormant": Persona("dormant", (0.85, 0.14, 0.01), (3, 7),  (0.75, 0.25, 0.00), 0.01, 0.70),
    "engaged": Persona("engaged", (0.10, 0.50, 0.40), (8, 16), (0.15, 0.60, 0.25), 0.00, 0.30),
}


def choose_weighted(dist: tuple[float, ...]) -> int:
    r = random.random()
    cum = 0.0
    for i, p in enumerate(dist):
        cum += p
        if r <= cum:
            return i
    return len(dist) - 1


def parse_persona_mix(spec: str) -> dict[str, float]:
    parts = [p.strip() for p in spec.split(",") if p.strip()]
    weights: dict[str, float] = {}
    for part in parts:
        if "=" not in part:
            raise argparse.ArgumentTypeError(f"bad persona-mix item: {part!r}")
        name, raw = part.split("=", 1)
        name = name.strip().lower()
        if name not in PERSONAS or name == "engaged":
            raise argparse.ArgumentTypeError(f"unknown persona {name!r} (engaged is internal-only)")
        weights[name] = float(raw)
    if not weights:
        raise argparse.ArgumentTypeError("persona-mix is empty")
    total = sum(weights.values())
    if total <= 0:
        raise argparse.ArgumentTypeError("persona-mix weights sum to zero")
    return {k: v / total for k, v in weights.items()}


# --- Persistent state -----------------------------------------------------

@dataclass
class PersistentState:
    personas: dict[str, str] = field(default_factory=dict)         # email -> persona name
    coach_profile_ids: dict[str, int] = field(default_factory=dict)  # coach email -> CoachProfile.id
    engagements: dict[str, dict[str, Any]] = field(default_factory=dict)  # email -> info


def load_state(path: Path) -> PersistentState:
    if not path.exists():
        return PersistentState()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return PersistentState()
    return PersistentState(
        personas=dict(raw.get("personas") or {}),
        coach_profile_ids={k: int(v) for k, v in (raw.get("coach_profile_ids") or {}).items()},
        engagements={k: dict(v) for k, v in (raw.get("engagements") or {}).items()},
    )


def save_state(path: Path, state: PersistentState) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "personas": state.personas,
        "coach_profile_ids": state.coach_profile_ids,
        "engagements": state.engagements,
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def is_engaged(state: PersistentState, email: str, now: datetime) -> bool:
    eng = state.engagements.get(email)
    if not eng:
        return False
    expires_iso = eng.get("expires_at")
    if not expires_iso:
        return True
    try:
        expires = datetime.fromisoformat(expires_iso)
    except ValueError:
        return True
    return expires > now


# --- Auth + HTTP helpers --------------------------------------------------

class ApiError(RuntimeError):
    def __init__(self, status: int | None, message: str) -> None:
        super().__init__(message)
        self.status = status


def _request(
    method: str,
    base_url: str,
    path: str,
    *,
    token: str | None = None,
    body: dict | None = None,
    timeout: int = 60,
    insecure_tls: bool = False,
) -> Any:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    data = None
    headers = {"Accept": "application/json", "User-Agent": "ruprime-walkthrough/2.0"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if insecure_tls:
        import subprocess
        cmd = ["curl", "-fsS", "-X", method.upper(), url, "-k"]
        for k, v in headers.items():
            cmd.extend(["-H", f"{k}: {v}"])
        if data is not None:
            cmd.extend(["--data", data.decode("utf-8")])
        try:
            raw = subprocess.check_output(cmd, text=True, timeout=timeout, stderr=subprocess.STDOUT)
            return json.loads(raw) if raw.strip() else {}
        except subprocess.CalledProcessError as exc:
            text = (exc.output or "").strip()
            status = None
            if "returned error: " in text:
                tail = text.rsplit("returned error: ", 1)[-1].strip()
                head = tail.split(" ", 1)[0]
                if head.isdigit():
                    status = int(head)
            raise ApiError(status, f"{method} {path} via curl: {text[:200]}") from exc

    req = Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return {}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"_raw": raw}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")[:200]
        raise ApiError(exc.code, f"{method} {path} -> HTTP {exc.code}: {raw}") from exc
    except URLError as exc:
        raise ApiError(None, f"{method} {path} failed: {exc}") from exc


# --- Per-account session --------------------------------------------------

@dataclass
class Session:
    index: int
    email: str
    password: str
    nickname: str
    role: str
    desired_role: str
    dota_account_id: str
    persona: Persona
    base_persona_name: str
    engaged_today: bool = False
    access_token: str = ""
    refresh_token: str = ""
    profile_id: int | None = None
    visits_done: int = 0
    pages_total: int = 0
    llm_total: int = 0
    requested_coach_today: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)


def login(base_url: str, sess: Session, *, insecure_tls: bool) -> None:
    data = _request(
        "POST", base_url, "/auth/login",
        body={"email": sess.email, "password": sess.password},
        insecure_tls=insecure_tls,
    )
    sess.access_token = data["access_token"]
    sess.refresh_token = data.get("refresh_token", "")


def refresh(base_url: str, sess: Session, *, insecure_tls: bool) -> None:
    if not sess.refresh_token:
        login(base_url, sess, insecure_tls=insecure_tls)
        return
    try:
        data = _request(
            "POST", base_url, "/auth/refresh",
            body={"refresh_token": sess.refresh_token},
            insecure_tls=insecure_tls,
        )
    except ApiError as exc:
        if exc.status in (401, 403):
            login(base_url, sess, insecure_tls=insecure_tls)
            return
        raise
    sess.access_token = data["access_token"]
    sess.refresh_token = data.get("refresh_token", sess.refresh_token)


def call(
    method: str, base_url: str, path: str, sess: Session, *,
    body: dict | None = None, insecure_tls: bool = False, timeout: int = 60,
) -> Any:
    if not sess.access_token:
        login(base_url, sess, insecure_tls=insecure_tls)
    try:
        return _request(method, base_url, path, token=sess.access_token, body=body,
                        insecure_tls=insecure_tls, timeout=timeout)
    except ApiError as exc:
        if exc.status in (401, 419):
            refresh(base_url, sess, insecure_tls=insecure_tls)
            return _request(method, base_url, path, token=sess.access_token, body=body,
                            insecure_tls=insecure_tls, timeout=timeout)
        raise


# --- Story building blocks -----------------------------------------------

def pick_next_page(current: str) -> str:
    table = PAGE_TRANSITIONS[current]
    r = random.random()
    cum = 0.0
    for name, p in table:
        cum += p
        if r <= cum:
            return name
    return table[-1][0]


def pick_path(name: str) -> str:
    return {
        "dashboard": "/dashboard", "stats": "/stats", "coaches": "/coaches",
        "requests": "/requests", "schedule": "/schedule", "settings": "/settings",
        "ai-chat": "/ai-chat",
    }[name]


def emit_page_view(base_url: str, sess: Session, page: str, *, insecure_tls: bool) -> None:
    payload = {
        "event_type": "page_view",
        "path": pick_path(page),
        "metadata": {
            "synthetic": True,
            "user_index": sess.index,
            "persona": sess.persona.name,
            "ts": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        },
    }
    try:
        _request("POST", base_url, "/public/client-event", body=payload,
                 insecure_tls=insecure_tls, timeout=15)
    except ApiError:
        pass


def visit_page(
    base_url: str, sess: Session, page: str, *,
    insecure_tls: bool, log: Callable[[str], None],
) -> None:
    emit_page_view(base_url, sess, page, insecure_tls=insecure_tls)
    for endpoint in PAGE_GETS[page]:
        try:
            call("GET", base_url, endpoint, sess, insecure_tls=insecure_tls, timeout=20)
        except ApiError as exc:
            log(f"{page} GET {endpoint} -> {exc}")

    if page in ("dashboard", "stats") and sess.profile_id:
        params = "mode=ranked&period=50"
        try:
            call("GET", base_url, f"/player/{sess.profile_id}/stats/overview?{params}",
                 sess, insecure_tls=insecure_tls, timeout=45)
        except ApiError as exc:
            log(f"{page} stats/overview -> {exc}")
        try:
            call("GET", base_url, f"/player/{sess.profile_id}/detailed-features?{params}",
                 sess, insecure_tls=insecure_tls, timeout=45)
        except ApiError as exc:
            log(f"{page} detailed-features -> {exc}")

    if page == "coaches":
        try:
            call("POST", base_url, "/matchmaking/recommend-preview", sess,
                 body={"desired_roles": [sess.desired_role or "POS1"], "use_ai_coach": False},
                 insecure_tls=insecure_tls, timeout=30)
        except ApiError as exc:
            log(f"coaches recommend-preview -> {exc}")


def hydrate_profile(base_url: str, sess: Session, *, insecure_tls: bool, log: Callable[[str], None]) -> None:
    try:
        call("GET", base_url, "/auth/me", sess, insecure_tls=insecure_tls, timeout=15)
    except ApiError as exc:
        log(f"auth/me -> {exc}")
    try:
        data = call("GET", base_url, "/me/overview", sess, insecure_tls=insecure_tls, timeout=20)
    except ApiError as exc:
        log(f"me/overview -> {exc}")
        return
    if not isinstance(data, dict):
        return
    for key in ("player_profile_id", "profile_id", "id", "player_id"):
        val = data.get(key)
        if isinstance(val, int):
            sess.profile_id = val
            return
    for parent_key in ("profile", "player", "player_profile"):
        parent = data.get(parent_key)
        if isinstance(parent, dict):
            for key in ("id", "player_profile_id", "profile_id"):
                val = parent.get(key)
                if isinstance(val, int):
                    sess.profile_id = val
                    return


def ask_llm_messages(
    base_url: str, sess: Session, n: int, *,
    insecure_tls: bool, log: Callable[[str], None], time_scale: float,
) -> None:
    for _ in range(n):
        time.sleep(scaled_dwell(2.0, 6.0, time_scale))
        prompt = random.choice(LLM_PROMPTS)
        log(f"ai-chat -> {prompt!r}")
        try:
            resp = call("POST", base_url, "/ai/chat", sess,
                        body={"message": prompt, "context_mode": "AUTO"},
                        insecure_tls=insecure_tls, timeout=90)
        except ApiError as exc:
            log(f"ai-chat failed: {exc}")
            return
        sess.llm_total += 1
        if isinstance(resp, dict):
            status = resp.get("llm_status", "?")
            remaining = resp.get("requests_remaining_today")
            summary = (resp.get("advice_summary") or "").replace("\n", " ")[:90]
            log(f"ai-chat ok status={status} remaining={remaining} summary={summary!r}")


def maybe_submit_coach_request(
    base_url: str, sess: Session, *,
    state: PersistentState, state_lock: threading.Lock,
    insecure_tls: bool, log: Callable[[str], None], engagement_days: int,
) -> None:
    """Open /coaches, pick one and create a real training request."""
    try:
        coaches = call("GET", base_url, "/coaches", sess, insecure_tls=insecure_tls, timeout=20)
    except ApiError as exc:
        log(f"submit-request: GET /coaches -> {exc}")
        return
    if not isinstance(coaches, list) or not coaches:
        log("submit-request: empty /coaches response, abort")
        return
    coach = random.choice(coaches)
    coach_profile_id = coach.get("id")
    if not isinstance(coach_profile_id, int):
        log("submit-request: coach without id, abort")
        return
    body = {
        "preferred_coach_profile_id": coach_profile_id,
        "desired_role": sess.desired_role or "POS1",
        "focus_area": random.choice(REQUEST_FOCUS_AREAS),
        "message": random.choice(REQUEST_MESSAGES),
        "use_ai_coach": False,
    }
    try:
        resp = call("POST", base_url, "/matchmaking/requests", sess,
                    body=body, insecure_tls=insecure_tls, timeout=30)
    except ApiError as exc:
        log(f"submit-request failed: {exc}")
        return
    request_id = resp.get("id") if isinstance(resp, dict) else None
    status = resp.get("status") if isinstance(resp, dict) else None
    log(f"submit-request OK id={request_id} status={status} -> coach_profile={coach_profile_id}")
    sess.requested_coach_today = True
    expires_at = (datetime.now(MSK) + timedelta(days=engagement_days)).isoformat()
    with state_lock:
        state.engagements[sess.email] = {
            "request_id": request_id,
            "coach_profile_id": coach_profile_id,
            "submitted_at": datetime.now(MSK).isoformat(),
            "accepted_at": None,
            "expires_at": expires_at,
        }


def scaled_dwell(lo: float, hi: float, time_scale: float) -> float:
    return random.uniform(lo, hi) / max(1.0, time_scale)


# --- One player visit -----------------------------------------------------

def run_visit(
    sess: Session, *,
    base_url: str, insecure_tls: bool, print_lock: threading.Lock,
    state: PersistentState, state_lock: threading.Lock,
    state_path: Path, time_scale: float, engagement_days: int,
) -> None:
    def log(msg: str) -> None:
        line = (
            f"[{datetime.now().strftime('%H:%M:%S')}] u{sess.index:02d} "
            f"{sess.persona.name:<7} {sess.nickname[:18]:<18} | {msg}"
        )
        with print_lock:
            print(line, flush=True)

    with sess.lock:
        try:
            if not sess.access_token:
                login(base_url, sess, insecure_tls=insecure_tls)
                log("login ok")
            else:
                log("resume (token cached)")
        except ApiError as exc:
            log(f"login failed: {exc}")
            return

        if sess.profile_id is None:
            hydrate_profile(base_url, sess, insecure_tls=insecure_tls, log=log)
            if sess.profile_id:
                log(f"profile_id={sess.profile_id}")

        target = random.randint(*sess.persona.pages_per_visit)
        log(f"visit start, planning {target} page(s)")
        page = "dashboard"
        seen = 0
        ai_messages_planned = choose_weighted(sess.persona.llm_msgs_dist)
        ai_messages_sent = 0

        # Decide before the visit: will we submit a coach request today?
        will_submit_request = False
        if (
            not sess.requested_coach_today
            and not sess.engaged_today
            and random.random() < sess.persona.coach_request_chance
        ):
            will_submit_request = True

        while seen < target:
            log(f"page -> {pick_path(page)}")
            visit_page(base_url, sess, page, insecure_tls=insecure_tls, log=log)
            sess.pages_total += 1
            seen += 1

            if page == "ai-chat" and ai_messages_sent < ai_messages_planned:
                remaining = ai_messages_planned - ai_messages_sent
                ask_llm_messages(base_url, sess, remaining,
                                 insecure_tls=insecure_tls, log=log, time_scale=time_scale)
                ai_messages_sent = ai_messages_planned

            if page == "coaches" and will_submit_request and not sess.requested_coach_today:
                time.sleep(scaled_dwell(3.0, 7.0, time_scale))
                maybe_submit_coach_request(
                    base_url, sess, state=state, state_lock=state_lock,
                    insecure_tls=insecure_tls, log=log, engagement_days=engagement_days,
                )
                with state_lock:
                    save_state(state_path, state)

            if seen >= target:
                break
            time.sleep(scaled_dwell(4.0, 18.0, time_scale))
            nxt = pick_next_page(page)
            if nxt == "close":
                break
            page = nxt

        # Make sure the planned LLM batch is sent at least once during the
        # visit even if the random walk never landed on /ai-chat.
        if ai_messages_planned and ai_messages_sent < ai_messages_planned:
            log(f"page -> /ai-chat (forced for planned LLM)")
            visit_page(base_url, sess, "ai-chat", insecure_tls=insecure_tls, log=log)
            sess.pages_total += 1
            ask_llm_messages(
                base_url, sess, ai_messages_planned - ai_messages_sent,
                insecure_tls=insecure_tls, log=log, time_scale=time_scale,
            )
            ai_messages_sent = ai_messages_planned

        if random.random() < sess.persona.logout_chance:
            log("logout")
            try:
                call("POST", base_url, "/auth/logout", sess,
                     body={"refresh_token": sess.refresh_token},
                     insecure_tls=insecure_tls, timeout=15)
            except ApiError as exc:
                log(f"logout warn: {exc}")
            sess.access_token = ""
            sess.refresh_token = ""
        else:
            log("tab closed (token kept)")

        sess.visits_done += 1
        log(f"visit end, pages={seen} llm_today={sess.llm_total}")


# --- Coach acceptance wave ------------------------------------------------

def run_coach_wave(
    *,
    base_url: str, insecure_tls: bool,
    coach_sessions_by_email: dict[str, Session],
    state: PersistentState, state_lock: threading.Lock, state_path: Path,
    print_lock: threading.Lock, time_scale: float,
) -> None:
    """For every pending engagement (request without acceptance), log in
    the corresponding coach, browse a couple of pages, accept the
    request via PATCH, and persist the acceptance into state."""

    def clog(coach: Session, msg: str) -> None:
        line = (
            f"[{datetime.now().strftime('%H:%M:%S')}] coach{coach.index:02d} "
            f"{coach.nickname[:18]:<18} | {msg}"
        )
        with print_lock:
            print(line, flush=True)

    # Build coach-id -> session map. Hydrate /coach/profile once per coach
    # so we know each coach's own CoachProfile.id and can match
    # engagements to coach accounts.
    profile_to_coach: dict[int, Session] = {}
    for email, coach in coach_sessions_by_email.items():
        try:
            if not coach.access_token:
                login(base_url, coach, insecure_tls=insecure_tls)
            data = call("GET", base_url, "/coach/profile", coach,
                        insecure_tls=insecure_tls, timeout=20)
        except ApiError as exc:
            clog(coach, f"failed to load coach profile: {exc}")
            continue
        coach_profile_id = data.get("id") if isinstance(data, dict) else None
        if isinstance(coach_profile_id, int):
            profile_to_coach[coach_profile_id] = coach
            with state_lock:
                state.coach_profile_ids[email] = coach_profile_id
    with state_lock:
        save_state(state_path, state)

    pending: list[tuple[str, dict[str, Any]]] = []
    with state_lock:
        for player_email, eng in state.engagements.items():
            if eng.get("accepted_at"):
                continue
            if eng.get("request_id") is None:
                continue
            pending.append((player_email, dict(eng)))

    if not pending:
        return

    for player_email, eng in pending:
        coach_profile_id = eng.get("coach_profile_id")
        coach = profile_to_coach.get(coach_profile_id) if isinstance(coach_profile_id, int) else None
        if coach is None:
            continue

        with coach.lock:
            try:
                if not coach.access_token:
                    login(base_url, coach, insecure_tls=insecure_tls)
                    clog(coach, "login ok")
            except ApiError as exc:
                clog(coach, f"login failed: {exc}")
                continue

            # Coach does a tiny browse before deciding.
            for page in ("dashboard", "schedule", "requests"):
                emit_page_view(base_url, coach, page, insecure_tls=insecure_tls)
                for endpoint in ("/me/overview", "/training-sessions/my",
                                 "/matchmaking/requests/coach"):
                    try:
                        call("GET", base_url, endpoint, coach,
                             insecure_tls=insecure_tls, timeout=20)
                    except ApiError as exc:
                        clog(coach, f"{endpoint} -> {exc}")
                time.sleep(scaled_dwell(2.0, 5.0, time_scale))

            scheduled_at = (datetime.now(MSK) + timedelta(
                days=random.randint(1, 4),
                hours=random.randint(0, 4),
            )).replace(minute=0, second=0, microsecond=0).astimezone(timezone.utc)
            scheduled_iso = scheduled_at.isoformat().replace("+00:00", "Z")
            request_id = eng["request_id"]
            try:
                resp = call("PATCH", base_url, f"/matchmaking/requests/{request_id}", coach,
                            body={"action": "CHOOSE_COACH", "scheduled_at": scheduled_iso},
                            insecure_tls=insecure_tls, timeout=30)
                clog(coach, f"accepted request {request_id} player={player_email} "
                            f"scheduled_at={scheduled_iso} status="
                            f"{resp.get('status') if isinstance(resp, dict) else '?'}")
                with state_lock:
                    if player_email in state.engagements:
                        state.engagements[player_email]["accepted_at"] = (
                            datetime.now(MSK).isoformat()
                        )
                        state.engagements[player_email]["scheduled_at"] = scheduled_iso
                    save_state(state_path, state)
            except ApiError as exc:
                clog(coach, f"accept request {request_id} failed: {exc}")


# --- Schedule planner -----------------------------------------------------

@dataclass(order=True)
class PlannedVisit:
    when_real: float
    sim_ts: datetime = field(compare=False)
    user_index: int = field(compare=False)


def sample_visit_hours(persona: Persona, start_h: float, end_h: float) -> list[float]:
    p0, p1, p2 = persona.visits_per_day_dist
    bucket = choose_weighted((p0, p1, p2))
    n = bucket  # 0, 1 or 2
    if n == 0:
        return []
    if n == 1:
        return [random.uniform(start_h, end_h)]
    # n == 2: pick two hours separated by at least ~3h
    a = random.uniform(start_h, end_h)
    for _ in range(20):
        b = random.uniform(start_h, end_h)
        if abs(b - a) >= 3.0:
            return sorted([a, b])
    return sorted([a, min(end_h, a + 3.0) if a + 3.0 <= end_h else max(start_h, a - 3.0)])


def build_schedule(
    sessions: list[Session], *,
    sim_start: datetime, sim_end: datetime,
    real_start: float, time_scale: float,
) -> list[PlannedVisit]:
    plan: list[PlannedVisit] = []
    window_seconds = (sim_end - sim_start).total_seconds()
    end_hour = window_seconds / 3600.0  # may exceed 24
    for sess in sessions:
        for hour in sample_visit_hours(sess.persona, 0.0, end_hour):
            sim_ts = sim_start + timedelta(hours=hour)
            sim_offset = (sim_ts - sim_start).total_seconds()
            when_real = real_start + sim_offset / max(0.001, time_scale)
            plan.append(PlannedVisit(when_real=when_real, sim_ts=sim_ts, user_index=sess.index))
    plan.sort()
    return plan


# --- CLI / main -----------------------------------------------------------

def load_accounts(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def select_player_accounts(rows: list[dict], n: int, only_linked: bool) -> list[dict]:
    players = [r for r in rows if (r.get("initial_role") or "").upper() == "PLAYER"]
    players.sort(key=lambda r: int(r.get("index") or 0))
    if only_linked:
        linked = [r for r in players if (r.get("link_status") or "") == "linked"]
        unlinked = [r for r in players if (r.get("link_status") or "") != "linked"]
        ordered = linked + unlinked
    else:
        ordered = players
    return ordered[:n]


def select_coach_accounts(rows: list[dict]) -> list[dict]:
    coaches = [r for r in rows if (r.get("initial_role") or "").upper() == "COACH"]
    coaches.sort(key=lambda r: int(r.get("index") or 0))
    return coaches


def assign_personas(
    state: PersistentState, picked: list[dict], mix: dict[str, float],
) -> None:
    """Assign a persona to every newly seen email and persist it."""
    new_emails = [r["email"] for r in picked if r["email"] not in state.personas]
    if not new_emails:
        return
    # Fill counts so the *new* batch matches the mix on its own.
    total = len(new_emails)
    targets: dict[str, int] = {}
    remainders: list[tuple[float, str]] = []
    assigned = 0
    for name, weight in mix.items():
        whole = int(weight * total)
        targets[name] = whole
        assigned += whole
        remainders.append((weight * total - whole, name))
    remainders.sort(reverse=True)
    i = 0
    while assigned < total:
        targets[remainders[i % len(remainders)][1]] += 1
        assigned += 1
        i += 1
    pool: list[str] = []
    for name, count in targets.items():
        pool.extend([name] * count)
    random.shuffle(pool)
    for email, persona_name in zip(new_emails, pool):
        state.personas[email] = persona_name


def build_sessions(picked: list[dict], state: PersistentState, now: datetime) -> list[Session]:
    sessions: list[Session] = []
    for row in picked:
        email = row["email"]
        base_name = state.personas.get(email, "regular")
        engaged = is_engaged(state, email, now)
        persona = PERSONAS["engaged"] if engaged else PERSONAS[base_name]
        sessions.append(Session(
            index=int(row["index"]),
            email=email,
            password=row["password"],
            nickname=row.get("nickname_source") or row.get("login") or email,
            role=(row.get("initial_role") or "PLAYER").upper(),
            desired_role=row.get("desired_role") or "POS1",
            dota_account_id=row.get("dota_account_id") or "",
            persona=persona,
            base_persona_name=base_name,
            engaged_today=engaged,
        ))
    return sessions


def build_coach_sessions(coaches: list[dict]) -> dict[str, Session]:
    out: dict[str, Session] = {}
    for row in coaches:
        email = row["email"]
        out[email] = Session(
            index=int(row["index"]),
            email=email,
            password=row["password"],
            nickname=row.get("nickname_source") or row.get("login") or email,
            role="COACH",
            desired_role=row.get("desired_role") or "POS1",
            dota_account_id=row.get("dota_account_id") or "",
            persona=PERSONAS["regular"],  # filler; coaches do not use it
            base_persona_name="coach",
        )
    return out


def fmt_dt(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%d %H:%M")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Simulate one day of believable demo traffic on RuPrime.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--credentials", required=True, type=Path,
                        help="Path to secrets/demo_accounts_*.csv produced by seed_demo_accounts.py")
    parser.add_argument("--state-file", type=Path, default=Path("secrets/walkthrough_state.json"),
                        help="JSON file that stores per-email personas, coach mapping and engagements")
    parser.add_argument("--base-url", default=os.getenv("RUPRIME_BASE_URL", "https://ru-prime.ru"),
                        help="Public site/API base URL")
    parser.add_argument("--users", type=int, default=25,
                        help="How many PLAYER accounts to put into today's pool (subset of CSV)")
    parser.add_argument("--day", default=None,
                        help="Date of the simulated day in YYYY-MM-DD (MSK). Default: today")
    parser.add_argument("--start-hour", type=int, default=8,
                        help="Earliest local (MSK) hour a session may start")
    parser.add_argument("--end-hour", type=int, default=27,
                        help="Latest local hour, may wrap past midnight (e.g. 27 = 03:00 next day)")
    parser.add_argument("--time-scale", type=float, default=1.0,
                        help="Real seconds per simulated second. 1.0 = real-time over the whole day, "
                             "57 ≈ 19h compressed into 20min, 19 = 1h per simulated day")
    parser.add_argument("--persona-mix", type=parse_persona_mix,
                        default=parse_persona_mix("heavy=0.15,regular=0.45,casual=0.30,dormant=0.10"),
                        help="Persona weights for *newly seen* accounts only")
    parser.add_argument("--engagement-days", type=int, default=7,
                        help="How many days an account stays in 'engaged' persona after a coach request")
    parser.add_argument("--only-linked", action="store_true", default=True,
                        help="Prefer accounts whose Steam link succeeded")
    parser.add_argument("--no-only-linked", dest="only_linked", action="store_false")
    parser.add_argument("--max-concurrent", type=int, default=8,
                        help="Maximum simultaneous in-flight visits")
    parser.add_argument("--insecure-tls", action="store_true",
                        help="Use curl -k for local environments with custom CA issues")
    parser.add_argument("--seed", type=int, default=None, help="Random seed")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print today's plan and exit; no HTTP, no state mutation")
    parser.add_argument("--no-coach-wave", action="store_true",
                        help="Skip the coach acceptance wave (e.g. for player-only debug runs)")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    if not args.credentials.exists():
        print(f"credentials file not found: {args.credentials}", file=sys.stderr)
        return 2
    rows = load_accounts(args.credentials)
    if not rows:
        print("credentials file has no rows", file=sys.stderr)
        return 2

    now = datetime.now(MSK)
    if args.day:
        try:
            base_day = datetime.strptime(args.day, "%Y-%m-%d").replace(tzinfo=MSK)
        except ValueError:
            print(f"bad --day: {args.day!r}, expected YYYY-MM-DD", file=sys.stderr)
            return 2
    else:
        base_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    sim_start = base_day.replace(hour=0) + timedelta(hours=args.start_hour)
    sim_end = base_day.replace(hour=0) + timedelta(hours=args.end_hour)
    if sim_end <= sim_start:
        print("end-hour must be greater than start-hour", file=sys.stderr)
        return 2

    state = load_state(args.state_file)

    picked = select_player_accounts(rows, args.users, args.only_linked)
    if not picked:
        print("no PLAYER accounts matched the filters", file=sys.stderr)
        return 2
    assign_personas(state, picked, args.persona_mix)
    sessions = build_sessions(picked, state, now)
    sessions_by_index = {s.index: s for s in sessions}

    coaches_rows = select_coach_accounts(rows)
    coach_sessions = build_coach_sessions(coaches_rows)

    # If today's start is in the past, shift the real timeline so visits
    # that should have happened earlier today are spread across the
    # remaining real wall-clock window. Default `--time-scale 1.0` means
    # real-time; for a fast demo pass --time-scale 57 to fit one whole
    # day into ~20 real minutes.
    real_start = max(time.time(), sim_start.timestamp())
    schedule = build_schedule(
        sessions, sim_start=sim_start, sim_end=sim_end,
        real_start=real_start, time_scale=args.time_scale,
    )

    persona_counts: dict[str, int] = {p: 0 for p in PERSONAS}
    for s in sessions:
        persona_counts[s.persona.name] += 1
    visits_per_user: dict[int, int] = {s.index: 0 for s in sessions}
    for v in schedule:
        visits_per_user[v.user_index] += 1
    silent = [s for s in sessions if visits_per_user[s.index] == 0]
    pending_engagements = sum(1 for v in state.engagements.values() if not v.get("accepted_at"))

    print(f"site:        {args.base_url}")
    print(f"state file:  {args.state_file}")
    print(f"accounts:    {len(rows)} in CSV; pool today = {len(sessions)} player(s) "
          f"+ {len(coach_sessions)} coach(es) on standby")
    print(f"persona mix: " + ", ".join(
        f"{name}={persona_counts[name]}" for name in ("heavy", "regular", "casual", "dormant", "engaged")
    ))
    print(f"sim window:  {fmt_dt(sim_start)} -> {fmt_dt(sim_end)} (MSK)")
    print(f"time-scale:  {args.time_scale}x  (window per real "
          f"{timedelta(seconds=(sim_end - sim_start).total_seconds() / max(0.001, args.time_scale))})")
    print(f"planned:     {len(schedule)} visits today; "
          f"{len(silent)} account(s) skip the day")
    if state.engagements:
        print(f"engagements: {len(state.engagements)} total ({pending_engagements} pending coach approval)")
    print()
    print("plan:")
    for v in schedule:
        s = sessions_by_index[v.user_index]
        eng_tag = "*ENG" if s.engaged_today else "    "
        print(f"  sim {fmt_dt(v.sim_ts)} {eng_tag} u{s.index:02d} {s.persona.name:<7} "
              f"{s.nickname[:22]}")
    if silent:
        print(f"  silent today: " + ", ".join(f"u{s.index:02d}({s.base_persona_name})"
                                              for s in silent[:15])
              + (" ..." if len(silent) > 15 else ""))
    print()

    if args.dry_run:
        print("(dry run, exiting without HTTP calls or state writes)")
        return 0

    # Persist persona assignments now even if the run is aborted later.
    save_state(args.state_file, state)

    if not schedule and not pending_engagements:
        print("nothing to do today (everyone skipped and no pending coach work).")
        return 0

    print_lock = threading.Lock()
    state_lock = threading.Lock()
    pool = ThreadPoolExecutor(max_workers=max(2, args.max_concurrent))

    print("starting simulation. press Ctrl+C to stop.\n")
    try:
        for visit in schedule:
            now_real = time.time()
            delay = visit.when_real - now_real
            if delay > 0:
                end = now_real + delay
                while True:
                    chunk = min(2.0, end - time.time())
                    if chunk <= 0:
                        break
                    time.sleep(chunk)
            sess = sessions_by_index[visit.user_index]
            pool.submit(
                run_visit, sess,
                base_url=args.base_url, insecure_tls=args.insecure_tls,
                print_lock=print_lock, state=state, state_lock=state_lock,
                state_path=args.state_file, time_scale=args.time_scale,
                engagement_days=args.engagement_days,
            )
    except KeyboardInterrupt:
        print("\n^C, draining in-flight visits...", flush=True)
    pool.shutdown(wait=True)

    if not args.no_coach_wave:
        print("\n--- coach acceptance wave ---")
        run_coach_wave(
            base_url=args.base_url, insecure_tls=args.insecure_tls,
            coach_sessions_by_email=coach_sessions,
            state=state, state_lock=state_lock, state_path=args.state_file,
            print_lock=print_lock, time_scale=args.time_scale,
        )

    save_state(args.state_file, state)

    total_pages = sum(s.pages_total for s in sessions)
    total_llm = sum(s.llm_total for s in sessions)
    total_visits = sum(s.visits_done for s in sessions)
    elapsed = time.time() - real_start
    print()
    print(f"day done. wall-clock={elapsed:.0f}s, "
          f"visits={total_visits}, page-views={total_pages}, llm-messages={total_llm}")
    print("per-account summary:")
    for s in sorted(sessions, key=lambda x: x.index):
        planned = visits_per_user[s.index]
        eng = "engaged" if s.engaged_today else s.base_persona_name
        print(f"  u{s.index:02d} {eng:<8} {s.nickname[:22]:<22} "
              f"planned={planned} done={s.visits_done} pages={s.pages_total} "
              f"llm={s.llm_total} req={'yes' if s.requested_coach_today else 'no'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
