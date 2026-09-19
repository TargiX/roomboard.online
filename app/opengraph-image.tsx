import { ImageResponse } from "next/og";

export const alt = "Roomboard launch approval room preview";
export const contentType = "image/png";
export const runtime = "edge";
export const size = {
  height: 630,
  width: 1200,
};

export default function Image() {
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
            width: 460,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
              <div
                style={{
                  alignItems: "center",
                  background: "#facc5c",
                  borderRadius: 12,
                  color: "#111318",
                  display: "flex",
                  fontSize: 26,
                  fontWeight: 800,
                  height: 48,
                  justifyContent: "center",
                  width: 48,
                }}
              >
                R
              </div>
              <div style={{ color: "#e9edf4", fontSize: 32, fontWeight: 800 }}>Roomboard</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div
                style={{
                  color: "#f4f1e8",
                  display: "flex",
                  flexDirection: "column",
                  fontSize: 72,
                  fontWeight: 850,
                  letterSpacing: 0,
                  lineHeight: 0.96,
                }}
              >
                <span>Get the launch decision.</span>
                <span>Close the loop.</span>
              </div>
              <div style={{ color: "#a9b1bf", fontSize: 28, lineHeight: 1.35 }}>
                Put the real launch material in one private room, invite the reviewer, and leave with a decision record.
              </div>
            </div>
          </div>

          <div style={{ color: "#7f8795", display: "flex", fontSize: 22, gap: 18 }}>
            <span>Private by default</span>
            <span>Invite links</span>
            <span>Live cursors</span>
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
          {[
            { color: "#48a7ff", height: 152, left: 48, title: "Launch material", top: 62, width: 190 },
            { color: "#ef6f5e", height: 118, left: 262, title: "Reviewer call", top: 88, width: 170 },
            { color: "#9b7bd9", height: 144, left: 176, title: "Approval criteria", top: 248, width: 204 },
            { color: "#62d681", height: 112, left: 326, title: "Decision record", top: 232, width: 160 },
          ].map((card) => (
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
              <div style={{ color: "#f4f1e8", fontSize: 24, fontWeight: 800 }}>{card.title}</div>
              <div style={{ background: "#2a313d", borderRadius: 8, height: 16, width: "72%" }} />
              <div style={{ background: "#242b36", borderRadius: 8, height: 16, width: "52%" }} />
            </div>
          ))}
          <div
            style={{
              background: "#facc5c",
              borderRadius: 999,
              color: "#111318",
              display: "flex",
              fontSize: 22,
              fontWeight: 800,
              left: 310,
              padding: "10px 16px",
              position: "absolute",
              top: 64,
            }}
          >
            Maya editing
          </div>
          <div
            style={{
              background: "#48a7ff",
              borderRadius: 999,
              color: "#071018",
              display: "flex",
              fontSize: 20,
              fontWeight: 800,
              left: 68,
              padding: "9px 14px",
              position: "absolute",
              top: 370,
            }}
          >
            Jules reviewing
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
