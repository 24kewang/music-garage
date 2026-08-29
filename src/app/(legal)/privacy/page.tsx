import type { Metadata } from "next";
import { ISSUES_URL, SITE } from "@/shared/site";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${SITE.name} stores, what it does not, and where it makes third-party requests.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Last updated {SITE.legalLastUpdated}</p>
        {/* <p className={styles.note}>
          Written in plain language and in good faith, from an audit of what this site
          actually does. It is not legal advice, and it has not been reviewed by a
          lawyer.
        </p> */}
      </header>

      <section className={styles.section}>
        <h2 className={styles.heading}>The short version</h2>
        <p>
          {SITE.name} has <strong>no accounts, no cookies, and no server</strong>. It is
          a set of static files. Every game runs entirely inside your browser tab.
        </p>
        <p>
          <strong>
            No audio, video, or image you produce or upload is ever transmitted anywhere.
          </strong>{" "}
          Recordings, uploaded excerpts, settings and scores are written to storage
          inside your own browser, and only your browser can read them. Nothing is sent
          to us, because there is no &ldquo;us&rdquo; to send it to — no database, no
          logs of your activity, no analytics beyond an anonymous page count.
        </p>
        <p>
          There are exactly two exceptions, both described below: an anonymous traffic
          counter, and two third-party requests that happen only if you switch on the
          camera filter in the Random Excerpt Generator.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>What is stored in your browser</h2>
        <p>
          All of this lives on your device. It survives reloads by design, it is never
          uploaded, and you can delete all of it at any time by clearing site data for
          this domain in your browser settings.
        </p>

        <h3 className={styles.subheading}>Settings and scores</h3>
        <p>
          Stored in <span className={styles.code}>localStorage</span> under these keys:
        </p>
        <ul className={styles.list}>
          <li>
            <span className={styles.code}>music-garage:music:settings</span> — MUSIC&rsquo;s
            player names, turn order, strike counts, word and tolerance
          </li>
          <li>
            <span className={styles.code}>
              music-garage:musical-wavelength:settings
            </span>{" "}
            — the dial&rsquo;s answer mode and range
          </li>
          <li>
            <span className={styles.code}>music-garage:pitch-math:settings</span> —
            instrument transposition and label length
          </li>
          <li>
            <span className={styles.code}>music-garage:reg:settings</span> and{" "}
            <span className={styles.code}>music-garage:reg:selection</span> — the filter
            box&rsquo;s position and size, and which excerpts are ticked
          </li>
          <li>
            <span className={styles.code}>loop-station:settings</span> (and the legacy{" "}
            <span className={styles.code}>loop-station:delay-ms</span>) — default track
            delay, volume, reverb, and your measured latency calibration
          </li>
        </ul>
        <p>
          The player names in MUSIC are the only place the site holds anything resembling
          a personal detail, and they are whatever you type. They never leave the device.
        </p>

        <h3 className={styles.subheading}>Recorded audio</h3>
        <p>
          The Loop Station&rsquo;s <strong>Save</strong> button writes your loops — every
          track&rsquo;s audio and the whole mix — to an{" "}
          <span className={styles.code}>IndexedDB</span> database named{" "}
          <span className={styles.code}>loop-station</span>, so the session comes back
          when you return. Holding the Save button turns it into a Delete Saved button,
          which removes it. Audio recorded in MUSIC and Pitch Math is held in memory only
          and is gone when the page closes.
        </p>

        <h3 className={styles.subheading}>Uploaded excerpt images</h3>
        <p>
          The Random Excerpt Generator keeps your uploaded images in the browser&rsquo;s{" "}
          <strong>Origin Private File System</strong>, in a private directory named{" "}
          <span className={styles.code}>reg</span>. This is storage the page cannot see
          outside its own origin and no other site can reach. The site asks the browser
          to mark it persistent so a routine cache clean-up does not wipe your library;
          your browser decides whether to honor that. The gear panel has a
          delete-everything control that removes the whole library.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Camera and microphone</h2>
        <p>
          Several games need a microphone, and the Random Excerpt Generator can use the
          camera. Both are requested through your browser&rsquo;s standard permission
          prompt, and both can be revoked at any time in your browser&rsquo;s site
          settings.
        </p>
        <p>
          What comes in is analyzed in the tab and discarded. Pitch detection reads the
          waveform to work out what note is sounding; face tracking reads the video frame
          to work out where your head is.{" "}
          <strong>Neither stream is uploaded, recorded to any server, or retained</strong>{" "}
          beyond the game&rsquo;s own in-memory buffer.
        </p>
        <p>
          The camera filter is <strong>off by default</strong> and has to be switched on
          deliberately, per session. Leave it off and the game never asks for the camera
          and never loads the face-tracking code at all.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Third-party requests</h2>
        <p>
          Turning on the camera filter in the Random Excerpt Generator makes your browser
          fetch the face-tracking software from two third-party providers. This is the
          only time the site contacts anyone but its own server, and it happens only in
          that mode:
        </p>
        <ul className={styles.list}>
          <li>
            <span className={styles.code}>cdn.jsdelivr.net</span> — jsDelivr, which
            serves the MediaPipe face-detection runtime
          </li>
          <li>
            <span className={styles.code}>storage.googleapis.com</span> — Google Cloud
            Storage, which serves the face-landmark model file
          </li>
        </ul>
        <p>
          Making those requests <strong>reveals your IP address and browser user agent</strong>{" "}
          to jsDelivr and to Google, as any request to any server does. Neither request
          carries anything about you, your library, or what the camera sees — they are
          plain downloads of two public files. Once downloaded, all face tracking runs in
          your browser. What the providers do with that request is governed by their own
          policies:{" "}
          <a
            className={styles.link}
            href="https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net"
            target="_blank"
            rel="noreferrer noopener"
          >
            jsDelivr
          </a>{" "}
          and{" "}
          <a
            className={styles.link}
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google
          </a>
          .
        </p>
        <p>
          These URLs are fixed inside the face-tracking library the site uses and cannot
          be redirected without modifying it. If you would rather not make those
          requests, leave the camera filter off — the Random Excerpt Generator works as an
          ordinary picker without it, and nothing else on the site loads anything
          externally.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Analytics</h2>
        <p>
          The site uses <strong>Cloudflare Web Analytics</strong> to count page views. It
          is <strong>cookieless</strong>: it sets no cookie, stores nothing on your
          device, does not fingerprint your browser, and does not track you across other
          websites. What it produces is aggregate — how many people visited which page,
          roughly where in the world from, which browsers. It cannot identify you and it
          is never combined with anything else.
        </p>
        <p>
          This is the only measurement on the site, and there is no intention to extend
          it. There are no advertising trackers, no social media pixels, and no
          third-party analytics. Cloudflare also serves the site itself, so it processes
          request metadata — your IP address, essentially — as any hosting provider must
          in order to deliver a page to you.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Children</h2>
        <p>
          {SITE.name} is not directed to children under 13, and{" "}
          <strong>no personal information is collected from anyone</strong>, of any age.
          There are no accounts to create, no names or email addresses requested, and
          nothing a child could submit that would reach us.
        </p>
        <p>
          Because nothing is collected, there is nothing held about a child to disclose
          or delete on request. If you are a parent or guardian, what is worth knowing is
          the practical part: several games ask for microphone access and one can ask for
          camera access, all of it processed on the device and none of it recorded
          anywhere. Anything saved lives on that device and is removed by clearing the
          browser&rsquo;s site data.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Your choices</h2>
        <ul className={styles.list}>
          <li>
            <strong>Delete everything the site has stored</strong> — clear site data for
            this domain in your browser settings. That removes the settings, the saved
            loops and the excerpt library in one action.
          </li>
          <li>
            <strong>Delete just the excerpt library</strong> — the delete-everything
            control in the Random Excerpt Generator&rsquo;s gear panel.
          </li>
          <li>
            <strong>Delete just a saved loop</strong> — hold the Loop Station&rsquo;s Save
            button until it fills.
          </li>
          <li>
            <strong>Revoke camera or microphone access</strong> — your browser&rsquo;s
            site permission settings. The games degrade rather than break.
          </li>
          <li>
            <strong>Avoid the third-party requests</strong> — leave the camera filter off.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Changes and contact</h2>
        <p>
          This policy may change as the site changes. The date at the top is the notice.
          Questions go to{" "}
          <a
            className={styles.link}
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            the project&rsquo;s issue tracker
          </a>
          , which is public — do not post anything private there.
        </p>
      </section>
    </>
  );
}
