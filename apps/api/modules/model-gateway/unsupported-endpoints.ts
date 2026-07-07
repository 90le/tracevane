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



type OpenAiAdminUnsupportedRouteSpec = {
  method: ModelGatewayUnsupportedHttpMethod;
  path: string;
};

function openAiAdminUnsupportedEndpoint(
  method: string,
  endpoint: string,
  httpRoutes: OpenAiAdminUnsupportedRouteSpec[],
): ModelGatewayUnsupportedEndpointDefinition {
  return {
    method,
    path: endpoint,
    endpoint,
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: httpRoutes.map((route) => ({ ...route, endpoint })),
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
    method: "GET",
    path: "/v1/chat/completions",
    endpoint: "/v1/chat/completions#stored",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/chat/completions", endpoint: "/v1/chat/completions#stored" }],
  },
  {
    method: "GET/POST/DELETE",
    path: "/v1/chat/completions/{completion_id}",
    endpoint: "/v1/chat/completions/{completion_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/chat/completions/:completionId", endpoint: "/v1/chat/completions/{completion_id}" },
      { method: "POST", path: "/v1/chat/completions/:completionId", endpoint: "/v1/chat/completions/{completion_id}" },
      { method: "DELETE", path: "/v1/chat/completions/:completionId", endpoint: "/v1/chat/completions/{completion_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/chat/completions/{completion_id}/messages",
    endpoint: "/v1/chat/completions/{completion_id}/messages",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/chat/completions/:completionId/messages", endpoint: "/v1/chat/completions/{completion_id}/messages" }],
  },
  {
    method: "DELETE",
    path: "/v1/models/{model}",
    endpoint: "/v1/models/{model}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "DELETE", path: "/v1/models/:model", endpoint: "/v1/models/{model}" },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/containers",
    endpoint: "/v1/containers",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/containers", endpoint: "/v1/containers" },
      { method: "POST", path: "/v1/containers", endpoint: "/v1/containers" },
    ],
  },
  {
    method: "GET/DELETE",
    path: "/v1/containers/{container_id}",
    endpoint: "/v1/containers/{container_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/containers/:containerId", endpoint: "/v1/containers/{container_id}" },
      { method: "DELETE", path: "/v1/containers/:containerId", endpoint: "/v1/containers/{container_id}" },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/containers/{container_id}/files",
    endpoint: "/v1/containers/{container_id}/files",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/containers/:containerId/files", endpoint: "/v1/containers/{container_id}/files" },
      { method: "POST", path: "/v1/containers/:containerId/files", endpoint: "/v1/containers/{container_id}/files" },
    ],
  },
  {
    method: "GET/DELETE",
    path: "/v1/containers/{container_id}/files/{file_id}",
    endpoint: "/v1/containers/{container_id}/files/{file_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/containers/:containerId/files/:fileId", endpoint: "/v1/containers/{container_id}/files/{file_id}" },
      { method: "DELETE", path: "/v1/containers/:containerId/files/:fileId", endpoint: "/v1/containers/{container_id}/files/{file_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/containers/{container_id}/files/{file_id}/content",
    endpoint: "/v1/containers/{container_id}/files/{file_id}/content",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "GET",
        path: "/v1/containers/:containerId/files/:fileId/content",
        endpoint: "/v1/containers/{container_id}/files/{file_id}/content",
      },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/skills",
    endpoint: "/v1/skills",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/skills", endpoint: "/v1/skills" },
      { method: "POST", path: "/v1/skills", endpoint: "/v1/skills" },
    ],
  },
  {
    method: "GET/POST/DELETE",
    path: "/v1/skills/{skill_id}",
    endpoint: "/v1/skills/{skill_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/skills/:skillId", endpoint: "/v1/skills/{skill_id}" },
      { method: "POST", path: "/v1/skills/:skillId", endpoint: "/v1/skills/{skill_id}" },
      { method: "DELETE", path: "/v1/skills/:skillId", endpoint: "/v1/skills/{skill_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/skills/{skill_id}/content",
    endpoint: "/v1/skills/{skill_id}/content",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/skills/:skillId/content", endpoint: "/v1/skills/{skill_id}/content" }],
  },
  {
    method: "GET/POST",
    path: "/v1/skills/{skill_id}/versions",
    endpoint: "/v1/skills/{skill_id}/versions",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/skills/:skillId/versions", endpoint: "/v1/skills/{skill_id}/versions" },
      { method: "POST", path: "/v1/skills/:skillId/versions", endpoint: "/v1/skills/{skill_id}/versions" },
    ],
  },
  {
    method: "GET/DELETE",
    path: "/v1/skills/{skill_id}/versions/{version_id}",
    endpoint: "/v1/skills/{skill_id}/versions/{version_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/skills/:skillId/versions/:versionId", endpoint: "/v1/skills/{skill_id}/versions/{version_id}" },
      { method: "DELETE", path: "/v1/skills/:skillId/versions/:versionId", endpoint: "/v1/skills/{skill_id}/versions/{version_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/skills/{skill_id}/versions/{version_id}/content",
    endpoint: "/v1/skills/{skill_id}/versions/{version_id}/content",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "GET",
        path: "/v1/skills/:skillId/versions/:versionId/content",
        endpoint: "/v1/skills/{skill_id}/versions/{version_id}/content",
      },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/evals",
    endpoint: "/v1/evals",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/evals", endpoint: "/v1/evals" },
      { method: "POST", path: "/v1/evals", endpoint: "/v1/evals" },
    ],
  },
  {
    method: "GET/POST/DELETE",
    path: "/v1/evals/{eval_id}",
    endpoint: "/v1/evals/{eval_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/evals/:evalId", endpoint: "/v1/evals/{eval_id}" },
      { method: "POST", path: "/v1/evals/:evalId", endpoint: "/v1/evals/{eval_id}" },
      { method: "DELETE", path: "/v1/evals/:evalId", endpoint: "/v1/evals/{eval_id}" },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/evals/{eval_id}/runs",
    endpoint: "/v1/evals/{eval_id}/runs",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/evals/:evalId/runs", endpoint: "/v1/evals/{eval_id}/runs" },
      { method: "POST", path: "/v1/evals/:evalId/runs", endpoint: "/v1/evals/{eval_id}/runs" },
    ],
  },
  {
    method: "GET/DELETE",
    path: "/v1/evals/{eval_id}/runs/{run_id}",
    endpoint: "/v1/evals/{eval_id}/runs/{run_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/evals/:evalId/runs/:runId", endpoint: "/v1/evals/{eval_id}/runs/{run_id}" },
      { method: "DELETE", path: "/v1/evals/:evalId/runs/:runId", endpoint: "/v1/evals/{eval_id}/runs/{run_id}" },
    ],
  },
  {
    method: "POST",
    path: "/v1/evals/{eval_id}/runs/{run_id}/cancel",
    endpoint: "/v1/evals/{eval_id}/runs/{run_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/evals/:evalId/runs/:runId/cancel", endpoint: "/v1/evals/{eval_id}/runs/{run_id}/cancel" }],
  },
  {
    method: "GET",
    path: "/v1/evals/{eval_id}/runs/{run_id}/output_items",
    endpoint: "/v1/evals/{eval_id}/runs/{run_id}/output_items",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/evals/:evalId/runs/:runId/output_items", endpoint: "/v1/evals/{eval_id}/runs/{run_id}/output_items" }],
  },
  {
    method: "GET",
    path: "/v1/evals/{eval_id}/runs/{run_id}/output_items/{output_item_id}",
    endpoint: "/v1/evals/{eval_id}/runs/{run_id}/output_items/{output_item_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "GET",
        path: "/v1/evals/:evalId/runs/:runId/output_items/:outputItemId",
        endpoint: "/v1/evals/{eval_id}/runs/{run_id}/output_items/{output_item_id}",
      },
    ],
  },
  {
    method: "POST",
    path: "/v1/fine_tuning/alpha/graders/run",
    endpoint: "/v1/fine_tuning/alpha/graders/run",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "POST", path: "/v1/fine_tuning/alpha/graders/run", endpoint: "/v1/fine_tuning/alpha/graders/run" },
      { method: "POST", path: "/v1/fine-tuning/alpha/graders/run", endpoint: "/v1/fine_tuning/alpha/graders/run" },
    ],
  },
  {
    method: "POST",
    path: "/v1/fine_tuning/alpha/graders/validate",
    endpoint: "/v1/fine_tuning/alpha/graders/validate",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "POST", path: "/v1/fine_tuning/alpha/graders/validate", endpoint: "/v1/fine_tuning/alpha/graders/validate" },
      { method: "POST", path: "/v1/fine-tuning/alpha/graders/validate", endpoint: "/v1/fine_tuning/alpha/graders/validate" },
    ],
  },
  {
    method: "POST",
    path: "/v1/chatkit/sessions",
    endpoint: "/v1/chatkit/sessions",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/chatkit/sessions", endpoint: "/v1/chatkit/sessions" }],
  },
  {
    method: "POST",
    path: "/v1/chatkit/sessions/{session_id}/cancel",
    endpoint: "/v1/chatkit/sessions/{session_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/chatkit/sessions/:sessionId/cancel", endpoint: "/v1/chatkit/sessions/{session_id}/cancel" }],
  },
  {
    method: "GET",
    path: "/v1/chatkit/threads",
    endpoint: "/v1/chatkit/threads",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/chatkit/threads", endpoint: "/v1/chatkit/threads" }],
  },
  {
    method: "GET/DELETE",
    path: "/v1/chatkit/threads/{thread_id}",
    endpoint: "/v1/chatkit/threads/{thread_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/chatkit/threads/:threadId", endpoint: "/v1/chatkit/threads/{thread_id}" },
      { method: "DELETE", path: "/v1/chatkit/threads/:threadId", endpoint: "/v1/chatkit/threads/{thread_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/chatkit/threads/{thread_id}/items",
    endpoint: "/v1/chatkit/threads/{thread_id}/items",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/chatkit/threads/:threadId/items", endpoint: "/v1/chatkit/threads/{thread_id}/items" }],
  },
  {
    method: "POST",
    path: "/v1/responses/input_tokens",
    endpoint: "/v1/responses/input_tokens",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/responses/input_tokens", endpoint: "/v1/responses/input_tokens" }],
  },
  {
    method: "GET/DELETE",
    path: "/v1/responses/{response_id}",
    endpoint: "/v1/responses/{response_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/responses/:responseId", endpoint: "/v1/responses/{response_id}" },
      { method: "DELETE", path: "/v1/responses/:responseId", endpoint: "/v1/responses/{response_id}" },
    ],
  },
  {
    method: "GET",
    path: "/v1/responses/{response_id}/input_items",
    endpoint: "/v1/responses/{response_id}/input_items",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/responses/:responseId/input_items", endpoint: "/v1/responses/{response_id}/input_items" }],
  },
  {
    method: "POST",
    path: "/v1/responses/{response_id}/cancel",
    endpoint: "/v1/responses/{response_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/responses/:responseId/cancel", endpoint: "/v1/responses/{response_id}/cancel" }],
  },
  {
    method: "POST",
    path: "/v1/conversations",
    endpoint: "/v1/conversations",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/conversations", endpoint: "/v1/conversations" }],
  },
  {
    method: "GET/POST/DELETE",
    path: "/v1/conversations/{conversation_id}",
    endpoint: "/v1/conversations/{conversation_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/conversations/:conversationId", endpoint: "/v1/conversations/{conversation_id}" },
      { method: "POST", path: "/v1/conversations/:conversationId", endpoint: "/v1/conversations/{conversation_id}" },
      { method: "DELETE", path: "/v1/conversations/:conversationId", endpoint: "/v1/conversations/{conversation_id}" },
    ],
  },
  {
    method: "GET/POST",
    path: "/v1/conversations/{conversation_id}/items",
    endpoint: "/v1/conversations/{conversation_id}/items",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/conversations/:conversationId/items", endpoint: "/v1/conversations/{conversation_id}/items" },
      { method: "POST", path: "/v1/conversations/:conversationId/items", endpoint: "/v1/conversations/{conversation_id}/items" },
    ],
  },
  {
    method: "GET/DELETE",
    path: "/v1/conversations/{conversation_id}/items/{item_id}",
    endpoint: "/v1/conversations/{conversation_id}/items/{item_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/conversations/:conversationId/items/:itemId", endpoint: "/v1/conversations/{conversation_id}/items/{item_id}" },
      { method: "DELETE", path: "/v1/conversations/:conversationId/items/:itemId", endpoint: "/v1/conversations/{conversation_id}/items/{item_id}" },
    ],
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
    method: "GET/POST/DELETE",
    path: "/v1/assistants/{assistant_id}",
    endpoint: "/v1/assistants/{assistant_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/assistants/:assistantId", endpoint: "/v1/assistants/{assistant_id}" },
      { method: "POST", path: "/v1/assistants/:assistantId", endpoint: "/v1/assistants/{assistant_id}" },
      { method: "DELETE", path: "/v1/assistants/:assistantId", endpoint: "/v1/assistants/{assistant_id}" },
    ],
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
    method: "POST",
    path: "/v1/threads/runs",
    endpoint: "/v1/threads/runs",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/threads/runs", endpoint: "/v1/threads/runs" }],
  },
  {
    method: "GET/POST/DELETE",
    path: "/v1/threads/{thread_id}",
    endpoint: "/v1/threads/{thread_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/threads/:threadId", endpoint: "/v1/threads/{thread_id}" },
      { method: "POST", path: "/v1/threads/:threadId", endpoint: "/v1/threads/{thread_id}" },
      { method: "DELETE", path: "/v1/threads/:threadId", endpoint: "/v1/threads/{thread_id}" },
    ],
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
    method: "GET/POST/DELETE",
    path: "/v1/threads/{thread_id}/messages/{message_id}",
    endpoint: "/v1/threads/{thread_id}/messages/{message_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/threads/:threadId/messages/:messageId", endpoint: "/v1/threads/{thread_id}/messages/{message_id}" },
      { method: "POST", path: "/v1/threads/:threadId/messages/:messageId", endpoint: "/v1/threads/{thread_id}/messages/{message_id}" },
      { method: "DELETE", path: "/v1/threads/:threadId/messages/:messageId", endpoint: "/v1/threads/{thread_id}/messages/{message_id}" },
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
    path: "/v1/threads/{thread_id}/runs/{run_id}",
    endpoint: "/v1/threads/{thread_id}/runs/{run_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      { method: "GET", path: "/v1/threads/:threadId/runs/:runId", endpoint: "/v1/threads/{thread_id}/runs/{run_id}" },
      { method: "POST", path: "/v1/threads/:threadId/runs/:runId", endpoint: "/v1/threads/{thread_id}/runs/{run_id}" },
    ],
  },
  {
    method: "POST",
    path: "/v1/threads/{thread_id}/runs/{run_id}/submit_tool_outputs",
    endpoint: "/v1/threads/{thread_id}/runs/{run_id}/submit_tool_outputs",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "POST",
        path: "/v1/threads/:threadId/runs/:runId/submit_tool_outputs",
        endpoint: "/v1/threads/{thread_id}/runs/{run_id}/submit_tool_outputs",
      },
    ],
  },
  {
    method: "POST",
    path: "/v1/threads/{thread_id}/runs/{run_id}/cancel",
    endpoint: "/v1/threads/{thread_id}/runs/{run_id}/cancel",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "POST", path: "/v1/threads/:threadId/runs/:runId/cancel", endpoint: "/v1/threads/{thread_id}/runs/{run_id}/cancel" }],
  },
  {
    method: "GET",
    path: "/v1/threads/{thread_id}/runs/{run_id}/steps",
    endpoint: "/v1/threads/{thread_id}/runs/{run_id}/steps",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [{ method: "GET", path: "/v1/threads/:threadId/runs/:runId/steps", endpoint: "/v1/threads/{thread_id}/runs/{run_id}/steps" }],
  },
  {
    method: "GET",
    path: "/v1/threads/{thread_id}/runs/{run_id}/steps/{step_id}",
    endpoint: "/v1/threads/{thread_id}/runs/{run_id}/steps/{step_id}",
    code: MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
    reason: OPENAI_ENDPOINT_UNSUPPORTED_REASON,
    httpRoutes: [
      {
        method: "GET",
        path: "/v1/threads/:threadId/runs/:runId/steps/:stepId",
        endpoint: "/v1/threads/{thread_id}/runs/{run_id}/steps/{step_id}",
      },
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

const OPENAI_ORGANIZATION_UNSUPPORTED_ENDPOINTS: ModelGatewayUnsupportedEndpointDefinition[] = [
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/audit_logs", [
    { method: "GET", path: "/v1/organization/audit_logs" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/admin_api_keys", [
    { method: "GET", path: "/v1/organization/admin_api_keys" },
    { method: "POST", path: "/v1/organization/admin_api_keys" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/DELETE", "/v1/organization/admin_api_keys/{key_id}", [
    { method: "GET", path: "/v1/organization/admin_api_keys/:keyId" },
    { method: "DELETE", path: "/v1/organization/admin_api_keys/:keyId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/invites", [
    { method: "GET", path: "/v1/organization/invites" },
    { method: "POST", path: "/v1/organization/invites" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/DELETE", "/v1/organization/invites/{invite_id}", [
    { method: "GET", path: "/v1/organization/invites/:inviteId" },
    { method: "DELETE", path: "/v1/organization/invites/:inviteId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/users", [
    { method: "GET", path: "/v1/organization/users" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/users/{user_id}", [
    { method: "GET", path: "/v1/organization/users/:userId" },
    { method: "POST", path: "/v1/organization/users/:userId" },
    { method: "DELETE", path: "/v1/organization/users/:userId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/users/{user_id}/roles", [
    { method: "GET", path: "/v1/organization/users/:userId/roles" },
    { method: "POST", path: "/v1/organization/users/:userId/roles" },
  ]),
  openAiAdminUnsupportedEndpoint("DELETE", "/v1/organization/users/{user_id}/roles/{role_id}", [
    { method: "DELETE", path: "/v1/organization/users/:userId/roles/:roleId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/groups", [
    { method: "GET", path: "/v1/organization/groups" },
    { method: "POST", path: "/v1/organization/groups" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/groups/{group_id}", [
    { method: "GET", path: "/v1/organization/groups/:groupId" },
    { method: "POST", path: "/v1/organization/groups/:groupId" },
    { method: "DELETE", path: "/v1/organization/groups/:groupId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/groups/{group_id}/users", [
    { method: "GET", path: "/v1/organization/groups/:groupId/users" },
    { method: "POST", path: "/v1/organization/groups/:groupId/users" },
  ]),
  openAiAdminUnsupportedEndpoint("DELETE", "/v1/organization/groups/{group_id}/users/{user_id}", [
    { method: "DELETE", path: "/v1/organization/groups/:groupId/users/:userId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/roles", [
    { method: "GET", path: "/v1/organization/roles" },
    { method: "POST", path: "/v1/organization/roles" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/roles/{role_id}", [
    { method: "GET", path: "/v1/organization/roles/:roleId" },
    { method: "POST", path: "/v1/organization/roles/:roleId" },
    { method: "DELETE", path: "/v1/organization/roles/:roleId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects", [
    { method: "GET", path: "/v1/organization/projects" },
    { method: "POST", path: "/v1/organization/projects" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects/{project_id}", [
    { method: "GET", path: "/v1/organization/projects/:projectId" },
    { method: "POST", path: "/v1/organization/projects/:projectId" },
  ]),
  openAiAdminUnsupportedEndpoint("POST", "/v1/organization/projects/{project_id}/archive", [
    { method: "POST", path: "/v1/organization/projects/:projectId/archive" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects/{project_id}/users", [
    { method: "GET", path: "/v1/organization/projects/:projectId/users" },
    { method: "POST", path: "/v1/organization/projects/:projectId/users" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/projects/{project_id}/users/{user_id}", [
    { method: "GET", path: "/v1/organization/projects/:projectId/users/:userId" },
    { method: "POST", path: "/v1/organization/projects/:projectId/users/:userId" },
    { method: "DELETE", path: "/v1/organization/projects/:projectId/users/:userId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects/{project_id}/users/{user_id}/roles", [
    { method: "GET", path: "/v1/organization/projects/:projectId/users/:userId/roles" },
    { method: "POST", path: "/v1/organization/projects/:projectId/users/:userId/roles" },
  ]),
  openAiAdminUnsupportedEndpoint("DELETE", "/v1/organization/projects/{project_id}/users/{user_id}/roles/{role_id}", [
    { method: "DELETE", path: "/v1/organization/projects/:projectId/users/:userId/roles/:roleId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects/{project_id}/service_accounts", [
    { method: "GET", path: "/v1/organization/projects/:projectId/service_accounts" },
    { method: "POST", path: "/v1/organization/projects/:projectId/service_accounts" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/projects/{project_id}/service_accounts/{service_account_id}", [
    { method: "GET", path: "/v1/organization/projects/:projectId/service_accounts/:serviceAccountId" },
    { method: "POST", path: "/v1/organization/projects/:projectId/service_accounts/:serviceAccountId" },
    { method: "DELETE", path: "/v1/organization/projects/:projectId/service_accounts/:serviceAccountId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/projects/{project_id}/api_keys", [
    { method: "GET", path: "/v1/organization/projects/:projectId/api_keys" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/DELETE", "/v1/organization/projects/{project_id}/api_keys/{key_id}", [
    { method: "GET", path: "/v1/organization/projects/:projectId/api_keys/:keyId" },
    { method: "DELETE", path: "/v1/organization/projects/:projectId/api_keys/:keyId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/projects/{project_id}/rate_limits", [
    { method: "GET", path: "/v1/organization/projects/:projectId/rate_limits" },
  ]),
  openAiAdminUnsupportedEndpoint("POST", "/v1/organization/projects/{project_id}/rate_limits/{rate_limit_id}", [
    { method: "POST", path: "/v1/organization/projects/:projectId/rate_limits/:rateLimitId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/projects/{project_id}/model_permissions/{model_permission_id}", [
    { method: "GET", path: "/v1/organization/projects/:projectId/model_permissions/:modelPermissionId" },
    { method: "POST", path: "/v1/organization/projects/:projectId/model_permissions/:modelPermissionId" },
    { method: "DELETE", path: "/v1/organization/projects/:projectId/model_permissions/:modelPermissionId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects/{project_id}/hosted_tool_permissions/{tool_permission_id}", [
    { method: "GET", path: "/v1/organization/projects/:projectId/hosted_tool_permissions/:toolPermissionId" },
    { method: "POST", path: "/v1/organization/projects/:projectId/hosted_tool_permissions/:toolPermissionId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects/{project_id}/groups", [
    { method: "GET", path: "/v1/organization/projects/:projectId/groups" },
    { method: "POST", path: "/v1/organization/projects/:projectId/groups" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/DELETE", "/v1/organization/projects/{project_id}/groups/{group_id}", [
    { method: "GET", path: "/v1/organization/projects/:projectId/groups/:groupId" },
    { method: "DELETE", path: "/v1/organization/projects/:projectId/groups/:groupId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/projects/{project_id}/groups/{group_id}/roles", [
    { method: "GET", path: "/v1/organization/projects/:projectId/groups/:groupId/roles" },
    { method: "POST", path: "/v1/organization/projects/:projectId/groups/:groupId/roles" },
  ]),
  openAiAdminUnsupportedEndpoint("DELETE", "/v1/organization/projects/{project_id}/groups/{group_id}/roles/{role_id}", [
    { method: "DELETE", path: "/v1/organization/projects/:projectId/groups/:groupId/roles/:roleId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/data_retention", [
    { method: "GET", path: "/v1/organization/data_retention" },
    { method: "POST", path: "/v1/organization/data_retention" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/spend_alerts", [
    { method: "GET", path: "/v1/organization/spend_alerts" },
    { method: "POST", path: "/v1/organization/spend_alerts" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/spend_alerts/{spend_alert_id}", [
    { method: "GET", path: "/v1/organization/spend_alerts/:spendAlertId" },
    { method: "POST", path: "/v1/organization/spend_alerts/:spendAlertId" },
    { method: "DELETE", path: "/v1/organization/spend_alerts/:spendAlertId" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST", "/v1/organization/certificates", [
    { method: "GET", path: "/v1/organization/certificates" },
    { method: "POST", path: "/v1/organization/certificates" },
  ]),
  openAiAdminUnsupportedEndpoint("GET/POST/DELETE", "/v1/organization/certificates/{certificate_id}", [
    { method: "GET", path: "/v1/organization/certificates/:certificateId" },
    { method: "POST", path: "/v1/organization/certificates/:certificateId" },
    { method: "DELETE", path: "/v1/organization/certificates/:certificateId" },
  ]),
  openAiAdminUnsupportedEndpoint("POST", "/v1/organization/certificates/{certificate_id}/activate", [
    { method: "POST", path: "/v1/organization/certificates/:certificateId/activate" },
  ]),
  openAiAdminUnsupportedEndpoint("POST", "/v1/organization/certificates/{certificate_id}/deactivate", [
    { method: "POST", path: "/v1/organization/certificates/:certificateId/deactivate" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/projects/{project_id}/certificates", [
    { method: "GET", path: "/v1/organization/projects/:projectId/certificates" },
  ]),
  openAiAdminUnsupportedEndpoint("POST", "/v1/organization/projects/{project_id}/certificates/{certificate_id}/activate", [
    { method: "POST", path: "/v1/organization/projects/:projectId/certificates/:certificateId/activate" },
  ]),
  openAiAdminUnsupportedEndpoint("POST", "/v1/organization/projects/{project_id}/certificates/{certificate_id}/deactivate", [
    { method: "POST", path: "/v1/organization/projects/:projectId/certificates/:certificateId/deactivate" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/costs", [
    { method: "GET", path: "/v1/organization/costs" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/completions", [
    { method: "GET", path: "/v1/organization/usage/completions" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/embeddings", [
    { method: "GET", path: "/v1/organization/usage/embeddings" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/moderations", [
    { method: "GET", path: "/v1/organization/usage/moderations" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/images", [
    { method: "GET", path: "/v1/organization/usage/images" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/audio_speeches", [
    { method: "GET", path: "/v1/organization/usage/audio_speeches" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/audio_transcriptions", [
    { method: "GET", path: "/v1/organization/usage/audio_transcriptions" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/vector_stores", [
    { method: "GET", path: "/v1/organization/usage/vector_stores" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/code_interpreter_sessions", [
    { method: "GET", path: "/v1/organization/usage/code_interpreter_sessions" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/file_searches", [
    { method: "GET", path: "/v1/organization/usage/file_searches" },
  ]),
  openAiAdminUnsupportedEndpoint("GET", "/v1/organization/usage/web_searches", [
    { method: "GET", path: "/v1/organization/usage/web_searches" },
  ]),
];

const UNSUPPORTED_ENDPOINT_DEFINITIONS: ModelGatewayUnsupportedEndpointDefinition[] = [
  ...REALTIME_UNSUPPORTED_ENDPOINTS,
  ...OPENAI_UNSUPPORTED_ENDPOINTS,
  ...OPENAI_ORGANIZATION_UNSUPPORTED_ENDPOINTS,
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
