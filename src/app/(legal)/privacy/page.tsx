import type { Metadata } from "next";
import { ISSUES_URL, SITE } from "@/shared/site";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} handles your data.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Last updated {SITE.legalLastUpdated}</p>
      </header>

      <section className={styles.section}>
        <p>
          {SITE.name} is a set of music games and tools that run entirely in your web
          browser. There are no accounts, no cookies, and no server that receives your
          data. This policy explains what is stored, where it is stored, and the few
          cases in which your browser contacts someone else.
        </p>
        <p>
          The short version: <strong>we do not collect your personal information</strong>,
          and no audio, video, or file you produce or upload is ever sent to us or to
          anyone else.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>1. Information We Collect</h2>
        <p>
          We do not collect personal information. We have no accounts, no sign-in, and no
          database. We never ask for your name, email address, or payment details.
        </p>

        <h3 className={styles.subheading}>Information stored on your device</h3>
        <p>
          The site saves your settings and your work in your own browser so they survive a
          reload. This data stays on your device and is never uploaded. It is stored in
          your browser&rsquo;s <span className={styles.code}>localStorage</span> under
          these keys:
        </p>
        <ul className={styles.list}>
          <li>
            <span className={styles.code}>music-garage:music:settings</span> stores player
            names, turn order, strike counts, word, and tolerance for MUSIC
          </li>
          <li>
            <span className={styles.code}>
              music-garage:musical-wavelength:settings
            </span>{" "}
            stores the dial&rsquo;s answer mode and range
          </li>
          <li>
            <span className={styles.code}>music-garage:pitch-math:settings</span> stores
            instrument transposition and label length
          </li>
          <li>
            <span className={styles.code}>music-garage:reg:settings</span> and{" "}
            <span className={styles.code}>music-garage:reg:selection</span> store the
            filter box&rsquo;s position and size, and which excerpts are selected
          </li>
          <li>
            <span className={styles.code}>loop-station:settings</span> and the legacy{" "}
            <span className={styles.code}>loop-station:delay-ms</span> store default track
            delay, volume, reverb, and your latency calibration
          </li>
        </ul>
        <p>
          Player names in MUSIC are the only place the site holds anything resembling a
          personal detail, and they are whatever you choose to type. They never leave your
          device.
        </p>
        <p>
          The Loop Station&rsquo;s <strong>Save</strong> button writes your loops, their
          audio, and the whole mix to an{" "}
          <span className={styles.code}>IndexedDB</span> database named{" "}
          <span className={styles.code}>loop-station</span>, so your session is there when
          you return. Audio recorded in MUSIC and Pitch Math is held in memory only and is
          gone when you close the page.
        </p>

        <h3 className={styles.subheading}>Camera and microphone</h3>
        <p>
          Several games use your microphone, and the Random Excerpt Generator can use your
          camera. Your browser asks your permission first, and you can revoke it at any
          time in your browser&rsquo;s site settings.
        </p>
        <p>
          These streams are processed in your browser and then discarded. Pitch detection
          reads the waveform to identify the note you are playing; face tracking reads the
          video frame to locate your head.{" "}
          <strong>
            We do not upload, record, or retain your camera or microphone input.
          </strong>
        </p>
        <p>
          The camera filter is off by default and must be switched on each session. If you
          leave it off, the game never requests your camera.
        </p>

        <h3 className={styles.subheading}>Files you upload</h3>
        <p>
          The Random Excerpt Generator lets you import images of musical excerpts. These
          are stored in your browser&rsquo;s <strong>Origin Private File System</strong>,
          in a private directory named <span className={styles.code}>reg</span>. No other
          site can read it, and neither can we. The site asks your browser to keep this
          storage persistent so routine cleanup does not remove your library; your browser
          decides whether to honor that request.
        </p>

        <h3 className={styles.subheading}>Information collected automatically</h3>
        <p>
          Like most websites, our hosting provider processes basic technical data needed to
          deliver pages to you, including your IP address. We use{" "}
          <strong>Cloudflare Web Analytics</strong> to count page views. It is cookieless,
          does not fingerprint your browser, and does not track you across other websites.
          It reports aggregate figures such as how many people visited a page and roughly
          which country and browser they used. It cannot identify you.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>2. How We Use Your Information</h2>
        <p>
          The data stored on your device is used only to run the site: to restore your
          settings, keep your saved loops, and remember your excerpt library between
          visits. Aggregate analytics are used to understand how much the site is being
          used. We do not build profiles, and there is no personal information for us to
          use for anything else.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>3. How We Share Information</h2>
        <p>
          We do not sell or rent your information, and we do not share it for advertising.
          We have no personal information to share. Your recordings, uploads, and settings
          never leave your device, so there is nothing for us to disclose to anyone,
          including in response to a legal request.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>4. Third-Party Services</h2>
        <p>
          Two providers are involved in delivering the site:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Cloudflare</strong> hosts {SITE.name} and provides its analytics.
          </li>
          <li>
            <strong>jsDelivr</strong> and <strong>Google Cloud Storage</strong> serve the
            face-tracking software used by the Random Excerpt Generator&rsquo;s camera
            filter.
          </li>
        </ul>
        <p>
          When you turn on the camera filter, your browser downloads that software from{" "}
          <span className={styles.code}>cdn.jsdelivr.net</span> and{" "}
          <span className={styles.code}>storage.googleapis.com</span>. As with any request
          to any server, this <strong>reveals your IP address and browser user agent</strong>{" "}
          to those providers. The requests are plain downloads of two public files and
          carry nothing about you, your library, or what your camera sees. All face
          tracking then runs in your browser.
        </p>
        <p>
          This is the only time the site contacts anyone other than its own host. If you
          would prefer not to make these requests, leave the camera filter off. Your use of
          those services is governed by their own policies:{" "}
          <a
            className={styles.link}
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Cloudflare
          </a>
          ,{" "}
          <a
            className={styles.link}
            href="https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net"
            target="_blank"
            rel="noreferrer noopener"
          >
            jsDelivr
          </a>
          , and{" "}
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
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>5. Children&rsquo;s Privacy</h2>
        <p>
          {SITE.name} is not directed to children under 13, and we do not knowingly
          collect personal information from anyone, of any age. There are no accounts to
          create and nothing a child could submit that would reach us. Because we collect
          nothing, there is no information about a child for us to disclose or delete.
        </p>
        <p>
          If you are a parent or guardian, the practical points are these: several games
          request microphone access and one can request camera access, all of it processed
          on the device and none of it recorded anywhere. Anything the site saves stays on
          that device and can be removed by clearing the browser&rsquo;s site data.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>6. Data Retention</h2>
        <p>
          We do not retain your data, because we never receive it. Everything the site
          saves is kept in your browser until you remove it. Aggregate analytics are
          retained by Cloudflare according to their own retention schedule and contain no
          information that identifies you.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>7. Security</h2>
        <p>
          The site is served over HTTPS and sends a strict Content Security Policy along
          with other security headers. Because your recordings and files stay in your
          browser, they are protected by your browser&rsquo;s own isolation between sites:
          no other website can read them.
        </p>
        <p>
          Anyone with access to your device and browser profile can open the site and see
          what it has saved. If you share a computer, clear the site data when you are
          done. To report a security issue, see{" "}
          <a
            className={styles.link}
            href={`${SITE.repoUrl}/blob/main/SECURITY.md`}
            target="_blank"
            rel="noreferrer noopener"
          >
            SECURITY.md
          </a>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>8. Your Privacy Rights</h2>
        <p>
          Privacy laws in many places give you rights to access, correct, export, or delete
          the personal information a service holds about you. We hold none, so there is
          nothing for us to produce or erase on request.
        </p>
        <p>You remain in full control of what the site has saved on your device:</p>
        <ul className={styles.list}>
          <li>
            <strong>Delete everything</strong> by clearing site data for this domain in
            your browser settings. This removes your settings, saved loops, and excerpt
            library together.
          </li>
          <li>
            <strong>Delete your excerpt library</strong> using the delete control in the
            Random Excerpt Generator&rsquo;s settings panel.
          </li>
          <li>
            <strong>Delete a saved loop</strong> by holding the Loop Station&rsquo;s Save
            button until it fills.
          </li>
          <li>
            <strong>Revoke camera or microphone access</strong> in your browser&rsquo;s
            site permission settings.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>9. Do-Not-Track</h2>
        <p>
          Most browsers offer a Do-Not-Track (DNT) setting. We do not track you across
          websites under any setting, so there is no behavior for DNT to change.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. The date at the top of this
          page shows when it last changed.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>11. Contact Us</h2>
        <p>
          Questions about this policy? Reach us through{" "}
          <a
            className={styles.link}
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            our issue tracker
          </a>
          . It is public, so please do not post anything private there.
        </p>
      </section>
    </>
  );
}
