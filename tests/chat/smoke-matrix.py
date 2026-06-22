from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class SmokeItem:
    name: str
    category: str
    command: list[str]
    profiles: tuple[str, ...] = ("core", "full")
    timeout_seconds: int = 180


MATRIX: tuple[SmokeItem, ...] = (
    SmokeItem(
        name="chat-display-contract",
        category="chat-backend",
        command=["node", "--test", "tests/chat/chat-display.test.mjs"],
        timeout_seconds=60,
    ),
    SmokeItem(
        name="chat-tool-visibility-contract",
        category="chat-backend",
        command=["node", "--test", "tests/chat/chat-tool-visibility.test.mjs"],
        timeout_seconds=60,
    ),
    SmokeItem(
        name="web-model-gateway-contract",
        category="react-frontend",
        command=["node", "--test", "tests/system/web-model-gateway.test.mjs"],
        timeout_seconds=90,
    ),
    SmokeItem(
        name="gateway-chat-http-auth",
        category="gateway-auth",
        command=["node", "--test", "tests/chat/gateway-http-auth.test.mjs"],
        profiles=("full",),
        timeout_seconds=90,
    ),
    SmokeItem(
        name="im-text-stream",
        category="streaming",
        command=["python", "tests/chat/chat-im.acceptance.py"],
        profiles=("full",),
        timeout_seconds=180,
    ),
)


def select_items(profile: str, only: Iterable[str]) -> list[SmokeItem]:
    selected = [item for item in MATRIX if profile in item.profiles]
    only_set = {value.strip() for value in only if value.strip()}
    if only_set:
        selected = [
            item for item in selected
            if item.name in only_set or item.category in only_set
        ]
    return selected


def parse_skip(stdout: str) -> str:
    text = stdout.strip()
    if not text:
        return ""
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return ""
    if payload.get("skipped") is True:
        return str(payload.get("reason") or "skipped")
    return ""


def run_item(item: SmokeItem, env: dict[str, str]) -> dict[str, object]:
    started_at = time.monotonic()
    try:
        completed = subprocess.run(
            item.command,
            env=env,
            text=True,
            capture_output=True,
            timeout=item.timeout_seconds,
            start_new_session=True,
        )
    except subprocess.TimeoutExpired as error:
        return {
            "name": item.name,
            "category": item.category,
            "status": "timeout",
            "durationSeconds": round(time.monotonic() - started_at, 3),
            "command": item.command,
            "stdout": error.stdout or "",
            "stderr": error.stderr or "",
        }

    skip_reason = parse_skip(completed.stdout)
    status = "skipped" if completed.returncode == 0 and skip_reason else (
        "passed" if completed.returncode == 0 else "failed"
    )
    return {
        "name": item.name,
        "category": item.category,
        "status": status,
        "skipReason": skip_reason,
        "durationSeconds": round(time.monotonic() - started_at, 3),
        "command": item.command,
        "returncode": completed.returncode,
        "stdout": completed.stdout[-4000:],
        "stderr": completed.stderr[-4000:],
    }


def wait_for_health(base_url: str, timeout_seconds: float) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/api/system/health", timeout=1.5) as response:
                if response.status < 500:
                    return
        except Exception as error:  # noqa: BLE001
            last_error = error
        time.sleep(0.5)
    raise RuntimeError(f"dev server did not become healthy: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Tracevane chat smoke matrix")
    parser.add_argument("--profile", choices=["core", "full"], default="core")
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--base-url", default=os.environ.get("TRACEVANE_WEB_BASE_URL", "http://127.0.0.1:5176"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    wait_for_health(args.base_url, 30)
    env = {
        **os.environ,
        "TRACEVANE_WEB_BASE_URL": args.base_url,
    }
    results = [run_item(item, env) for item in select_items(args.profile, args.only)]
    failed = [item for item in results if item["status"] not in {"passed", "skipped"}]

    if args.json:
        print(json.dumps({"profile": args.profile, "results": results}, ensure_ascii=False, indent=2))
    else:
        for result in results:
            print(f"{result['status']:>7} {result['name']} ({result['durationSeconds']}s)")
            if result["status"] == "skipped":
                print(f"        skip: {result.get('skipReason')}")
            if result["status"] not in {"passed", "skipped"}:
                print(result.get("stdout") or "")
                print(result.get("stderr") or "", file=sys.stderr)

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
