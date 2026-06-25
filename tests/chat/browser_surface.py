from __future__ import annotations

import json
import time
from typing import Iterable


def collect_chat_surface_diagnostics(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const text = (selector) => (document.querySelector(selector)?.textContent || '').trim();
            const exists = (selector) => Boolean(document.querySelector(selector));
            return {
              url: window.location.href,
              sessionListVisible: exists('.chat-shell-session-list'),
              conversationPaneVisible: exists('.chat-conversation-pane'),
              composerVisible: exists('.chat-composer-editor'),
              bodyTail: (document.body?.innerText || '').slice(-1200),
              title: document.title,
              activeSessionText: text('.chat-shell-session-row.active'),
            };
        }"""
    )


def wait_for_active_session(page, session_key: str, timeout: int = 90000) -> None:
    page.wait_for_function(
        """(sessionKey) => {
            const toBase64Url = (value) => btoa(unescape(encodeURIComponent(value)))
                .replace(/\\+/g, '-')
                .replace(/\\//g, '_')
                .replace(/=+$/, '');
            const sessionRef = `r1_${toBase64Url(sessionKey)}`;
            const row = document.querySelector('.chat-shell-session-row.active');
            const href = window.location.href;
            const routeMatches = href.includes(encodeURIComponent(sessionKey))
                || href.includes(sessionKey)
                || href.includes(`/chat/s/${sessionRef}`)
                || href.includes(`sessionRef=${encodeURIComponent(sessionRef)}`);
            return Boolean(
              (row?.getAttribute('data-session-key') === sessionKey || routeMatches)
              && document.querySelector('.chat-composer-editor')
            );
        }""",
        arg=session_key,
        timeout=timeout,
    )


def wait_for_chat_surface(
    page,
    url: str,
    selectors: Iterable[str] = (".chat-shell-session-list",),
    timeout: int = 90000,
) -> None:
    deadline = time.monotonic() + (timeout / 1000)
    attempts: list[dict[str, object]] = []
    first_navigation = True
    attempt = 0

    while time.monotonic() < deadline:
        attempt += 1
        try:
            if first_navigation:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
            else:
                page.reload(wait_until="domcontentloaded", timeout=30000)
        except Exception as error:
            attempts.append({"attempt": attempt, "navigationError": str(error)})
        first_navigation = False

        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass

        remaining_ms = max(1000, int((deadline - time.monotonic()) * 1000))
        per_attempt_timeout = min(20000, remaining_ms)
        try:
            for selector in selectors:
                page.locator(selector).first.wait_for(state="visible", timeout=per_attempt_timeout)
            return
        except Exception as error:
            diagnostic = collect_chat_surface_diagnostics(page)
            diagnostic["attempt"] = attempt
            diagnostic["selectorError"] = str(error)
            attempts.append(diagnostic)
            page.wait_for_timeout(1000)

    raise AssertionError(
        "chat surface did not become ready: "
        + json.dumps(attempts[-4:], ensure_ascii=False)
    )
