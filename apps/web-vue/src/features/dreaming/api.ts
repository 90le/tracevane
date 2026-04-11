import { requestJson } from '../../shared/api';
import type {
  DreamingActionResponse,
  DreamingDiaryPayload,
  DreamingMemoryCompatibilityApplyResponse,
  DreamingMemoryCompatibilityPayload,
  DreamingRemHarnessPayload,
  DreamingRepairResponse,
  DreamingSnapshotPayload,
  DreamingToggleRequest,
  DreamingToggleResponse,
} from '../../../../../types/dreaming';

export function fetchDreamingSnapshot(): Promise<DreamingSnapshotPayload> {
  return requestJson<DreamingSnapshotPayload>('/api/system/dreaming');
}

export function fetchDreamingDiary(): Promise<DreamingDiaryPayload> {
  return requestJson<DreamingDiaryPayload>('/api/system/dreaming/diary');
}

export function fetchDreamingMemoryCompatibility(): Promise<DreamingMemoryCompatibilityPayload> {
  return requestJson<DreamingMemoryCompatibilityPayload>('/api/system/dreaming/compatibility');
}

export function applyDreamingMemoryCompatibility(): Promise<DreamingMemoryCompatibilityApplyResponse> {
  return requestJson<DreamingMemoryCompatibilityApplyResponse>('/api/system/dreaming/compatibility/apply', {
    method: 'POST',
  });
}

export function fetchDreamingRemHarnessPreview(): Promise<DreamingRemHarnessPayload> {
  return requestJson<DreamingRemHarnessPayload>('/api/system/dreaming/rem-harness');
}

export function backfillDreamingDiary(): Promise<DreamingActionResponse> {
  return requestJson<DreamingActionResponse>('/api/system/dreaming/backfill', {
    method: 'POST',
  });
}

export function resetDreamingDiary(): Promise<DreamingActionResponse> {
  return requestJson<DreamingActionResponse>('/api/system/dreaming/reset-diary', {
    method: 'POST',
  });
}

export function clearGroundedDreamingSignals(): Promise<DreamingActionResponse> {
  return requestJson<DreamingActionResponse>('/api/system/dreaming/clear-grounded', {
    method: 'POST',
  });
}

export function repairDreamingConfig(): Promise<DreamingRepairResponse> {
  return requestJson<DreamingRepairResponse>('/api/system/dreaming/repair', {
    method: 'POST',
  });
}

export function toggleDreamingEnabled(payload: DreamingToggleRequest): Promise<DreamingToggleResponse> {
  return requestJson<DreamingToggleResponse>('/api/system/dreaming/toggle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
