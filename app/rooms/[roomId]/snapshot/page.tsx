import { getPublicRoomSnapshot } from "@/lib/canvasRoom";
import { RoomSnapshotView } from "@/components/RoomSnapshotView";

export const dynamic = "force-dynamic";

// Time formatting happens on the server (force-dynamic renders per request)
// so the client never calls Date.now()/toLocaleString during hydration —
// that avoids React hydration mismatches from server/client TZ or locale drift
// and from a minute boundary crossing between SSR and mount.
function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatActivityTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type SnapshotPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({ params }: SnapshotPageProps) {
  const { roomId } = await params;

  // Only reveal room-specific metadata after the room owner explicitly
  // enables a public read-only snapshot. Unknown and private rooms get
  // generic metadata to avoid leaking names.
  const snapshot = await getPublicRoomSnapshot(roomId);

  if (!snapshot) {
    return {
      title: "Room snapshot | Roomboard",
      description: "Open a Roomboard snapshot when the owner has enabled public viewing.",
      robots: {
        index: false,
        follow: false,
      },
      openGraph: {
        title: "Room snapshot | Roomboard",
        description: "Open a Roomboard snapshot when the owner has enabled public viewing.",
      },
    };
  }

  const { room } = snapshot;

  return {
    title: `${room.name} — snapshot | Roomboard`,
    description: `Read-only snapshot of the "${room.name}" decision room: ${room.itemCount} cards, ${room.commentCount} comments, ${room.connectionCount} connections.`,
    openGraph: {
      title: `${room.name} — snapshot | Roomboard`,
      description: `Read-only snapshot of the "${room.name}" decision room: ${room.itemCount} cards, ${room.commentCount} comments.`,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SnapshotPage({ params }: SnapshotPageProps) {
  const { roomId } = await params;

  // This intentionally does not reuse the live-room access rule: a published
  // snapshot is viewer-only while the private, locked room stays invite-only.
  const snapshot = await getPublicRoomSnapshot(roomId);

  if (!snapshot) {
    return (
      <main className="snapshot-shell">
        <section className="snapshot-locked">
          <div className="snapshot-locked-badge" aria-hidden>
            🔒
          </div>
          <h1>This room isn&apos;t publicly viewable</h1>
          <p>
            The owner hasn&apos;t enabled public snapshot access for this room. Open the live room to request access.
          </p>
          <a className="snapshot-locked-cta" href={`/rooms/${roomId}`}>
            Open live room →
          </a>
        </section>
      </main>
    );
  }

  const activities = snapshot.activities
    .slice(0, 12)
    .map((a) => ({ ...a, timeLabel: formatActivityTime(a.createdAt) }));

  return (
    <RoomSnapshotView
      roomId={roomId}
      roomName={snapshot.room.name}
      items={snapshot.items}
      connections={snapshot.connections}
      activities={activities}
      statusCounts={snapshot.room.statusCounts}
      participants={snapshot.room.participants}
      capturedRelative={formatRelative(snapshot.room.updatedAt)}
    />
  );
}
