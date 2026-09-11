# Security policy

kanhrd is a web UI in front of live terminal sessions. A flaw that lets an
unintended person reach the bridge is a flaw that gives them a shell on the
machines it is configured against. Reports are taken seriously and handled
privately.

Before reporting, read [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md). It
documents what kanhrd defends against and what it deliberately does not —
several properties that look like vulnerabilities are documented design
decisions, and knowing which is which will save you time.

## Supported versions

kanhrd is alpha. Every package is at `0.0.0`, there are no releases, and
nothing is tagged.

| Version         | Supported |
| --------------- | --------- |
| `main` (latest) | Yes       |
| Anything else   | No        |

Only the current `main` receives fixes. There are no maintenance branches
and no backports — a fix lands on `main` and you update by pulling. If you
are running kanhrd from a checkout, pull before reporting: the issue may
already be fixed. Expect breaking changes between commits.

## Reporting a vulnerability

Do not open a public issue, a pull request, or a discussion for a security
problem.

Use GitHub's private vulnerability reporting:

1. Go to <https://github.com/wakaru44/kanhrd/security/advisories/new>.
2. Fill in the advisory form and submit. The report is visible only to you
   and the maintainers.

If that page returns a 404, private reporting has not been enabled on the
repository yet. Maintainers turn it on under **Settings → Advanced Security
→ Private vulnerability reporting → Enable**. If you hit the 404 as a
reporter, open a public issue that says only "security report, please enable
private vulnerability reporting" — no details, no reproduction steps — and
wait for the private channel before saying anything more.

Useful things to include:

- The version or commit SHA you tested.
- How the bridge was deployed: bind address, whether a reverse proxy was in
  front, and which one.
- Reproduction steps, and what an attacker gains.
- Any suggested fix. Optional, always welcome.

## What to expect

kanhrd is maintained by one person in their own time. These are the
expectations that can actually be met, not an SLA:

- **Acknowledgement within about a week.** If two weeks pass with no
  response, ping the advisory thread — a missed notification is more likely
  than a deliberate silence.
- **An assessment after that**, saying whether the report is accepted, and
  if so how serious it looks.
- **No fix deadline.** Serious issues are prioritised over everything else
  in flight; anything less than serious lands when it lands.
- **Disclosure by agreement.** A fix ships with an advisory crediting the
  reporter, unless you prefer otherwise. If you plan to publish
  independently, say so in the report so the timeline can be coordinated
  rather than discovered.

There is no bug bounty.

## Known-by-design exposures

Reports of the following are already documented and will be closed with a
pointer back here. They are the intended design, recorded in
[`docs/adr/0003-delegated-auth-with-loopback-default.md`](docs/adr/0003-delegated-auth-with-loopback-default.md)
and detailed in [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md):

- The bridge has no authentication or authorisation of its own. Identity is
  delegated to a reverse proxy placed in front of it.
- Anyone who reaches the bridge gets everything: every configured host,
  every terminal, keystroke injection, and session destruction. The one
  exception is a web page: `/ws` and `GET /api/*` refuse an `Origin`
  outside the bridge's allowlist, which is derived from its bind and port
  and extended with `allowed_origins:`. That check bounds which page may
  drive the bridge, never which person — and it does not cover `Host`, so
  DNS rebinding remains out of scope.
- Binding a non-loopback address is possible with an explicit
  `--i-know-what-im-doing` flag. Doing so without a proxy in front is an
  unauthenticated shell on the network, and the flag is the only warning you
  get.
- The test suites drive a real herdr and type into live panes — their own.
  Each run creates, seeds and deletes a throwaway `kanhrd-test-*` herdr
  session, and refuses the operator's default socket outright.

What is in scope: any way to reach the bridge or a herdr socket that
bypasses a correctly configured reverse proxy, any way to escape the
documented model, and anything the threat model claims kanhrd defends
against but does not.
