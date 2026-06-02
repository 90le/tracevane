from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Any


BASE_URL = "http://127.0.0.1:5176"


def api_json(path: str, base_url: str = BASE_URL) -> dict[str, Any]:
    request = urllib.request.Request(f"{base_url}{path}")
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_history(session_key: str, base_url: str = BASE_URL) -> dict[str, Any]:
    quoted_key = urllib.parse.quote(session_key, safe="")
    return api_json(f"/api/chat/sessions/{quoted_key}/history?limit=12", base_url)


def history_messages(history_payload: dict[str, Any]) -> list[dict[str, Any]]:
    messages = history_payload.get("messages")
    if not isinstance(messages, list):
        return []
    return [message for message in messages if isinstance(message, dict)]


def latest_assistant_text(history_payload: dict[str, Any]) -> str:
    for message in reversed(history_messages(history_payload)):
        if message.get("role") == "assistant":
            return str(message.get("text") or "")
    return ""


def has_assistant_message(history_payload: dict[str, Any]) -> bool:
    return any(message.get("role") == "assistant" for message in history_messages(history_payload))


def unavailable_reason(history_payload: dict[str, Any]) -> str:
    runtime = history_payload.get("runtime") or {}
    code = str(runtime.get("lastErrorCode") or "")
    message = str(runtime.get("lastErrorMessage") or "")
    assistant_text = latest_assistant_text(history_payload)
    combined = " ".join(part for part in (code, message, assistant_text) if part).strip()
    if code == "gateway_down" or re.search(r"gateway .*disconnect|gateway .*down|bridge disconnected", combined, re.I):
        return combined or "gateway bridge disconnected"
    if re.search(
        r"OAuth token refresh failed|unsupported_country_region_territory|request_forbidden|"
        r"Country, region, or territory not supported|OpenAI Codex token refresh failed",
        combined,
        re.I,
    ):
        return combined or "external AI auth unavailable"
    return ""


def build_unavailable_skip(
    history_payload: dict[str, Any],
    *,
    session_key: str,
    surface: dict[str, object],
    smoke_name: str,
) -> dict[str, Any] | None:
    reason = unavailable_reason(history_payload)
    if not reason:
        return None
    return {
        "skipped": True,
        "reason": f"{smoke_name} skipped because the external OpenClaw/AI runtime is unavailable: {reason[:500]}",
        "runtime": history_payload.get("runtime"),
        "sessionKey": session_key,
        "surface": surface,
    }
