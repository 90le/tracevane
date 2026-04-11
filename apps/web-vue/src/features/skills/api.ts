import { requestJson } from '../../shared/api';
import type {
  SkillConfigPayload,
  SkillConfigSaveResponse,
  SkillConfigUpdatePayload,
  SkillsMaintenanceResponse,
  SkillSecretPayload,
  SkillTogglePayload,
  SkillsMarketplaceInstallPayload,
  SkillsMarketplaceInstallResponse,
  SkillsMarketplacePayload,
  SkillsMarketplaceSort,
  SkillsMarketplaceSourceId,
  SkillsMarketplaceSourcesPayload,
  SkillsPreflightPayload,
  SkillsPreflightResult,
  SkillsSummaryPayload,
} from '../../../../../types/skills';

export function fetchSkillsSummary(refresh = false): Promise<SkillsSummaryPayload> {
  const search = refresh ? '?refresh=1' : '';
  return requestJson<SkillsSummaryPayload>(`/api/skills${search}`);
}

export function toggleSkill(payload: SkillTogglePayload): Promise<SkillTogglePayload> {
  return requestJson<SkillTogglePayload>(`/api/skills/${encodeURIComponent(payload.slug)}/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled: payload.enabled }),
  });
}

export function fetchSkillConfig(slug: string): Promise<SkillConfigPayload> {
  return requestJson<SkillConfigPayload>(`/api/skills/${encodeURIComponent(slug)}/config`);
}

export function saveSkillConfig(slug: string, payload: SkillConfigUpdatePayload): Promise<SkillConfigSaveResponse> {
  return requestJson<SkillConfigSaveResponse>(`/api/skills/${encodeURIComponent(slug)}/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function fetchSkillSecret(slug: string): Promise<SkillSecretPayload> {
  return requestJson<SkillSecretPayload>(`/api/skills/${encodeURIComponent(slug)}/secret`);
}

export function fetchMarketplaceSources(): Promise<SkillsMarketplaceSourcesPayload> {
  return requestJson<SkillsMarketplaceSourcesPayload>('/api/marketplace/sources');
}

export function fetchMarketplaceSkills(options: {
  sourceId: SkillsMarketplaceSourceId;
  query?: string;
  sort?: SkillsMarketplaceSort;
  page?: number;
  pageSize?: number;
}): Promise<SkillsMarketplacePayload> {
  const url = new URL('/api/marketplace/skills', window.location.origin);
  url.searchParams.set('source', options.sourceId);
  if (options.query?.trim()) url.searchParams.set('q', options.query.trim());
  if (options.sort) url.searchParams.set('sort', options.sort);
  if (options.page) url.searchParams.set('page', String(options.page));
  if (options.pageSize) url.searchParams.set('pageSize', String(options.pageSize));

  return requestJson<SkillsMarketplacePayload>(`${url.pathname}${url.search}`);
}

export function installMarketplaceSkill(payload: SkillsMarketplaceInstallPayload): Promise<SkillsMarketplaceInstallResponse> {
  return requestJson<SkillsMarketplaceInstallResponse>('/api/marketplace/install', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function preflightMarketplaceSkill(payload: SkillsPreflightPayload): Promise<SkillsPreflightResult> {
  return requestJson<SkillsPreflightResult>('/api/marketplace/preflight', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function updateInstalledSkill(slug: string, sourceId?: SkillsMarketplaceSourceId): Promise<SkillsMaintenanceResponse> {
  return requestJson<SkillsMaintenanceResponse>(`/api/skills/${encodeURIComponent(slug)}/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sourceId }),
  });
}

export function uninstallSkill(slug: string): Promise<SkillsMaintenanceResponse> {
  return requestJson<SkillsMaintenanceResponse>(`/api/skills/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}
