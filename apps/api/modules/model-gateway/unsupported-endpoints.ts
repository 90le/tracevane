type ModelGatewayUnsupportedHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ModelGatewayUnsupportedEndpoint = {
  method: string;
  path: string;
  endpoint: string;
  code: string;
  reason: string;
};

export type ModelGatewayUnsupportedHttpRoute = {
  method: ModelGatewayUnsupportedHttpMethod;
  path: string;
  endpoint: string;
  code: string;
};

export type ModelGatewayUnsupportedErrorPayload = {
  error: {
    code: string;
    message: string;
    details: {
      endpoint?: string;
      providerType?: string;
      feasibility: string;
      reference: string;
      alternatives: string[];
    };
  };
};

type ModelGatewayUnsupportedEndpointDefinition = ModelGatewayUnsupportedEndpoint & {
  httpRoutes?: Array<Omit<ModelGatewayUnsupportedHttpRoute, "code">>;
  websocketPaths?: string[];
};

export const MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE = "model_gateway_realtime_unsupported";
export const MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE = "model_gateway_endpoint_unsupported";

export const MODEL_GATEWAY_REALTIME_UNSUPPORTED_MESSAGE =
  "Tracevane Gateway does not expose Realtime or Responses WebSocket proxying yet; use /v1/responses, /v1/chat/completions, /v1/messages, or connect directly to an official realtime provider until a Gateway WebSocket bridge is verified.";

export const MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_FEASIBILITY =
  "blocked-no-verified-gateway-adapter-contract";

export const MODEL_GATEWAY_REALTIME_UNSUPPORTED_FEASIBILITY =
  "blocked-no-verified-gateway-websocket-proxy-contract";

const MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_REFERENCE =
  "This OpenAI-compatible endpoint is intentionally explicit unsupported until Tracevane Gateway has a verified request/response adapter, auth boundary, runtime usage accounting, and regression tests for the endpoint contract.";

const MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_ALTERNATIVES = [
  "Use /v1/responses, /v1/chat/completions, /v1/messages, image generation, or request-based audio routes currently implemented by Tracevane Gateway.",
  "Connect directly to an upstream provider for this endpoint until Gateway support is implemented and verified.",
];

const REALTIME_UNSUPPORTED_REASON =
  "Gateway does not expose verified Realtime/WebSocket/WebRTC/SIP proxying for this endpoint yet.";

const OPENAI_ENDPOINT_UNSUPPORTED_REASON =
  "Gateway has no verified adapter/auth/usage/test contract for this OpenAI-compatible endpoint yet.";

export function modelGatewayEndpointUnsupportedPayload(
  endpoint: string,
  alternatives: string[] = [],
): ModelGatewayUnsupportedErrorPayload {
  return {
    error: {
      code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
      message: `Tracevane Gateway does not expose ${endpoint} yet.`,
      details: {
        endpoint,
        feasibility: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_FEASIBILITY,
        reference: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_REFERENCE,
        alternatives: alternatives.length ? alternatives : MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_ALTERNATIVES,
      },
    },
  };
}

