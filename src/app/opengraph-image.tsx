import { ImageResponse } from "next/og";
import { SITE } from "@/shared/site";

/**
 * The link preview card, rendered to a PNG at build time.
 *
 * Righteous is not used here even though it is the wordmark face everywhere else:
 * `next/og` needs font *bytes*, and fetching them during the build would make the
 * build depend on the network for a decorative image. The default face is close
 * enough at this size, and the accent glow is what carries the identity.
 */
export const alt = `${SITE.name} — ${SITE.description}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Required by `output: "export"` — see the same note in robots.ts. */
export const dynamic = "force-static";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // The literal values behind --color-bg and --color-accent-glow. Satori has
          // no CSS custom properties, so these cannot be tokens.
          background: "#0d0d16",
          backgroundImage:
            "radial-gradient(circle at 50% 38%, rgba(99,102,241,0.30), rgba(13,13,22,0) 62%)",
          color: "#f2f3f7",
          padding: 80,
        }}
      >
        <div
          style={{
            fontSize: 30,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#818cf8",
            marginBottom: 18,
          }}
        >
          {SITE.eyebrow}
        </div>

        <div style={{ fontSize: 132, fontWeight: 700, letterSpacing: -2 }}>
          {SITE.name}
        </div>

        <div
          style={{
            display: "flex",
            width: 220,
            height: 4,
            borderRadius: 2,
            background: "#818cf8",
            margin: "38px 0",
          }}
        />

        <div
          style={{
            fontSize: 34,
            color: "#a2a3b4",
            textAlign: "center",
            maxWidth: 860,
            lineHeight: 1.4,
          }}
        >
          {SITE.description}
        </div>
      </div>
    ),
    size,
  );
}
