# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/24kewang/music-garage/security/advisories/new)
on this repository, rather than opening a public issue.

Include what you did, what happened, and which browser you were using. A proof of
concept helps but is not required. Expect an acknowledgment within a week — this is
a personal project, not a staffed product.

Please do not run automated scanners against the live site, and do not attempt
denial-of-service testing.

## What the attack surface actually is

Worth knowing before you spend time on this: **there is no server and no user data.**
Music Garage is a static export served from Cloudflare's edge. There are no accounts,
no cookies, no database, no API, and no session state. Nothing a visitor records,
uploads, or configures is ever transmitted anywhere — it lives in that browser's
`localStorage`, IndexedDB, and Origin Private File System, and only that browser can
read it.

That rules out most of the usual categories. The things that are genuinely in scope:

- **Cross-site scripting** or any way to get script execution into a page. Filenames
  from uploaded excerpt libraries are the most interesting untrusted input on the
  site, since they are rendered as captions.
- **Weaknesses in the security headers** in `public/_headers` — a Content Security
  Policy bypass, a missing directive, a header that fails to apply to some route.
- **Supply chain.** The Random Excerpt Generator loads MindAR's face-tracking stack,
  which fetches a WASM runtime from `cdn.jsdelivr.net` and a model from
  `storage.googleapis.com` at runtime. These are third-party origins pinned inside
  MindAR's shipped bundle without subresource integrity, and that is a known,
  documented risk we accept — see the privacy policy. Reports about *those providers*
  should go to them; reports about how this site loads from them are welcome here.
- **Anything that causes data to leave the browser.** The claim that no audio, video,
  or uploaded image ever leaves the tab is the central security property of this site.
  A counterexample is the most valuable thing you could send.

Out of scope: missing headers that only affect hypothetical future functionality,
reports generated wholesale by scanners with no demonstrated impact, and issues in
third-party dependencies that are already fixed upstream — those arrive on their own
through Dependabot.

## Supported versions

Only the currently deployed site is supported. There are no tagged releases to
backport to.