const REALTIME_UNSUPPORTED_ENDPOINTS: ModelGatewayUnsupportedEndpointDefinition[] = [
  {
    method: "WS",
    path: "/v1/responses",
    endpoint: "/v1/responses#websocket",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    websocketPaths: ["/v1/responses"],
  },
  {
    method: "GET/POST/WS",
    path: "/v1/responses/ws",
    endpoint: "/v1/responses/ws",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/responses/ws", endpoint: "/v1/responses/ws" },
      { method: "POST", path: "/v1/responses/ws", endpoint: "/v1/responses/ws" },
    ],
    websocketPaths: ["/v1/responses/ws"],
  },
  {
    method: "GET/POST/WS",
    path: "/v1/realtime",
    endpoint: "/v1/realtime",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/realtime", endpoint: "/v1/realtime" },
      { method: "POST", path: "/v1/realtime", endpoint: "/v1/realtime" },
    ],
    websocketPaths: ["/v1/realtime"],
  },
  {
    method: "POST/WS",
    path: "/v1/realtime/calls",
    endpoint: "/v1/realtime/calls",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/realtime/calls", endpoint: "/v1/realtime/calls" }],
    websocketPaths: ["/v1/realtime/calls"],
  },
  {
    method: "POST/WS",
    path: "/v1/realtime/client_secrets",
    endpoint: "/v1/realtime/client_secrets",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/realtime/client_secrets", endpoint: "/v1/realtime/client_secrets" }],
    websocketPaths: ["/v1/realtime/client_secrets"],
  },
  {
    method: "GET/POST/WS",
    path: "/v1/realtime/translations",
    endpoint: "/v1/realtime/translations",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/realtime/translations", endpoint: "/v1/realtime/translations" },
      { method: "POST", path: "/v1/realtime/translations", endpoint: "/v1/realtime/translations" },
    ],
    websocketPaths: ["/v1/realtime/translations"],
  },
  {
    method: "POST/WS",
    path: "/v1/realtime/translations/calls",
    endpoint: "/v1/realtime/translations/calls",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/realtime/translations/calls", endpoint: "/v1/realtime/translations/calls" }],
    websocketPaths: ["/v1/realtime/translations/calls"],
  },
  {
    method: "POST/WS",
    path: "/v1/realtime/translations/client_secrets",
    endpoint: "/v1/realtime/translations/client_secrets",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "POST",
        path: "/v1/realtime/translations/client_secrets",
        endpoint: "/v1/realtime/translations/client_secrets",
      },
    ],
    websocketPaths: ["/v1/realtime/translations/client_secrets"],
  },
  {
    method: "GET/POST/WS",
    path: "/v1/realtime/transcription_sessions",
    endpoint: "/v1/realtime/transcription_sessions",
    code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
    reason: REALTIME_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "GET",
        path: "/v1/realtime/transcription_sessions",
        endpoint: "/v1/realtime/transcription_sessions",
      },
      {
        method: "POST",
        path: "/v1/realtime/transcription_sessions",
        endpoint: "/v1/realtime/transcription_sessions",
      },
    ],
    websocketPaths: ["/v1/realtime/transcription_sessions"],
  },
];

