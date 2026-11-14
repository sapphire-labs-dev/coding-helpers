# Security policy

Coding Helpers is a static site: there is no server, account or database. People paste sensitive things into it (access tokens, signing secrets, production JSON), so the site is built so that none of it can leave the browser or be kept.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** and describe what you found, how to reproduce it and the impact you expect.

This is a small project maintained in spare time: we will look at every report as soon as we can. Once a fix is released you will be credited in the release notes, unless you prefer not to be.

Only the latest version on the `main` branch (the deployed site) receives fixes. Problems in the shared layout or helpers may belong to [`@sapphirelabs/ui`](https://github.com/sapphire-labs-dev/sapphire-ui); either repository is fine for a report.

## What is already in place

- **Nothing pasted is stored or sent.** JSON, tokens, secrets and keys stay in page memory only; just preferences go to `localStorage`. Browser tests check that a pasted token never ends up in storage.
- A strict Content-Security-Policy: scripts, styles, fonts and workers only from the site itself, inline code only with a build-time hash, and `connect-src 'self'`, so the page cannot send data to another origin. The page cannot be framed (`frame-ancestors 'none'`).
- No third-party code at run time: no analytics, fonts or CDNs.
- User text is only ever inserted with `textContent`, never as HTML.
- JWT signatures are verified with the browser's Web Crypto API; unsigned (`alg: none`) tokens are flagged, never accepted.
- UUIDs use `crypto.getRandomValues`, never `Math.random`.
- The JSON validator limits nesting depth and treats `"__proto__"` as an ordinary key.
- Dependencies are checked with `npm audit` in CI and updated by Dependabot; CI actions are pinned to commits.
