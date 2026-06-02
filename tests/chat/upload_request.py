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
