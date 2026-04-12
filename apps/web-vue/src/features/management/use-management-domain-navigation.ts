import { computed, type ComputedRef } from 'vue';

import {
  MANAGEMENT_DOMAIN_MANIFEST,
  type ManagementDomainDefinition,
  type ManagementDomainId,
} from './management-domain-manifest';

export interface UseManagementDomainNavigationResult {
  domains: ComputedRef<ReadonlyArray<ManagementDomainDefinition>>;
  activeDomain: ComputedRef<ManagementDomainDefinition | undefined>;
  isActive: (domainId: ManagementDomainId) => boolean;
  toRoute: (domainId: ManagementDomainId) => string;
}

export function useManagementDomainNavigation(activeDomainId: ComputedRef<ManagementDomainId | undefined>): UseManagementDomainNavigationResult {
  const domains = computed(() => MANAGEMENT_DOMAIN_MANIFEST);

  const activeDomain = computed(() =>
    MANAGEMENT_DOMAIN_MANIFEST.find((domain) => domain.id === activeDomainId.value),
  );

  function isActive(domainId: ManagementDomainId): boolean {
    return activeDomainId.value === domainId;
  }

  function toRoute(domainId: ManagementDomainId): string {
    const match = MANAGEMENT_DOMAIN_MANIFEST.find((domain) => domain.id === domainId);
    return match?.routePath ?? '/config';
  }

  return {
    domains,
    activeDomain,
    isActive,
    toRoute,
  };
}
