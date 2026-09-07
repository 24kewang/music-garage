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
      </header>

      <section className={styles.section}>
        <p>
          {SITE.name} is a free collection of music games and tools that run in your web
          browser. These Terms apply when you use it. If you do not agree with them,
          please do not use {SITE.name}.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>1. Who Can Use {SITE.name}</h2>
        <p>
          {SITE.name} is open to anyone. There are no accounts to create and nothing to
          sign up for. It is not directed to children under 13, and we do not knowingly
          collect information from them. See our{" "}
          <a className={styles.link} href="/privacy">
            Privacy Policy
          </a>{" "}
          for what the site stores.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>2. Acceptable Use</h2>
        <p>When using {SITE.name}, you agree not to:</p>
        <ul className={styles.list}>
          <li>Break the law or infringe the rights of others.</li>
          <li>
            Upload material you do not have the right to use. Sheet music is often under
            copyright, and whether you may use a given excerpt is between you and its
            rights holder.
          </li>
          <li>
            Record other people through your camera or microphone without their
            knowledge or consent.
          </li>
          <li>
            Disrupt the site or the infrastructure that serves it, including through
            automated scanning or load testing.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>3. Your Content</h2>
        <p>
          The images you upload, the audio you record, and the settings you configure
          stay yours. We do not ask for a license to them, and we could not use them if
          we did: <strong>your content is never transmitted to us</strong>. It is stored
          in your own browser and read back from there.
        </p>
        <p>
          Because your content lives only in your browser, it is not backed up. Clearing
          your browser data deletes it permanently, and we cannot recover it.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>4. Intellectual Property and Licensing</h2>
        <p>
          The source code for {SITE.name} is open source under the{" "}
          <strong>MIT License</strong>. You may use, modify, and redistribute it on those
          terms. See the{" "}
          <a
            className={styles.link}
            href={`${SITE.repoUrl}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
          >
            LICENSE file
          </a>{" "}
          in our repository. The MIT License covers the code. It does not grant rights to
          the {SITE.name} name, wordmark, or visual identity.
        </p>
        <p>
          {SITE.name} is built on open-source software that remains under its own licenses
          and copyrights, listed in{" "}
          <a
            className={styles.link}
            href={`${SITE.repoUrl}/blob/main/THIRD-PARTY-NOTICES.md`}
            target="_blank"
            rel="noreferrer noopener"
          >
            THIRD-PARTY-NOTICES.md
          </a>
          . Some of these components are downloaded from third-party servers while you use
          the site, and your use of them is also subject to the terms of the providers
          that host them.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>5. Service Availability</h2>
        <p>
          We do not guarantee that {SITE.name} will be available at any particular time.
          The site may be unavailable, slow, changed, or discontinued at any time and
          without notice, and games may be altered or removed.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>6. Disclaimers</h2>
        <p>
          {SITE.name} is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
          without warranties of any kind, whether express or implied, including warranties
          of merchantability, fitness for a particular purpose, and non-infringement, to
          the fullest extent permitted by law.
        </p>
        <p>
          We make no guarantee that the site is accurate. Pitch detection, interval
          identification, and melody comparison are best-effort signal processing running
          on whatever microphone you have, and they can get things wrong. Do not rely on
          them for anything that matters, such as an examination, an audition, or a tuning
          you cannot check by ear.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>7. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, {SITE.publisher} and the operators of{" "}
          {SITE.name} will not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or any loss of data, arising from your use
          of {SITE.name}. This includes the loss of recordings, uploaded files, settings,
          and scores stored in your browser, and any consequence of granting camera or
          microphone access.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>8. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of Illinois, United States,
          without regard to its conflict-of-laws rules.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>9. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. The date at the top of this page
          shows when they last changed. If you continue to use {SITE.name} after an
          update, you accept the revised Terms.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>10. Contact Us</h2>
        <p>
          Questions about these Terms? Reach us through{" "}
          <a
            className={styles.link}
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            our issue tracker
          </a>
          . To report a security issue, see{" "}
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
