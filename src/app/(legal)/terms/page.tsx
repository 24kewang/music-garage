import type { Metadata } from "next";
import { ISSUES_URL, SITE } from "@/shared/site";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms for using ${SITE.name}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.updated}>Last updated {SITE.legalLastUpdated}</p>
        {/* <p className={styles.note}>
          Written in plain language and in good faith, from an audit of what this site
          actually does. It is not legal advice, and it has not been reviewed by a
          lawyer.
        </p> */}
      </header>

      <section className={styles.section}>
        <p>
          {SITE.name} is a free collection of browser-based music games and tools,
          published by {SITE.publisher}. By using it, you agree to what follows. If you
          do not, please do not use the site.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>1. The site is provided as-is</h2>
        <p>
          {SITE.name} is provided <strong>&ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, without warranty of any kind</strong>, express or implied,
          including any implied warranties of merchantability, fitness for a particular
          purpose, or non-infringement.
        </p>
        <p>
          In particular, nothing here is guaranteed to be accurate. The pitch detection,
          interval identification and melody comparison are best-effort signal
          processing running on whatever microphone you happen to have. They can and do
          get things wrong. Do not rely on them for anything that matters — an
          examination, an audition, a tuning you cannot check by ear.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>2. No guarantee of uptime</h2>
        <p>
          There is no service level of any kind. The site may be unavailable, slow,
          changed, or discontinued entirely at any time and without notice. Games may be
          altered or removed. Nothing here is a commitment to keep anything running.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>3. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, {SITE.publisher} is not liable for any
          direct, indirect, incidental, consequential or special damages arising out of
          your use of, or inability to use, {SITE.name}. That expressly includes{" "}
          <strong>loss of anything you have stored through the site</strong> — recorded
          loops, uploaded excerpts, settings and scores all live in your own browser and
          are not backed up anywhere. Clearing your browser data deletes them
          permanently, and so can a browser you have not visited in a while.
        </p>
        <p>
          It also includes any consequence of granting camera or microphone access.
          Those permissions are yours to grant and yours to revoke.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>4. Acceptable use</h2>
        <p>Keep it simple:</p>
        <ul className={styles.list}>
          <li>
            Do not use the site for anything unlawful, or to infringe anyone else&rsquo;s
            rights.
          </li>
          <li>
            Do not upload material you have no right to use. The Random Excerpt Generator
            takes images from your own library; sheet music is frequently under copyright,
            and whether you may use a given excerpt is between you and its rights holder.
          </li>
          <li>
            Do not attempt to disrupt the site or the infrastructure serving it, and do
            not run automated scanners or load tests against it.
          </li>
          <li>
            Do not record other people through the camera or microphone without their
            knowledge. Nothing is transmitted anywhere, but that is a matter of courtesy
            and often of law where you are.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>5. Your content stays yours</h2>
        <p>
          The images you upload, the audio you record and the settings you configure
          remain entirely yours. No license to them is asked for or granted, because{" "}
          <strong>they are never transmitted anywhere</strong> — they are written to
          storage inside your own browser and read back from it. There is no server to
          hold them and no account they are attached to. See the{" "}
          <a className={styles.link} href="/privacy">
            privacy policy
          </a>{" "}
          for the specifics.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>6. Licensing</h2>
        <p>
          The source code for {SITE.name} is open source under the{" "}
          <strong>MIT license</strong>. You may use, modify and redistribute it on those
          terms — see the{" "}
          <a
            className={styles.link}
            href={`${SITE.repoUrl}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
          >
            LICENSE file
          </a>{" "}
          in the repository. The MIT license covers the code. It does not grant you
          rights to the name, the wordmark, or the visual identity.
        </p>
        <p>
          {SITE.name} is built on open-source software that remains under its own
          licenses and copyrights, listed in{" "}
          <a
            className={styles.link}
            href={`${SITE.repoUrl}/blob/main/THIRD-PARTY-NOTICES.md`}
            target="_blank"
            rel="noreferrer noopener"
          >
            THIRD-PARTY-NOTICES.md
          </a>
          . Two of those components are fetched from third-party servers while you use
          the site rather than being bundled with it: the face-tracking runtime and model
          behind the Random Excerpt Generator&rsquo;s camera filter. They are governed by
          their own licenses and by the terms of the providers that host them.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>7. Changes to these terms</h2>
        <p>
          These terms may change. The date at the top is the only notice given, so check
          it if it matters to you. Continuing to use the site after a change means you
          accept the revised terms.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>8. Contact</h2>
        <p>
          Questions, corrections and problems go to{" "}
          <a
            className={styles.link}
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            the project&rsquo;s issue tracker
          </a>
          . Security reports have their own route — see{" "}
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
    </>
  );
}