const OPENAI_UNSUPPORTED_ENDPOINTS: ModelGatewayUnsupportedEndpointDefinition[] = [
  {
    method: "POST",
    path: "/v1/completions",
    endpoint: "/v1/completions",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/completions", endpoint: "/v1/completions" }],
  },
  {
    method: "POST",
    path: "/v1/embeddings",
    endpoint: "/v1/embeddings",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/embeddings", endpoint: "/v1/embeddings" }],
  },
  {
    method: "POST",
    path: "/v1/moderations",
    endpoint: "/v1/moderations",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/moderations", endpoint: "/v1/moderations" }],
  },
  {
    method: "GET/POST",
    path: "/v1/batches",
    endpoint: "/v1/batches",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/batches", endpoint: "/v1/batches" },
      { method: "POST", path: "/v1/batches", endpoint: "/v1/batches" },
    ],
  },
  {
    method: "GET",
    path: "/v1/batches/{batch_id}",
    endpoint: "/v1/batches/{batch_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/batches/:batchId", endpoint: "/v1/batches/{batch_id}" }],
  },
  {
    method: "POST",
    path: "/v1/batches/{batch_id}/cancel",
    endpoint: "/v1/batches/{batch_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/batches/:batchId/cancel", endpoint: "/v1/batches/{batch_id}/cancel" }],
  },
  {
    method: "GET/POST",
    path: "/v1/fine_tuning/jobs",
    endpoint: "/v1/fine_tuning/jobs",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/fine_tuning/jobs", endpoint: "/v1/fine_tuning/jobs" },
      { method: "POST", path: "/v1/fine_tuning/jobs", endpoint: "/v1/fine_tuning/jobs" },
      { method: "GET", path: "/v1/fine-tuning/jobs", endpoint: "/v1/fine_tuning/jobs" },
      { method: "POST", path: "/v1/fine-tuning/jobs", endpoint: "/v1/fine_tuning/jobs" },
    ],
  },
  {
    method: "GET",
    path: "/v1/fine_tuning/jobs/{job_id}",
    endpoint: "/v1/fine_tuning/jobs/{job_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/fine_tuning/jobs/:jobId", endpoint: "/v1/fine_tuning/jobs/{job_id}" },
      { method: "GET", path: "/v1/fine-tuning/jobs/:jobId", endpoint: "/v1/fine_tuning/jobs/{job_id}" },
    ],
  },
  {
    method: "POST",
    path: "/v1/fine_tuning/jobs/{job_id}/cancel",
    endpoint: "/v1/fine_tuning/jobs/{job_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "POST",
        path: "/v1/fine_tuning/jobs/:jobId/cancel",
        endpoint: "/v1/fine_tuning/jobs/{job_id}/cancel",
      },
      {
        method: "POST",
        path: "/v1/fine-tuning/jobs/:jobId/cancel",
        endpoint: "/v1/fine_tuning/jobs/{job_id}/cancel",
      },
    ],
  },
  {
    method: "GET",
    path: "/v1/fine_tuning/jobs/{job_id}/events",
    endpoint: "/v1/fine_tuning/jobs/{job_id}/events",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/fine_tuning/jobs/:jobId/events", endpoint: "/v1/fine_tuning/jobs/{job_id}/events" },
      { method: "GET", path: "/v1/fine-tuning/jobs/:jobId/events", endpoint: "/v1/fine_tuning/jobs/{job_id}/events" },
    ],
  },
  {
    method: "POST",
    path: "/v1/fine_tuning/jobs/{job_id}/pause",
    endpoint: "/v1/fine_tuning/jobs/{job_id}/pause",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "POST", path: "/v1/fine_tuning/jobs/:jobId/pause", endpoint: "/v1/fine_tuning/jobs/{job_id}/pause" },
      { method: "POST", path: "/v1/fine-tuning/jobs/:jobId/pause", endpoint: "/v1/fine_tuning/jobs/{job_id}/pause" },
    ],
  },
  {
    method: "POST",
    path: "/v1/fine_tuning/jobs/{job_id}/resume",
    endpoint: "/v1/fine_tuning/jobs/{job_id}/resume",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "POST", path: "/v1/fine_tuning/jobs/:jobId/resume", endpoint: "/v1/fine_tuning/jobs/{job_id}/resume" },
      { method: "POST", path: "/v1/fine-tuning/jobs/:jobId/resume", endpoint: "/v1/fine_tuning/jobs/{job_id}/resume" },
    ],
  },
  {
    method: "GET",
    path: "/v1/fine_tuning/jobs/{job_id}/checkpoints",
    endpoint: "/v1/fine_tuning/jobs/{job_id}/checkpoints",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/fine_tuning/jobs/:jobId/checkpoints", endpoint: "/v1/fine_tuning/jobs/{job_id}/checkpoints" },
      { method: "GET", path: "/v1/fine-tuning/jobs/:jobId/checkpoints", endpoint: "/v1/fine_tuning/jobs/{job_id}/checkpoints" },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/assistants",
    endpoint: "/v1/assistants",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/assistants", endpoint: "/v1/assistants" },
      { method: "POST", path: "/v1/assistants", endpoint: "/v1/assistants" },
    ],
  },
  {
    method: "GET",
    path: "/v1/assistants/{assistant_id}",
    endpoint: "/v1/assistants/{assistant_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/assistants/:assistantId", endpoint: "/v1/assistants/{assistant_id}" }],
  },
  {
    method: "POST",
    path: "/v1/threads",
    endpoint: "/v1/threads",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/threads", endpoint: "/v1/threads" }],
  },
  {
    method: "GET",
    path: "/v1/threads/{thread_id}",
    endpoint: "/v1/threads/{thread_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/threads/:threadId", endpoint: "/v1/threads/{thread_id}" }],
  },
  {
    method: "GET/POST",
    path: "/v1/threads/{thread_id}/messages",
    endpoint: "/v1/threads/{thread_id}/messages",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/threads/:threadId/messages", endpoint: "/v1/threads/{thread_id}/messages" },
      { method: "POST", path: "/v1/threads/:threadId/messages", endpoint: "/v1/threads/{thread_id}/messages" },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/threads/{thread_id}/runs",
    endpoint: "/v1/threads/{thread_id}/runs",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/threads/:threadId/runs", endpoint: "/v1/threads/{thread_id}/runs" },
      { method: "POST", path: "/v1/threads/:threadId/runs", endpoint: "/v1/threads/{thread_id}/runs" },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/files",
    endpoint: "/v1/files",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/files", endpoint: "/v1/files" },
      { method: "POST", path: "/v1/files", endpoint: "/v1/files" },
    ],
  },
  {
    method: "GET/DELETE",
    path: "/v1/files/{file_id}",
    endpoint: "/v1/files/{file_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/files/:fileId", endpoint: "/v1/files/{file_id}" },
      { method: "DELETE", path: "/v1/files/:fileId", endpoint: "/v1/files/{file_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/files/{file_id}/content",
    endpoint: "/v1/files/{file_id}/content",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/files/:fileId/content", endpoint: "/v1/files/{file_id}/content" }],
  },
  {
    method: "POST",
    path: "/v1/uploads",
    endpoint: "/v1/uploads",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/uploads", endpoint: "/v1/uploads" }],
  },
  {
    method: "POST",
    path: "/v1/uploads/{upload_id}/parts",
    endpoint: "/v1/uploads/{upload_id}/parts",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/uploads/:uploadId/parts", endpoint: "/v1/uploads/{upload_id}/parts" }],
  },
  {
    method: "POST",
    path: "/v1/uploads/{upload_id}/complete",
    endpoint: "/v1/uploads/{upload_id}/complete",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/uploads/:uploadId/complete", endpoint: "/v1/uploads/{upload_id}/complete" }],
  },
  {
    method: "POST",
    path: "/v1/uploads/{upload_id}/cancel",
    endpoint: "/v1/uploads/{upload_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/uploads/:uploadId/cancel", endpoint: "/v1/uploads/{upload_id}/cancel" }],
  },
  {
    method: "GET/POST",
    path: "/v1/vector_stores",
    endpoint: "/v1/vector_stores",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/vector_stores", endpoint: "/v1/vector_stores" },
      { method: "POST", path: "/v1/vector_stores", endpoint: "/v1/vector_stores" },
    ],
  },
  {
    method: "GET/POST/DELETE",
    path: "/v1/vector_stores/{vector_store_id}",
    endpoint: "/v1/vector_stores/{vector_store_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/vector_stores/:vectorStoreId", endpoint: "/v1/vector_stores/{vector_store_id}" },
      { method: "POST", path: "/v1/vector_stores/:vectorStoreId", endpoint: "/v1/vector_stores/{vector_store_id}" },
      { method: "DELETE", path: "/v1/vector_stores/:vectorStoreId", endpoint: "/v1/vector_stores/{vector_store_id}" },
    ],
  },
  {
    method: "POST",
    path: "/v1/vector_stores/{vector_store_id}/search",
    endpoint: "/v1/vector_stores/{vector_store_id}/search",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/vector_stores/:vectorStoreId/search", endpoint: "/v1/vector_stores/{vector_store_id}/search" }],
  },
  {
    method: "GET/POST",
    path: "/v1/vector_stores/{vector_store_id}/files",
    endpoint: "/v1/vector_stores/{vector_store_id}/files",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/vector_stores/:vectorStoreId/files", endpoint: "/v1/vector_stores/{vector_store_id}/files" },
      { method: "POST", path: "/v1/vector_stores/:vectorStoreId/files", endpoint: "/v1/vector_stores/{vector_store_id}/files" },
    ],
  },
  {
    method: "GET/POST/DELETE",
    path: "/v1/vector_stores/{vector_store_id}/files/{file_id}",
    endpoint: "/v1/vector_stores/{vector_store_id}/files/{file_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/vector_stores/:vectorStoreId/files/:fileId", endpoint: "/v1/vector_stores/{vector_store_id}/files/{file_id}" },
      { method: "POST", path: "/v1/vector_stores/:vectorStoreId/files/:fileId", endpoint: "/v1/vector_stores/{vector_store_id}/files/{file_id}" },
      { method: "DELETE", path: "/v1/vector_stores/:vectorStoreId/files/:fileId", endpoint: "/v1/vector_stores/{vector_store_id}/files/{file_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/vector_stores/{vector_store_id}/files/{file_id}/content",
    endpoint: "/v1/vector_stores/{vector_store_id}/files/{file_id}/content",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/vector_stores/:vectorStoreId/files/:fileId/content", endpoint: "/v1/vector_stores/{vector_store_id}/files/{file_id}/content" }],
  },
  {
    method: "POST",
    path: "/v1/vector_stores/{vector_store_id}/file_batches",
    endpoint: "/v1/vector_stores/{vector_store_id}/file_batches",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/vector_stores/:vectorStoreId/file_batches", endpoint: "/v1/vector_stores/{vector_store_id}/file_batches" }],
  },
  {
    method: "GET",
    path: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}",
    endpoint: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/vector_stores/:vectorStoreId/file_batches/:batchId", endpoint: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}" }],
  },
  {
    method: "GET",
    path: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/files",
    endpoint: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/files",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/vector_stores/:vectorStoreId/file_batches/:batchId/files", endpoint: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/files" }],
  },
  {
    method: "POST",
    path: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/cancel",
    endpoint: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/vector_stores/:vectorStoreId/file_batches/:batchId/cancel", endpoint: "/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/cancel" }],
  },
  {
    method: "POST",
    path: "/v1/videos",
    endpoint: "/v1/videos",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/videos", endpoint: "/v1/videos" }],
  },
  {
    method: "GET",
    path: "/v1/videos/{video_id}",
    endpoint: "/v1/videos/{video_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/videos/:videoId", endpoint: "/v1/videos/{video_id}" }],
  },
];

const UNSUPPORTED_ENDPOINT_DEFINITIONS: ModelGatewayUnsupportedEndpointDefinition[] = [
  ...REALTIME_UNSUPPORTED_ENDPOINTS,
  ...OPENAI_UNSUPPORTED_ENDPOINTS,
];

export const MODEL_GATEWAY_UNSUPPORTED_ENDPOINTS: ModelGatewayUnsupportedEndpoint[] =
  UNSUPPORTED_ENDPOINT_DEFINITIONS.map(({ method, path, endpoint, code, reason }) => ({
    method,
    path,
    endpoint,
    code,
    reason,
  }));

export const MODEL_GATEWAY_UNSUPPORTED_HTTP_ROUTES: ModelGatewayUnsupportedHttpRoute[] =
  UNSUPPORTED_ENDPOINT_DEFINITIONS.flatMap((definition) =>
    (definition.httpRoutes || []).map((route) => ({
      ...route,
      code: definition.code,
    }))
  );

export const MODEL_GATEWAY_REALTIME_UNSUPPORTED_UPGRADE_PATHS: string[] = [
  ...new Set(REALTIME_UNSUPPORTED_ENDPOINTS.flatMap((definition) => definition.websocketPaths || [])),
];
