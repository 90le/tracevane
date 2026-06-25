from __future__ import annotations

import json
import re
from typing import Any


def _parse_content_disposition(value: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for part in [item.strip() for item in value.split(";") if item.strip()][1:]:
        if "=" not in part:
            continue
        key, raw_value = part.split("=", 1)
        raw_value = raw_value.strip()
        if raw_value.startswith('"') and raw_value.endswith('"'):
            raw_value = raw_value[1:-1].replace('\\"', '"')
        result[key.strip().lower()] = raw_value
    return result


def _request_body(request) -> bytes:
    post_data_buffer = getattr(request, "post_data_buffer", None)
    if isinstance(post_data_buffer, bytes):
        return post_data_buffer
    if callable(post_data_buffer):
        value = post_data_buffer()
        if isinstance(value, bytes):
            return value
    post_data = getattr(request, "post_data", None)
    if isinstance(post_data, str):
        return post_data.encode("utf-8")
    if isinstance(post_data, bytes):
        return post_data
    return b""


def read_upload_payload(request) -> dict[str, Any]:
    content_type = str((request.headers or {}).get("content-type") or "")
    if "multipart/form-data" not in content_type.lower():
        try:
            return request.post_data_json
        except Exception:
            raw = getattr(request, "post_data", "") or "{}"
            return json.loads(raw)

    match = re.search(r'(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))', content_type, re.I)
    boundary = (match.group(1) if match and match.group(1) else match.group(2) if match else "").strip()
    if not boundary:
        raise AssertionError(f"multipart request missing boundary: {content_type}")

    body = _request_body(request)
    delimiter = ("--" + boundary).encode("utf-8")
    payload: dict[str, Any] = {"_contentType": content_type, "_multipart": True, "_bodyLength": len(body)}

    for raw_part in body.split(delimiter):
        if not raw_part or raw_part in (b"--\r\n", b"--"):
            continue
        if raw_part.startswith(b"\r\n"):
            raw_part = raw_part[2:]
        if raw_part.endswith(b"\r\n"):
            raw_part = raw_part[:-2]
        if raw_part.endswith(b"--"):
            raw_part = raw_part[:-2]
        if b"\r\n\r\n" not in raw_part:
            continue
        raw_headers, data = raw_part.split(b"\r\n\r\n", 1)
        headers: dict[str, str] = {}
        for line in raw_headers.decode("utf-8", errors="replace").split("\r\n"):
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()

        disposition = _parse_content_disposition(headers.get("content-disposition", ""))
        name = disposition.get("name") or ""
        if name == "file":
            payload["_fileFieldSeen"] = True
            payload["fileName"] = payload.get("fileName") or disposition.get("filename") or "upload.bin"
            payload["mimeType"] = payload.get("mimeType") or headers.get("content-type") or "application/octet-stream"
            payload["content"] = data
            payload["contentLength"] = len(data)
        elif name in {"fileName", "mimeType"}:
            payload[name] = data.decode("utf-8", errors="replace").strip()

    if not payload.get("_fileFieldSeen"):
        raise AssertionError(f"multipart request missing file field: {payload}")
    return payload


def files_summary_response(root_id: str = "project-root", absolute_path: str = "/tmp/tracevane-project") -> dict[str, Any]:
    return {
        "checkedAt": "2026-06-26T00:00:00.000Z",
        "defaultRootId": root_id,
        "roots": [
            {
                "id": root_id,
                "labelZh": "项目文件",
                "labelEn": "Project files",
                "descriptionZh": "测试文件根",
                "descriptionEn": "Test file root",
                "absolutePath": absolute_path,
                "preferred": True,
            }
        ],
    }


def files_upload_init_response(payload: dict[str, Any], upload_id: str = "upload-test-1") -> dict[str, Any]:
    chunk_size = int(payload.get("chunkSize") or 2 * 1024 * 1024)
    size = int(payload.get("size") or 0)
    chunk_count = max(1, (size + chunk_size - 1) // chunk_size) if size else 1
    target_path = str(payload.get("relativePath") or payload.get("fileName") or "attachment")
    return {
        "uploadId": upload_id,
        "chunkSize": chunk_size,
        "chunkCount": chunk_count,
        "uploadedChunks": [],
        "targetPath": target_path,
        "conflictPolicy": payload.get("conflictPolicy") or "rename",
    }


def files_mutation_response(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    return {
        "ok": True,
        "checkedAt": "2026-06-26T00:00:00.000Z",
        "rootId": payload.get("rootId") or "project-root",
        "entries": [],
    }


def install_files_upload_routes(
    page,
    upload_payloads: list[dict[str, Any]],
    *,
    fail_first_init_message: str | None = None,
    delay_first_init_ms: int = 0,
    root_id: str = "project-root",
):
    state: dict[str, Any] = {"init_count": 0, "uploads": {}}

    def handle_summary(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(files_summary_response(root_id=root_id)),
        )

    def handle_init(route):
        payload = read_upload_payload(route.request)
        state["init_count"] += 1
        upload_id = f"upload-test-{state['init_count']}"
        payload["uploadId"] = upload_id
        payload["_filesApi"] = "init"
        upload_payloads.append(payload)
        if delay_first_init_ms and state["init_count"] == 1:
            page.wait_for_timeout(delay_first_init_ms)
        if fail_first_init_message and state["init_count"] == 1:
            route.fulfill(
                status=500,
                content_type="application/json",
                body=json.dumps({"error": {"code": "upload_failed", "message": fail_first_init_message}}),
            )
            return
        response = files_upload_init_response(payload, upload_id=upload_id)
        state["uploads"][upload_id] = {"payload": payload, "response": response}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(response))

    def handle_chunk(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))

    def handle_complete(route):
        payload = read_upload_payload(route.request)
        route.fulfill(status=200, content_type="application/json", body=json.dumps(files_mutation_response(payload)))

    def handle_cancel(route):
        payload = read_upload_payload(route.request)
        route.fulfill(status=200, content_type="application/json", body=json.dumps(files_mutation_response(payload)))

    page.route(re.compile(r".*/api/files/summary(?:\?.*)?$"), handle_summary)
    page.route(re.compile(r".*/api/files/uploads/init(?:\?.*)?$"), handle_init)
    page.route(re.compile(r".*/api/files/uploads/[^/]+/chunks/\d+(?:\?.*)?$"), handle_chunk)
    page.route(re.compile(r".*/api/files/uploads/complete(?:\?.*)?$"), handle_complete)
    page.route(re.compile(r".*/api/files/uploads(?:\?.*)?$"), handle_cancel)
    return state
