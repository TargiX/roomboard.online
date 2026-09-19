"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  Clock3,
  Copy,
  Check,
  LayoutGrid,
  LockKeyhole,
  UsersRound,
  ExternalLink,
  Link2,
  FolderOpen,
  Send,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoomStarterTemplate, RoomSummary } from "@/lib/canvasRoom";
import { trackProductEvent } from "@/lib/productAnalytics";
import { getRoomAccessAction } from "@/lib/roomAccessAction";
import { getRoomDecisionCheckpoint } from "@/lib/roomDecisionCheckpoint";
import { buildRoomDecisionMessage } from "@/lib/roomDecisionMessage";
import { getRoomDecisionQueue } from "@/lib/roomDecisionQueue";
import {
  inviteTokensKey,
  ownerTokensKey,
  readInviteTokens,
  readOwnerTokens,
  writeOwnerToken,
  writeStoredTokenMap,
} from "@/lib/roomTokens";
import { buildRoomInviteMessage } from "@/lib/roomInviteMessage";
import { buildRoomPathWithHashToken, normalizeRoomRouteFromInput } from "@/lib/roomLinks";
import { roomboardSupportMailto } from "@/lib/support";

async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type DashboardStarterId = RoomStarterTemplate | "blank";

const dashboardStarterOptions: Array<{
  id: DashboardStarterId;
  label: string;
  name: string;
  note: string;
}> = [
  {
    id: "blank",
    label: "Visual decision",
    name: "Visual decision room",
    note: "Clean room + first decision guide",
  },
  {
    id: "landing-review",
    label: "Launch approval",
    name: "Launch approval",
    note: "Decision, material, criteria, record",
  },
  {
    id: "moodboard",
    label: "Moodboard",
    name: "Moodboard decision",
    note: "References and criteria",
  },
];

const dashboardStarterNames = new Set(dashboardStarterOptions.map((option) => option.name));

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

