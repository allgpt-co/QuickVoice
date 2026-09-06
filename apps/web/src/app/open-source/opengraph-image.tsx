import { ImageResponse } from "next/og";

export const alt =
  "QuickVoice open-source AI phone-agent stack with console, API, LiveKit worker, and telephony integrations";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#f7f7f8",
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 76,
          width: 1,
          height: "100%",
          background: "#dbe2ea",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 76,
          width: 1,
          height: "100%",
          background: "#dbe2ea",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 98,
          left: 0,
          width: "100%",
          height: 1,
          background: "#dbe2ea",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 70,
          left: 0,
          width: "100%",
          height: 1,
          background: "#dbe2ea",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 392,
          top: 99,
          width: 1,
          height: 461,
          background: "#dbe2ea",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: 14,
          background: "#2563eb",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 77,
          right: 77,
          height: 99,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 34px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-1px",
          }}
        >
          QuickVoice
        </div>
        <div
          style={{
            display: "flex",
            color: "#2563eb",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "2px",
          }}
        >
          OPEN SOURCE / MIT
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 99,
          bottom: 71,
          left: 77,
          right: 393,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "42px 52px 42px 34px",
        }}
      >
        <div
          style={{
            display: "flex",
            maxWidth: 700,
            fontSize: 75,
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: "-4.5px",
          }}
        >
          Source you can inspect. Workflows you define.
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 660,
            marginTop: 34,
            color: "#526071",
            fontSize: 24,
            lineHeight: 1.35,
          }}
        >
          Self-hostable AI phone-agent infrastructure in one inspectable
          repository.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 99,
          right: 77,
          bottom: 71,
          width: 315,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {[
          ["INCLUDED", "Console, Express API, LiveKit worker"],
          ["TELEPHONY", "Twilio or Telnyx"],
          ["SOURCE", "github.com/allgpt-co/QuickVoice"],
        ].map(([label, value], index) => (
          <div
            key={label}
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              justifyContent: "center",
              padding: "24px 28px",
              borderTop: index > 0 ? "1px solid #dbe2ea" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                color: "#2563eb",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "2px",
              }}
            >
              {label}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 12,
                color: "#263244",
                fontSize: 20,
                lineHeight: 1.35,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 77,
          right: 77,
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 34px",
          color: "#526071",
          fontSize: 15,
          letterSpacing: "0.5px",
        }}
      >
        quickvoice.co/open-source
      </div>
    </div>,
    size,
  );
}
