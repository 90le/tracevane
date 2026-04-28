from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
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
        name="markdown-rich-rendering",
        category="markdown-katex-mermaid-resources",
        command=["npx", "tsx", "--test", "tests/chat/markdown-rendering.test.ts"],
        timeout_seconds=90,
    ),
    SmokeItem(
        name="attachment-payload",
        category="attachments",
        command=["node", "--test", "tests/system/studio-web-chat-upload-payload.test.mjs"],
        timeout_seconds=60,
    ),
    SmokeItem(
        name="composer-attachment-browser",
        category="attachments",
        command=["python", "tests/chat/composer-attachment.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="host-exec-state",
        category="host-exec",
        command=["python", "tests/chat/host-exec.acceptance.py"],
        timeout_seconds=90,
    ),
    SmokeItem(
        name="session-rail",
        category="session-list",
        command=["python", "tests/chat/session-rail.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="heavy-history-upward",
        category="history-upward",
        command=["python", "tests/chat/heavy-history.acceptance.py"],
        timeout_seconds=180,
    ),
    SmokeItem(
        name="history-downward",
        category="history-downward",
        command=["python", "tests/chat/downward-history.acceptance.py"],
        timeout_seconds=180,
    ),
    SmokeItem(
        name="jump-latest",
        category="return-to-latest",
        command=["python", "tests/chat/jump-latest.acceptance.py"],
        timeout_seconds=150,
    ),
    SmokeItem(
        name="chat-shell-surface",
        category="chat-ui-surface",
        command=["python", "tests/chat/surface.acceptance.py"],
        profiles=("full",),
        timeout_seconds=180,
    ),
    SmokeItem(
        name="im-text-stream",
        category="streaming",
        command=["python", "tests/chat/chat-im.acceptance.py"],
        profiles=("full",),
        timeout_seconds=180,
    ),
    SmokeItem(
        name="tool-stream-status",
        category="tool-streaming",
        command=["python", "tests/chat/fresh-tool.acceptance.py"],
        profiles=("full",),
        timeout_seconds=240,
    ),
    SmokeItem(
        name="workbench-browser",
        category="workbench-send-reset-reload",
        command=["python", "tests/chat/browser.acceptance.py"],
        profiles=("full",),
        timeout_seconds=240,
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
        )
    except subprocess.TimeoutExpired as error:
        return {
            "name": item.name,
            "category": item.category,
            "status": "failed",
            "durationSeconds": round(time.monotonic() - started_at, 2),
            "error": f"timed out after {item.timeout_seconds}s",
            "stdoutTail": (error.stdout or "")[-4000:],
            "stderrTail": (error.stderr or "")[-4000:],
        }

    duration = round(time.monotonic() - started_at, 2)
    skip_reason = parse_skip(completed.stdout)
    status = "passed" if completed.returncode == 0 else "failed"
    if completed.returncode == 0 and skip_reason:
        status = "skipped"
    return {
        "name": item.name,
        "category": item.category,
        "status": status,
        "durationSeconds": duration,
        "command": " ".join(item.command),
        **({"skipReason": skip_reason} if skip_reason else {}),
        "stdoutTail": completed.stdout[-4000:],
        "stderrTail": completed.stderr[-4000:],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Studio Chat smoke matrix.")
    parser.add_argument(
        "--profile",
        choices=("core", "full"),
        default=os.environ.get("CHAT_SMOKE_MATRIX_PROFILE", "core"),
        help="core is deterministic; full also runs real model streaming/tool smokes.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        help="Run only a smoke name or category. Can be repeated.",
    )
    args = parser.parse_args()

    items = select_items(args.profile, args.only)
    if not items:
        print(json.dumps({
            "profile": args.profile,
            "status": "failed",
            "error": "No smoke items selected",
        }, ensure_ascii=False, indent=2))
        return 1

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")

    results = [run_item(item, env) for item in items]
    failed = [item for item in results if item["status"] == "failed"]
    summary = {
        "profile": args.profile,
        "status": "failed" if failed else "passed",
        "total": len(results),
        "passed": sum(1 for item in results if item["status"] == "passed"),
        "skipped": sum(1 for item in results if item["status"] == "skipped"),
        "failed": len(failed),
        "results": results,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
