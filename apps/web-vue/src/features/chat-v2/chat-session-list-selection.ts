import { deriveSessionSelectionState } from "../../../../../lib/chat-session-list-state";
import type {
  ChatSessionOrganizerState,
  ChatSessionRow,
} from "../../../../../types/chat";

export type OrganizerFolderSummary = {
  hasFolderMembership: boolean;
  selectedInFolderCount: number;
};

export type SessionListSelectionSummary = {
  manageableVisibleSessionKeys: string[];
  selectedManageableSessionKeys: string[];
  allVisibleSessionsSelected: boolean;
  organizerFolderSummary: OrganizerFolderSummary;
};

export function buildOrganizerFolderSummary(params: {
  selectedSessionKeys: string[];
  organizer: ChatSessionOrganizerState;
}): OrganizerFolderSummary {
  const selectedInFolderCount = params.selectedSessionKeys.filter(
    (sessionKey) => Boolean(params.organizer.sessionFolderMap[sessionKey]),
  ).length;

  return {
    hasFolderMembership: selectedInFolderCount > 0,
    selectedInFolderCount,
  };
}

export function buildSessionListSelectionSummary(params: {
  selectedKeys: string[];
  visibleSessions: ChatSessionRow[];
  organizerSessions: ChatSessionRow[];
  organizer: ChatSessionOrganizerState;
  canManageSession: (session: ChatSessionRow) => boolean;
}): SessionListSelectionSummary {
  const selectionState = deriveSessionSelectionState(params);

  return {
    manageableVisibleSessionKeys: selectionState.manageableVisibleSessionKeys,
    selectedManageableSessionKeys: selectionState.selectedManageableSessionKeys,
    allVisibleSessionsSelected: selectionState.allVisibleSessionsSelected,
    organizerFolderSummary: buildOrganizerFolderSummary({
      selectedSessionKeys: selectionState.selectedManageableSessionKeys,
      organizer: params.organizer,
    }),
  };
}
