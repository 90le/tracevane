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
        name="composer-upload-failure-browser",
        category="upload-failure-recovery",
        command=["python", "tests/chat/composer-upload-failure.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-upload-concurrency-browser",
        category="upload-concurrency",
        command=["python", "tests/chat/composer-upload-concurrency.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-upload-nonpreview-browser",
        category="upload-nonpreview-performance",
        command=["python", "tests/chat/composer-upload-nonpreview.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-upload-session-switch-browser",
        category="upload-session-switch",
        command=["python", "tests/chat/composer-upload-session-switch.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-upload-cancel-browser",
        category="upload-cancel-recovery",
        command=["python", "tests/chat/composer-upload-cancel.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-upload-remove-browser",
        category="upload-remove-recovery",
        command=["python", "tests/chat/composer-upload-remove.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-draft-attachment-browser",
        category="draft-attachment-persistence",
        command=["python", "tests/chat/composer-draft-attachment.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-draft-pagehide-browser",
        category="draft-pagehide-persistence",
        command=["python", "tests/chat/composer-draft-pagehide.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-draft-session-switch-race-browser",
        category="draft-session-switch-race",
        command=["python", "tests/chat/composer-draft-session-switch-race.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-autofocus-browser",
        category="composer-autofocus",
        command=["python", "tests/chat/composer-autofocus.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-paste-mixed-browser",
        category="composer-paste-mixed",
        command=["python", "tests/chat/composer-paste-mixed.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-keyboard-browser",
        category="composer-keyboard",
        command=["python", "tests/chat/composer-keyboard.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-ime-browser",
        category="composer-ime",
        command=["python", "tests/chat/composer-ime.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-send-failure-browser",
        category="send-failure-recovery",
        command=["python", "tests/chat/composer-send-failure.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-queue-failure-browser",
        category="queue-failure-recovery",
        command=["python", "tests/chat/composer-queue-failure.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-queue-retry-browser",
        category="queue-retry-recovery",
        command=["python", "tests/chat/composer-queue-retry.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="composer-pressure-browser",
        category="composer-layout-pressure",
        command=["python", "tests/chat/composer-pressure.acceptance.py"],
        timeout_seconds=150,
    ),
    SmokeItem(
        name="rich-markdown-layout-browser",
        category="rich-markdown-layout",
        command=["python", "tests/chat/rich-markdown-layout.acceptance.py"],
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
        name="session-delete-cache-cleanup-browser",
        category="session-delete-cache-cleanup",
        command=["python", "tests/chat/session-delete-cache-cleanup.acceptance.py"],
        timeout_seconds=120,
    ),
    SmokeItem(
        name="session-viewport-restore",
        category="history-session-switch",
        command=["python", "tests/chat/session-viewport.acceptance.py"],
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
            start_new_session=True,
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


def item_needs_browser_surface(item: SmokeItem) -> bool:
    return (
        len(item.command) >= 2
        and item.command[0] == "python"
        and item.command[1].startswith("tests/chat/")
        and item.command[1].endswith(".acceptance.py")
    )


def warm_chat_surface(base_url: str = "http://127.0.0.1:5176") -> dict[str, object]:
    started_at = time.monotonic()
    deadline = time.monotonic() + 60
    last_error = ""
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/chat", timeout=10) as response:
                body = response.read(2048).decode("utf-8", errors="replace")
                if response.status < 400 and "OpenClaw Studio" in body:
                    return {
                        "name": "chat-surface-warmup",
                        "category": "preflight",
                        "status": "passed",
                        "durationSeconds": round(time.monotonic() - started_at, 2),
                    }
                last_error = f"unexpected status/body: {response.status}"
        except Exception as error:
            last_error = str(error)
        time.sleep(1)
    return {
        "name": "chat-surface-warmup",
        "category": "preflight",
        "status": "failed",
        "durationSeconds": round(time.monotonic() - started_at, 2),
        "error": last_error,
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

    preflight_results: list[dict[str, object]] = []
    if any(item_needs_browser_surface(item) for item in items):
        warmup = warm_chat_surface()
        preflight_results.append(warmup)
        if warmup["status"] == "failed":
            summary = {
                "profile": args.profile,
                "status": "failed",
                "total": len(items),
                "passed": 0,
                "skipped": 0,
                "failed": 1,
                "preflight": preflight_results,
                "results": [],
            }
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

    results = [run_item(item, env) for item in items]
    failed = [item for item in results if item["status"] == "failed"]
    summary = {
        "profile": args.profile,
        "status": "failed" if failed else "passed",
        "total": len(results),
        "passed": sum(1 for item in results if item["status"] == "passed"),
        "skipped": sum(1 for item in results if item["status"] == "skipped"),
        "failed": len(failed),
        **({"preflight": preflight_results} if preflight_results else {}),
        "results": results,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