export function RoomsDashboard() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [ownerTokens, setOwnerTokens] = useState<Record<string, string>>({});
  const [inviteTokens, setInviteTokens] = useState<Record<string, string>>({});
  const [selectedStarter, setSelectedStarter] = useState<DashboardStarterId>("blank");
  const [name, setName] = useState(dashboardStarterOptions[0].name);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLinkError, setInviteLinkError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [copiedDecisionUpdateId, setCopiedDecisionUpdateId] = useState("");
  const [copiedOwnerId, setCopiedOwnerId] = useState("");
  const [closingId, setClosingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [togglingAccessByRoomId, setTogglingAccessByRoomId] = useState<Record<string, true>>({});
  const accessToggleInFlight = useRef(new Set<string>());
  const [isCreating, setIsCreating] = useState(false);
  const [roomListError, setRoomListError] = useState("");
  const [createError, setCreateError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [controlError, setControlError] = useState("");
  const [pendingCloseRoom, setPendingCloseRoom] = useState<RoomSummary | null>(null);
  const [isConfirmingPermanentDelete, setIsConfirmingPermanentDelete] = useState(false);
  const ownedRoomCount = rooms.filter((room) => ownerTokens[room.id]).length;
  const joinedRoomCount = rooms.filter((room) => inviteTokens[room.id] && !ownerTokens[room.id]).length;
  const lockedRoomCount = rooms.filter((room) => room.access === "locked").length;
  const decisionQueue = useMemo(() => getRoomDecisionQueue(rooms, Object.keys(ownerTokens)), [ownerTokens, rooms]);

  const selectStarter = (starterId: DashboardStarterId) => {
    const nextStarter = dashboardStarterOptions.find((option) => option.id === starterId);

    if (!nextStarter) {
      return;
    }

    setSelectedStarter(starterId);
    setName((currentName) => (dashboardStarterNames.has(currentName) ? nextStarter.name : currentName));
    setCreateError("");
    trackProductEvent("Starter Selected", { source: "rooms_console", starter: starterId });
  };

  useEffect(() => {
    const nextOwnerTokens = readOwnerTokens();
    const nextInviteTokens = readInviteTokens();
    setOwnerTokens(nextOwnerTokens);
    setInviteTokens(nextInviteTokens);

    const headers: Record<string, string> = {};
    if (Object.keys(nextOwnerTokens).length > 0) {
      headers["X-Owned-Rooms"] = JSON.stringify(nextOwnerTokens);
    }
    if (Object.keys(nextInviteTokens).length > 0) {
      headers["X-Invite-Rooms"] = JSON.stringify(nextInviteTokens);
    }

    let cancelled = false;
    fetch("/api/rooms", { headers })
      .then((response) => {
        if (!response.ok) {
          throw new Error("rooms_fetch_failed");
        }

        return response.json() as Promise<{ rooms?: RoomSummary[] }>;
      })
      .then((data) => {
        if (!cancelled && data.rooms) {
          setRooms(data.rooms);
          setRoomListError("");
          trackProductEvent("Rooms Console Viewed", {
            joinedRoomCount: Object.keys(nextInviteTokens).length,
            ownedRoomCount: Object.keys(nextOwnerTokens).length,
            roomCount: data.rooms.length,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoomListError("Could not refresh remembered rooms. Existing rooms below may be out of date.");
          trackProductEvent("Rooms Console Load Failed", {
            joinedRoomCount: Object.keys(nextInviteTokens).length,
            ownedRoomCount: Object.keys(nextOwnerTokens).length,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setCreateError("");
    trackProductEvent("Room Start Clicked", { source: "rooms_console", starter: selectedStarter });

    try {
      const response = await fetch("/api/rooms", {
        body: JSON.stringify({
          name,
          starterTemplate: selectedStarter === "blank" ? undefined : selectedStarter,
          visibility: "private",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const reason = response.status === 429 ? "rate_limited" : "bad_response";
        setCreateError(
          response.status === 429
            ? "Room creation is temporarily rate limited. Try again in a little while."
            : "Roomboard could not open a room. Please try again.",
        );
        trackProductEvent("Room Create Failed", {
          reason,
          source: "rooms_console",
          starter: selectedStarter,
          status: response.status,
        });
        return;
      }

      const data = (await response.json()) as { ownerToken?: string; room?: RoomSummary };

      if (data.room && data.ownerToken) {
        trackProductEvent("Room Created", {
          access: data.room.access,
          itemCount: data.room.itemCount,
          source: "rooms_console",
          starter: selectedStarter,
          visibility: data.room.visibility,
        });
        setOwnerTokens(writeOwnerToken(data.room.id, data.ownerToken));
        setRooms((current) => [data.room!, ...current]);
        router.push(
          buildRoomPathWithHashToken(data.room.id, "ownerToken", data.ownerToken, {
            new: "1",
            starter: selectedStarter,
          }),
        );
      } else {
        setCreateError("Roomboard opened a response without a room. Please try again.");
        trackProductEvent("Room Create Failed", {
          reason: "missing_room",
          source: "rooms_console",
          starter: selectedStarter,
        });
      }
    } catch {
      setCreateError("Roomboard could not reach the room service. Please try again.");
      trackProductEvent("Room Create Failed", {
        reason: "request_error",
        source: "rooms_console",
        starter: selectedStarter,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const openInviteLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const route = normalizeRoomRouteFromInput(inviteLink);

    if (!route) {
      setInviteLinkError("Paste a Roomboard room link or room id.");
      trackProductEvent("Room Invite Open Failed", { reason: "invalid_input", source: "rooms_console" });
      return;
    }

    setInviteLinkError("");
    trackProductEvent("Room Invite Opened", { source: "rooms_console" });
    router.push(route);
  };

  const getShareUrl = (room: RoomSummary) => {
    const token = room.shareInvite?.token ?? inviteTokens[room.id];

    if (token) {
      return new URL(buildRoomPathWithHashToken(room.id, "invite", token), window.location.origin).toString();
    }

    if (room.access === "link") {
      return `${window.location.origin}/rooms/${room.id}`;
    }

    return "";
  };

  const getOwnerBackupUrl = (room: RoomSummary) => {
    const token = ownerTokens[room.id];

    if (!token) {
      return "";
    }

    return new URL(buildRoomPathWithHashToken(room.id, "ownerToken", token), window.location.origin).toString();
  };

  const copyInvite = async (room: RoomSummary) => {
    const url = getShareUrl(room);

    if (!url) {
      return;
    }

    setCopyError("");
    if (!(await copyTextToClipboard(url))) {
      setCopyError("Roomboard could not copy the invite link. Open the room and use the Share button, or try again.");
      trackProductEvent("Room Copy Failed", { source: "rooms_console", shareKind: "invite" });
      return;
    }

    trackProductEvent(room.shareInvite ? "Room Invite Copied" : "Room Link Copied", {
      access: room.access,
      shareKind: room.shareInvite?.role ?? (inviteTokens[room.id] ? "remembered_invite" : "link"),
      source: "rooms_console",
    });
    setCopiedId(room.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  };

  const copyInviteMessage = async (room: RoomSummary) => {
    const url = getShareUrl(room);

    if (!url) {
      return;
    }

    setCopyError("");
    if (
      !(await copyTextToClipboard(
        buildRoomInviteMessage({
          prompt:
            "Please look at the visual material and leave comments or status updates that help make the decision here:",
          roomName: room.name,
          url,
        }),
      ))
    ) {
      setCopyError("Roomboard could not copy the invite message. Open the room and use Share, or try again.");
      trackProductEvent("Room Copy Failed", { source: "rooms_console", shareKind: "invite_message" });
      return;
    }

    trackProductEvent("Room Invite Message Copied", {
      access: room.access,
      shareKind: room.shareInvite?.role ?? (inviteTokens[room.id] ? "remembered_invite" : "link"),
      source: "rooms_console",
      visibility: room.visibility,
    });
    setCopiedMessageId(room.id);
    window.setTimeout(() => setCopiedMessageId(""), 1400);
  };

  const copyDecisionUpdate = async (room: RoomSummary) => {
    const url = getShareUrl(room);

    if (!url) {
      return;
    }

    const decisionUpdate = buildRoomDecisionMessage(room, url);
    setCopyError("");
    if (!(await copyTextToClipboard(decisionUpdate.message))) {
      setCopyError("Roomboard could not copy the decision update. Open the room and use Share, or try again.");
      trackProductEvent("Room Copy Failed", { source: "rooms_console", shareKind: "decision_update" });
      return;
    }

    trackProductEvent("Room Decision Update Copied", {
      decisionState: decisionUpdate.tone,
      source: "rooms_console",
    });
    setCopiedDecisionUpdateId(room.id);
    window.setTimeout(() => setCopiedDecisionUpdateId(""), 1400);
  };

  const copyOwnerBackup = async (room: RoomSummary) => {
    const url = getOwnerBackupUrl(room);

    if (!url) {
      return;
    }

    setCopyError("");
    if (!(await copyTextToClipboard(url))) {
      setCopyError(
        "Roomboard could not copy the owner backup link. Open the room and use Copy Owner Backup, or try again.",
      );
      trackProductEvent("Room Copy Failed", { source: "rooms_console", shareKind: "owner" });
      return;
    }

    trackProductEvent("Room Owner Link Copied", {
      access: room.access,
      source: "rooms_console",
      visibility: room.visibility,
    });
    setCopiedOwnerId(room.id);
    window.setTimeout(() => setCopiedOwnerId(""), 1400);
  };

  const openRoom = (room: RoomSummary) => {
    trackProductEvent("Room Open Requested", {
      access: room.access,
      itemCount: room.itemCount,
      source: "rooms_console",
      visibility: room.visibility,
    });
    router.push(`/rooms/${room.id}`);
  };

  const closeRoom = async (roomId: string) => {
    setClosingId(roomId);
    setControlError("");

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        headers: { "X-Room-Owner-Token": ownerTokens[roomId] ?? "" },
        method: "DELETE",
      });

      if (response.ok || response.status === 404) {
        trackProductEvent("Room Closed", { source: "rooms_console" });
        setRooms((current) => current.filter((room) => room.id !== roomId));
        setPendingCloseRoom(null);
        setIsConfirmingPermanentDelete(false);
      } else {
        setControlError(
          response.status === 403
            ? "Only the room creator can close this room. Open the owner backup link if this is your room."
            : "Roomboard could not close the room. Try again in a moment.",
        );
        trackProductEvent("Room Close Failed", { source: "rooms_console", status: response.status });
      }
    } catch {
      setControlError("Roomboard could not reach the room service. Try again in a moment.");
      trackProductEvent("Room Close Failed", { reason: "request_error", source: "rooms_console" });
    } finally {
      setClosingId("");
    }
  };

  const deleteRoomPermanently = async (roomId: string) => {
    setDeletingId(roomId);
    setControlError("");

    try {
      const response = await fetch(`/api/rooms/${roomId}?permanent=true`, {
        headers: { "X-Room-Owner-Token": ownerTokens[roomId] ?? "" },
        method: "DELETE",
      });

      if (response.ok || response.status === 404) {
        const nextOwnerTokens = { ...readOwnerTokens() };
        const nextInviteTokens = { ...readInviteTokens() };
        delete nextOwnerTokens[roomId];
        delete nextInviteTokens[roomId];
        writeStoredTokenMap(ownerTokensKey, nextOwnerTokens);
        writeStoredTokenMap(inviteTokensKey, nextInviteTokens);
        setOwnerTokens(nextOwnerTokens);
        setInviteTokens(nextInviteTokens);
        setRooms((current) => current.filter((room) => room.id !== roomId));
        setPendingCloseRoom(null);
        trackProductEvent("Room Permanently Deleted", { source: "rooms_console" });
      } else {
        setControlError(
          response.status === 403
            ? "Only the room creator can permanently delete this room. Open the owner backup link if this is your room."
            : "Roomboard could not confirm complete deletion. Retry, or contact support before sharing the room again.",
        );
        trackProductEvent("Room Permanent Delete Failed", { source: "rooms_console", status: response.status });
      }
    } catch {
      setControlError(
        "Roomboard could not confirm complete deletion. Retry, or contact support before sharing the room again.",
      );
      trackProductEvent("Room Permanent Delete Failed", { reason: "request_error", source: "rooms_console" });
    } finally {
      setDeletingId("");
    }
  };

  const requestCloseRoom = (room: RoomSummary) => {
    setPendingCloseRoom(room);
    setIsConfirmingPermanentDelete(false);
    trackProductEvent("Room Close Requested", {
      source: "rooms_console",
    });
  };

  const cancelCloseRoom = () => {
    setPendingCloseRoom(null);
    setIsConfirmingPermanentDelete(false);
    trackProductEvent("Room Close Cancelled", {
      source: "rooms_console",
    });
  };

  const toggleRoomAccess = async (room: RoomSummary) => {
    const ownerToken = ownerTokens[room.id];

    if (!ownerToken) {
      setControlError(
        "Owner access is required to change room access. Open the owner backup link if this is your room.",
      );
      trackProductEvent("Room Access Change Failed", { reason: "missing_owner_token", source: "rooms_console" });
      return;
    }

    if (accessToggleInFlight.current.has(room.id)) {
      return;
    }

    const nextAccess = room.access === "locked" ? "link" : "locked";
    accessToggleInFlight.current.add(room.id);
    setTogglingAccessByRoomId((current) => ({ ...current, [room.id]: true }));
    setControlError("");
    try {
      const response = await fetch(`/api/rooms/${room.id}`, {
        body: JSON.stringify({ action: "access", access: nextAccess }),
        headers: { "Content-Type": "application/json", "X-Room-Owner-Token": ownerToken },
        method: "PATCH",
      });
      const data = (await response.json()) as { room?: RoomSummary };

      if (response.ok && data.room) {
        trackProductEvent("Room Access Changed", {
          nextAccess,
          source: "rooms_console",
        });
        setRooms((current) => current.map((currentRoom) => (currentRoom.id === room.id ? data.room! : currentRoom)));
      } else {
        setControlError(
          response.status === 403
            ? "Only the room creator can change access. Open the owner backup link if this is your room."
            : "Roomboard could not change room access. Try again in a moment.",
        );
        trackProductEvent("Room Access Change Failed", {
          nextAccess,
          source: "rooms_console",
          status: response.status,
        });
      }
    } catch {
      setControlError("Roomboard could not reach the room service. Try again in a moment.");
      trackProductEvent("Room Access Change Failed", {
        nextAccess,
        reason: "request_error",
        source: "rooms_console",
      });
    } finally {
      accessToggleInFlight.current.delete(room.id);
      setTogglingAccessByRoomId((current) => {
        const { [room.id]: _completed, ...remaining } = current;
        return remaining;
      });
    }
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <a className="brand" href="/">
          <div className="brand-icon-bg">
            <LayoutGrid size={18} className="brand-logo" aria-hidden="true" />
          </div>
          <span>Roomboard</span>
        </a>
        <div className="dashboard-header__right">
          <a className="dashboard-header__link" href={roomboardSupportMailto}>
            Support
          </a>
          <a className="dashboard-header__link" href="/privacy">
            Privacy
          </a>
          <Badge variant="outline" className="dashboard-badge">
            <UsersRound size={13} aria-hidden="true" />
            <span>Invite-first rooms</span>
          </Badge>
        </div>
      </header>

      <section className="dashboard-hero">
        <div className="dashboard-console-copy">
          <p className="dashboard-kicker">Rooms console</p>
          <h1>Your private decision rooms.</h1>
          <p className="hero-description">
            Reopen rooms remembered in this browser, copy collaborator invites, or start a fresh room for the next
            visual decision.
          </p>
          <div className="dashboard-stats" aria-label="Room summary">
            <div>
              <strong>{rooms.length}</strong>
              <span>active</span>
            </div>
            <div>
              <strong>{ownedRoomCount}</strong>
              <span>created here</span>
            </div>
            <div>
              <strong>{joinedRoomCount}</strong>
              <span>joined</span>
            </div>
            <div>
              <strong>{lockedRoomCount}</strong>
              <span>locked</span>
            </div>
          </div>
        </div>

        <Card className="create-room-card ui-card">
          <CardHeader>
            <CardTitle>Start a room</CardTitle>
            <CardDescription>
              Name the work. Roomboard opens a private invite room and remembers owner access in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="create-room-form" onSubmit={createRoom}>
              <div className="dashboard-starter-options" aria-label="Choose room starter" role="group">
                {dashboardStarterOptions.map((option) => (
                  <button
                    aria-pressed={selectedStarter === option.id}
                    className={selectedStarter === option.id ? "selected" : ""}
                    key={option.id}
                    onClick={() => selectStarter(option.id)}
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </button>
                ))}
              </div>
              <div className="input-wrapper">
                <input
                  aria-label="Room name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Visual decision room, Landing page review"
                  value={name}
                />
              </div>
              <div className="room-privacy-note" aria-label="New rooms are private and invite-only">
                <span className="room-privacy-note__icon">
                  <LockKeyhole size={13} aria-hidden="true" />
                </span>
                <span>Private and locked by default</span>
              </div>
              <Button disabled={isCreating || name.trim().length === 0} type="submit" className="create-room-submit">
                <span>{isCreating ? "Opening..." : "Create room"}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </form>
            {createError && (
              <p className="dashboard-error" role="status">
                {createError}
              </p>
            )}
            <form className="join-room-form" onSubmit={openInviteLink}>
              <div className="join-room-divider">
                <span />
                <strong>Open an invite</strong>
                <span />
              </div>
              <div className="join-room-row">
                <input
                  aria-label="Room invite link"
                  onChange={(event) => {
                    setInviteLink(event.target.value);
                    setInviteLinkError("");
                  }}
                  placeholder="Paste room link or id"
                  value={inviteLink}
                />
                <Button type="submit" variant="secondary">
                  <ExternalLink size={14} aria-hidden="true" />
                  <span>Open</span>
                </Button>
              </div>
              {inviteLinkError && (
                <p className="dashboard-error" role="status">
                  {inviteLinkError}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="rooms-section">
        <div className="section-heading">
          <h2>Active rooms</h2>
          <span className="rooms-total-badge">{rooms.length} total</span>
        </div>
        {decisionQueue.ownedCount > 0 && (
          <section className="rooms-decision-queue" aria-labelledby="decision-queue-heading">
            <div className="rooms-decision-queue__head">
              <div>
                <span>Owner follow-up</span>
                <h3 id="decision-queue-heading">
                  {decisionQueue.attention.length > 0
                    ? `${decisionQueue.attention.length} ${decisionQueue.attention.length === 1 ? "room needs" : "rooms need"} your call`
                    : "Every owned room is ready to share"}
                </h3>
              </div>
              <p>
                {decisionQueue.attention.length > 0
                  ? "Changes and unresolved cards rise here after collaborators update the board."
                  : `${decisionQueue.readyCount} ${decisionQueue.readyCount === 1 ? "room is" : "rooms are"} decision-ready.`}
              </p>
            </div>
            {decisionQueue.attention.length > 0 && (
              <div className="rooms-decision-queue__items">
                {decisionQueue.attention.slice(0, 3).map((entry) => (
                  <button
                    className="rooms-decision-queue__item"
                    key={entry.room.id}
                    onClick={() => {
                      const room = rooms.find((candidate) => candidate.id === entry.room.id);
                      if (room) openRoom(room);
                    }}
                    type="button"
                  >
                    <span className={`rooms-decision-queue__tone tone-${entry.checkpoint.tone}`}>
                      {entry.checkpoint.label}
                    </span>
                    <strong>{entry.room.name}</strong>
                    <small>{entry.checkpoint.detail}</small>
                    <em>
                      {entry.action} <ArrowRight size={13} aria-hidden="true" />
                    </em>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        {roomListError && (
          <p className="dashboard-error rooms-error" role="status">
            {roomListError}
          </p>
        )}
        {copyError && (
          <p className="dashboard-error rooms-error" role="status">
            {copyError}
          </p>
        )}
        {controlError && (
          <p className="dashboard-error rooms-error" role="status">
            {controlError}
          </p>
        )}

        {rooms.length === 0 ? (
          <div className="empty-rooms-state">
            <div className="empty-state-icon">
              <FolderOpen size={32} className="empty-icon" aria-hidden="true" />
            </div>
            <h3>No active rooms found</h3>
            <p>
              Rooms you create or open from invite links will appear here. Start a private room above or use an invite
              link from a collaborator.
            </p>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map((room) => {
              const decisionCheckpoint = getRoomDecisionCheckpoint(room);

              return (
                <div
                  className="room-card ui-card"
                  key={room.id}
                  onClick={() => openRoom(room)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      openRoom(room);
                    }
                  }}
                >
                  <div className="room-card-inner">
                    <div className="room-card-topline">
                      <Badge variant="secondary" className="room-card-objects-badge">
                        {room.itemCount} {room.itemCount === 1 ? "object" : "objects"}
                      </Badge>
                      <Badge variant="outline" className="room-card-access-badge">
                        {room.access === "locked" ? (
                          <LockKeyhole size={11} aria-hidden="true" />
                        ) : (
                          <UnlockKeyhole size={11} aria-hidden="true" />
                        )}
                        <span>{room.access === "locked" ? "Locked" : "Link access"}</span>
                      </Badge>
                      <span className="room-card-time">
                        <Clock3 size={12} aria-hidden="true" />
                        <span>{formatRelativeTime(room.updatedAt)}</span>
                      </span>
                    </div>

                    <h3 className="room-card-title">{room.name}</h3>
                    <Badge
                      aria-label={`${decisionCheckpoint.label}: ${decisionCheckpoint.detail}`}
                      className="room-card-decision-checkpoint"
                      data-decision-checkpoint={decisionCheckpoint.tone}
                      variant="outline"
                    >
                      {decisionCheckpoint.tone === "ready" && <Check size={12} aria-hidden="true" />}
                      <span>{decisionCheckpoint.label}</span>
                      <strong>{decisionCheckpoint.detail}</strong>
                    </Badge>
                    <p className="room-card-connections-info">
                      <Link2 size={12} aria-hidden="true" />
                      <span>{room.connectionCount} connections</span>
                    </p>

                    <div className="room-card-footer-actions">
                      <span className="room-card-open-link">
                        <span>Open board</span>
                        <ExternalLink size={13} className="arrow-icon" aria-hidden="true" />
                      </span>
                      <div className="room-card-buttons-group">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyInvite(room);
                          }}
                          type="button"
                          variant="secondary"
                          className="room-card-copy-btn"
                          disabled={!getShareUrl(room)}
                        >
                          {copiedId === room.id ? (
                            <>
                              <Check size={13} aria-hidden="true" className="success-icon" />
                              <span>Copied</span>
                            </>
                          ) : !getShareUrl(room) ? (
                            <>
                              <LockKeyhole size={12} aria-hidden="true" />
                              <span>Invite only</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} aria-hidden="true" />
                              <span>Copy link</span>
                            </>
                          )}
                        </Button>
                        {ownerTokens[room.id] && (
                          <>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyInviteMessage(room);
                              }}
                              type="button"
                              variant="secondary"
                              className="room-card-copy-btn"
                              disabled={!getShareUrl(room)}
                              title="Copy ready-to-send invite message"
                            >
                              {copiedMessageId === room.id ? (
                                <>
                                  <Check size={13} aria-hidden="true" className="success-icon" />
                                  <span>Message copied</span>
                                </>
                              ) : (
                                <>
                                  <Send size={12} aria-hidden="true" />
                                  <span>Invite message</span>
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyDecisionUpdate(room);
                              }}
                              type="button"
                              variant="secondary"
                              className="room-card-copy-btn"
                              disabled={!getShareUrl(room)}
                              title="Copy a status-aware decision update"
                            >
                              {copiedDecisionUpdateId === room.id ? (
                                <>
                                  <Check size={13} aria-hidden="true" className="success-icon" />
                                  <span>Update copied</span>
                                </>
                              ) : (
                                <>
                                  <Send size={12} aria-hidden="true" />
                                  <span>Decision update</span>
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyOwnerBackup(room);
                              }}
                              type="button"
                              variant="secondary"
                              className="room-card-copy-btn room-card-owner-btn"
                              title="Copy owner backup link"
                            >
                              {copiedOwnerId === room.id ? (
                                <>
                                  <Check size={13} aria-hidden="true" className="success-icon" />
                                  <span>Owner copied</span>
                                </>
                              ) : (
                                <>
                                  <ShieldCheck size={12} aria-hidden="true" />
                                  <span>Owner backup</span>
                                </>
                              )}
                            </Button>
                            {(() => {
                              const accessAction = getRoomAccessAction(
                                room.access,
                                Boolean(togglingAccessByRoomId[room.id]),
                              );

                              return (
                                <Button
                                  aria-label={accessAction.ariaLabel}
                                  className="room-card-copy-btn"
                                  disabled={Boolean(togglingAccessByRoomId[room.id])}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void toggleRoomAccess(room);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.stopPropagation();
                                    }
                                  }}
                                  title={accessAction.ariaLabel}
                                  type="button"
                                  variant="secondary"
                                >
                                  {room.access === "locked" ? (
                                    <UnlockKeyhole size={13} aria-hidden="true" />
                                  ) : (
                                    <LockKeyhole size={13} aria-hidden="true" />
                                  )}
                                  <span>{accessAction.label}</span>
                                </Button>
                              );
                            })()}
                            <Button
                              disabled={closingId === room.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestCloseRoom(room);
                              }}
                              type="button"
                              variant="outline"
                              className="room-card-icon-btn danger-hover"
                              aria-label="Close room"
                              title="Close room"
                            >
                              <Archive size={13} aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {pendingCloseRoom && (
        <div className="dashboard-modal-scrim" onClick={cancelCloseRoom}>
          <div className="rb-modal" onClick={(event) => event.stopPropagation()}>
            <div className="rb-modal__head">
              <div className="rb-modal__eyebrow">Room state</div>
              <div className="rb-modal__title">
                {isConfirmingPermanentDelete ? "Permanently delete this room?" : "Close this room?"}
              </div>
              <div className="rb-modal__sub">
                {isConfirmingPermanentDelete
                  ? "This removes the room, every card and comment, and its hosted uploads. This action cannot be undone."
                  : "Close keeps the decision record. Permanent delete removes the room, comments, and hosted uploads and cannot be undone."}
              </div>
            </div>
            <div className="rb-modal__body">
              <div className="dashboard-close-room-name">{pendingCloseRoom.name}</div>
            </div>
            <div className="rb-modal__foot">
              <button
                className="rb-btn ghost"
                disabled={closingId === pendingCloseRoom.id || deletingId === pendingCloseRoom.id}
                onClick={() => {
                  if (isConfirmingPermanentDelete) setIsConfirmingPermanentDelete(false);
                  else cancelCloseRoom();
                }}
                type="button"
              >
                {isConfirmingPermanentDelete ? "Back" : "Keep room"}
              </button>
              <button
                className="rb-btn danger-line"
                disabled={closingId === pendingCloseRoom.id || deletingId === pendingCloseRoom.id}
                onClick={() => {
                  if (isConfirmingPermanentDelete) void deleteRoomPermanently(pendingCloseRoom.id);
                  else setIsConfirmingPermanentDelete(true);
                }}
                type="button"
              >
                <Trash2 size={13} aria-hidden="true" />
                {deletingId === pendingCloseRoom.id
                  ? "Deleting"
                  : isConfirmingPermanentDelete
                    ? "Delete permanently"
                    : "Review deletion"}
              </button>
              {!isConfirmingPermanentDelete && (
                <button
                  className="rb-btn primary"
                  disabled={closingId === pendingCloseRoom.id || deletingId === pendingCloseRoom.id}
                  onClick={() => void closeRoom(pendingCloseRoom.id)}
                  type="button"
                >
                  <Archive size={13} aria-hidden="true" />
                  {closingId === pendingCloseRoom.id ? "Closing" : "Close room"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
