import { requestJson } from "../../shared/api";
import type {
  CronDetailPayload,
  CronJobInput,
  CronMutationResponse,
  CronRunResponse,
  CronSummaryPayload,
} from "../../../../../types/cron";

function jsonRequest<T>(
  input: string,
  method: "POST" | "PUT",
  body?: unknown,
): Promise<T> {
  return requestJson<T>(input, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function fetchCronSummary(): Promise<CronSummaryPayload> {
  return requestJson<CronSummaryPayload>("/api/cron");
}

export function fetchCronDetail(jobId: string): Promise<CronDetailPayload> {
  return requestJson<CronDetailPayload>(
    `/api/cron/${encodeURIComponent(jobId)}`,
  );
}

export function createCronJob(
  payload: CronJobInput,
): Promise<CronMutationResponse> {
  return jsonRequest<CronMutationResponse>("/api/cron", "POST", payload);
}

export function updateCronJob(
  jobId: string,
  payload: CronJobInput,
): Promise<CronMutationResponse> {
  return jsonRequest<CronMutationResponse>(
    `/api/cron/${encodeURIComponent(jobId)}`,
    "PUT",
    payload,
  );
}

export function deleteCronJob(jobId: string): Promise<CronMutationResponse> {
  return requestJson<CronMutationResponse>(
    `/api/cron/${encodeURIComponent(jobId)}`,
    {
      method: "DELETE",
    },
  );
}

export function toggleCronJob(
  jobId: string,
  enabled: boolean,
): Promise<CronMutationResponse> {
  return jsonRequest<CronMutationResponse>(
    `/api/cron/${encodeURIComponent(jobId)}/toggle`,
    "POST",
    { enabled },
  );
}

export function runCronJob(jobId: string): Promise<CronRunResponse> {
  return jsonRequest<CronRunResponse>(
    `/api/cron/${encodeURIComponent(jobId)}/run`,
    "POST",
  );
}
