"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { mergeRoomMessages, type RoomAgentPublic, type RoomMessage } from "@/lib/roomAgents";
import type { RoomboardBoardEventInput } from "@/lib/roomboardRealtime";
import { trackProductEvent } from "@/lib/productAnalytics";

type LocalUser = {
  profileComplete?: boolean;
  id: string;
  name: string;
  color: string;
};

type UseRoomActionsParams = {
  roomApi: string;
  inviteToken: string | null;
  ownerToken: string | null;
  selectedId: string | null;
  user: LocalUser | null;
  publishBoardEvent: (event: RoomboardBoardEventInput) => void;
  refreshRoomSnapshot: () => Promise<unknown>;
  setRoomMessages: Dispatch<SetStateAction<RoomMessage[]>>;
  setRoomAgents: Dispatch<SetStateAction<RoomAgentPublic[]>>;
};

/**
 * Transcript, agent, moderation, and review-round action handlers —
 * the remaining slice of the CanvasRoom action-layer extraction named in
 * ROADMAP.md ("Remaining debt" #1). Room mutations on cards/items stay in
 * `useRoomMutations`; this hook owns only the API POST/PATCH actions that
 * talk to the room endpoints directly and refresh the snapshot.
 */
export function useRoomActions({
  roomApi,
  inviteToken,
  ownerToken,
  selectedId,
  user,
  publishBoardEvent,
  refreshRoomSnapshot,
  setRoomMessages,
  setRoomAgents,
}: UseRoomActionsParams) {
  const sendTranscriptMessage = useCallback(
    async (body: string) => {
      if (!body.trim()) {
        return false;
      }

      const response = await fetch(roomApi, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
          ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({
          action: "message",
          author: user?.name ?? "Editor",
          authorId: user?.id ?? "editor",
          body,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as { message?: RoomMessage };

      if (!data.message) {
        return false;
      }

      setRoomMessages((current) => mergeRoomMessages(current, [data.message!]));
      publishBoardEvent({ type: "room:message", message: data.message });
      return true;
    },
    [inviteToken, ownerToken, publishBoardEvent, roomApi, setRoomMessages, user],
  );

  const createRoomAgentAction = useCallback(
    async (name: string, isArbiter: boolean) => {
      const response = await fetch(roomApi, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({ action: "agent-create", name, isArbiter }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { agent?: RoomAgentPublic; token?: string };

      if (!data.agent || !data.token) {
        return null;
      }

      const created = data.agent;
      setRoomAgents((current) => [...current.filter((agent) => agent.id !== created.id), created]);
      trackProductEvent("Agent Connected", { arbiter: isArbiter });
      return { agent: created, token: data.token };
    },
    [ownerToken, roomApi, setRoomAgents],
  );

  const revokeRoomAgentAction = useCallback(
    async (agentId: string) => {
      const response = await fetch(roomApi, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({ action: "agent-revoke", agentId }),
      });

      if (!response.ok) {
        return false;
      }

      setRoomAgents((current) => current.filter((agent) => agent.id !== agentId));
      return true;
    },
    [ownerToken, roomApi, setRoomAgents],
  );

  const flagTranscriptMessage = useCallback(
    async (messageId: string) => {
      const response = await fetch(roomApi, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({ action: "flag", messageId }),
      });

      if (!response.ok) {
        return false;
      }

      void refreshRoomSnapshot();
      return true;
    },
    [ownerToken, refreshRoomSnapshot, roomApi],
  );

  const setAgentMutedAction = useCallback(
    async (agentId: string, muted: boolean) => {
      const response = await fetch(roomApi, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({ action: "agent-mute", agentId, muted }),
      });

      if (!response.ok) {
        return false;
      }

      void refreshRoomSnapshot();
      return true;
    },
    [ownerToken, refreshRoomSnapshot, roomApi],
  );

  const setModerationPolicyAction = useCallback(
    async (autoMuteFlags: number | null) => {
      const response = await fetch(roomApi, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({ action: "moderation-policy", autoMuteFlags }),
      });

      if (!response.ok) {
        return false;
      }

      void refreshRoomSnapshot();
      return true;
    },
    [ownerToken, refreshRoomSnapshot, roomApi],
  );

  const startReviewRoundAction = useCallback(async () => {
    if (!selectedId) {
      return;
    }

    const response = await fetch(roomApi, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
        ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
      },
      body: JSON.stringify({ action: "round-start", itemId: selectedId }),
    });

    if (response.ok) {
      void refreshRoomSnapshot();
    }
  }, [inviteToken, ownerToken, refreshRoomSnapshot, roomApi, selectedId]);

  const closeReviewRoundAction = useCallback(async () => {
    if (!selectedId) {
      return;
    }

    const response = await fetch(roomApi, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(inviteToken ? { "X-Room-Invite-Token": inviteToken } : {}),
        ...(ownerToken ? { "X-Room-Owner-Token": ownerToken } : {}),
      },
      body: JSON.stringify({ action: "round-close", itemId: selectedId }),
    });

    if (response.ok) {
      void refreshRoomSnapshot();
    }
  }, [inviteToken, ownerToken, refreshRoomSnapshot, roomApi, selectedId]);

  return {
    closeReviewRoundAction,
    createRoomAgentAction,
    flagTranscriptMessage,
    revokeRoomAgentAction,
    sendTranscriptMessage,
    setAgentMutedAction,
    setModerationPolicyAction,
    startReviewRoundAction,
  };
}
