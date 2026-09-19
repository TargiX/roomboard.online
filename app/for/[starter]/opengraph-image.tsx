import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

export const alt = "Roomboard campaign preview";
export const contentType = "image/png";
export const runtime = "edge";
export const size = {
  height: 630,
  width: 1200,
};

type CampaignPreviewConfig = {
  accent: string;
  cards: Array<{
    color: string;
    height: number;
    left: number;
    title: string;
    top: number;
    width: number;
  }>;
  eyebrow: string;
  promise: string;
  title: string;
};

type OgImageProps = {
  params: Promise<{
    starter: string;
  }>;
};

const campaignPreviews: Record<string, CampaignPreviewConfig> = {
  "blank-room": {
    accent: "#62d681",
    eyebrow: "Private blank decision room",
    promise: "Add screenshots, notes, comments, statuses, and invite links without an account gate.",
    title: "Start a private room for the next visual decision.",
    cards: [
      { color: "#48a7ff", height: 126, left: 62, title: "First note", top: 70, width: 188 },
      { color: "#ef6f5e", height: 116, left: 294, title: "Editor invite", top: 110, width: 186 },
      { color: "#9b7bd9", height: 130, left: 164, title: "Owner backup", top: 270, width: 212 },
      { color: "#62d681", height: 112, left: 386, title: "Decision", top: 294, width: 172 },
    ],
  },
  "landing-review": {
    accent: "#facc5c",
    eyebrow: "Private launch approval",
    promise: "One room for the real material, reviewer calls, approval criteria, and final decision record.",
    title: "Decide what ships before launch.",
    cards: [
      { color: "#48a7ff", height: 154, left: 52, title: "Hero copy", top: 62, width: 200 },
      { color: "#ef6f5e", height: 118, left: 282, title: "Mobile pass", top: 88, width: 184 },
      { color: "#9b7bd9", height: 144, left: 168, title: "Social proof", top: 250, width: 214 },
      { color: "#62d681", height: 112, left: 404, title: "Ship call", top: 232, width: 164 },
    ],
  },
  moodboard: {
    accent: "#9b7bd9",
    eyebrow: "Private moodboard decision room",
    promise: "Keep references, criteria, comments, and the final direction attached to one board.",
    title: "Choose a visual direction without a messy thread.",
    cards: [
      { color: "#facc5c", height: 152, left: 58, title: "Reference A", top: 72, width: 198 },
      { color: "#48a7ff", height: 124, left: 294, title: "Criteria", top: 92, width: 180 },
      { color: "#ef6f5e", height: 140, left: 170, title: "Direction B", top: 260, width: 212 },
      { color: "#62d681", height: 118, left: 420, title: "Next step", top: 278, width: 170 },
    ],
  },
};

const aliases: Record<string, keyof typeof campaignPreviews> = {
  blank: "blank-room",
  brand: "moodboard",
  empty: "blank-room",
  landing: "landing-review",
  "landing-page": "landing-review",
  mood: "moodboard",
  references: "moodboard",
  review: "landing-review",
};

function readCampaignPreview(starter: string) {
  const normalized = starter.toLowerCase().replace(/_/g, "-").trim();
  const canonical = normalized in campaignPreviews ? normalized : aliases[normalized];

  return canonical ? campaignPreviews[canonical] : null;
}

export default async function Image({ params }: OgImageProps) {
  const { starter } = await params;
  const preview = readCampaignPreview(starter);

  if (!preview) {
    notFound();
  }

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0a0c10",
        color: "#f4f1e8",
        display: "flex",
        fontFamily: "Inter, Arial, sans-serif",
        height: "100%",
        justifyContent: "center",
        padding: 56,
        width: "100%",
      }}
    >
      <div
        style={{
          border: "1px solid #252b34",
          borderRadius: 24,
          display: "flex",
          gap: 44,
          height: "100%",
          overflow: "hidden",
          padding: 46,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 480,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
              <div
                style={{
                  alignItems: "center",
                  background: preview.accent,
                  borderRadius: 12,
                  color: "#111318",
                  display: "flex",
                  fontSize: 26,
                  fontWeight: 850,
                  height: 48,
                  justifyContent: "center",
                  width: 48,
                }}
              >
                R
              </div>
              <div style={{ color: "#e9edf4", fontSize: 32, fontWeight: 850 }}>Roomboard</div>
            </div>

            <div style={{ color: preview.accent, display: "flex", fontSize: 22, fontWeight: 800 }}>
              {preview.eyebrow}
            </div>
            <div
              style={{
                color: "#f4f1e8",
                fontSize: 62,
                fontWeight: 850,
                letterSpacing: 0,
                lineHeight: 0.98,
              }}
            >
              {preview.title}
            </div>
            <div style={{ color: "#a9b1bf", fontSize: 27, lineHeight: 1.35 }}>{preview.promise}</div>
          </div>

          <div style={{ color: "#7f8795", display: "flex", fontSize: 21, gap: 18 }}>
            <span>Private by default</span>
            <span>Invite links</span>
            <span>No account gate</span>
          </div>
        </div>

        <div
          style={{
            background: "#10141b",
            border: "1px solid #29313d",
            borderRadius: 22,
            display: "flex",
            flex: 1,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              backgroundImage:
                "linear-gradient(#202632 1px, transparent 1px), linear-gradient(90deg, #202632 1px, transparent 1px)",
              backgroundSize: "36px 36px",
              inset: 0,
              opacity: 0.44,
              position: "absolute",
            }}
          />
          {preview.cards.map((card) => (
            <div
              key={card.title}
              style={{
                background: "#171c25",
                border: `2px solid ${card.color}`,
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                height: card.height,
                left: card.left,
                padding: 18,
                position: "absolute",
                top: card.top,
                width: card.width,
              }}
            >
              <div style={{ color: "#f4f1e8", fontSize: 23, fontWeight: 800 }}>{card.title}</div>
              <div style={{ background: "#2a313d", borderRadius: 8, height: 15, width: "72%" }} />
              <div style={{ background: "#242b36", borderRadius: 8, height: 15, width: "52%" }} />
            </div>
          ))}
          <div
            style={{
              background: preview.accent,
              borderRadius: 999,
              color: "#111318",
              display: "flex",
              fontSize: 22,
              fontWeight: 850,
              left: 310,
              padding: "10px 16px",
              position: "absolute",
              top: 64,
            }}
          >
            Editor invited
          </div>
          <div
            style={{
              background: "#48a7ff",
              borderRadius: 999,
              color: "#071018",
              display: "flex",
              fontSize: 20,
              fontWeight: 850,
              left: 68,
              padding: "9px 14px",
              position: "absolute",
              top: 370,
            }}
          >
            Decision ready
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
