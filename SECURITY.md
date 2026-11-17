# Security policy — Margin

Margin is a small, invitation-only print room. This file records the security
model, the controls in place, and how to report a problem.

## Reporting a vulnerability

Email **sandeeproy4984@gmail.com** with:

- the page or endpoint involved;
- what you expected and what happened;
- the smallest reproduction you can share;
- whether any personal data or physical printing was affected.

Do not open a public issue for a vulnerability, do not include passwords,
session cookies, Razorpay keys, or someone else's document, and do not run a
denial-of-service test against the laptop or printer. We usually reply within
two business days.

## Security model

- **Invitation only.** Accounts are created from a single-use, expiring invite
  code. The owner may disable, re-enable, or reset any member account.
- **Least privilege.** Members can read only their own jobs, previews, and
  history. The owner dashboard is limited to accounts, invitations, printers,
  aggregate earnings, and payment amounts. It never returns member emails or
  another person's documents.
- **Payments before paper.** The server recomputes the amount, verifies the
  Razorpay signature, fetches the payment from Razorpay, and checks the amount
  and currency before releasing a print. A client cannot choose the price.
- **No document cloud.** File bodies go from the browser to the laptop over a
  single-use upload token. Temporary files are removed by the normal cleanup.
- **Session safety.** Passwords use scrypt. Sessions are signed, HttpOnly,
  SameSite=Lax cookies, marked Secure on HTTPS, and invalidated by a version
  counter when a password is reset or an account is disabled.
- **Request safety.** State-changing API calls require a same-origin request
  and the `X-Margin-Intent: app` header. API responses are `no-store`.
- **Rate limits.** Sign-in, registration, upload preparation, and print
  requests are limited per account and per client address.
- **Private network.** Vercel adds a proxy secret to API requests. Direct
  requests to the tunnel are rejected, except the single-use upload PUT and the
  minimal health response.
- **Sanitized failures.** Printer names, ports, local paths, driver details,
  stack traces, and payment credentials are logged only on the laptop, never
  returned to a member.
- **Headers.** Strict CSP, `frame-ancestors 'none'`, `nosniff`, no-referrer,
  HSTS on HTTPS, a restrictive Permissions-Policy, and COOP for Razorpay
  popups.

## Secrets

- Razorpay keys live only in `margin/.env` on the laptop. `.env` is ignored by
  Git and is never sent to Vercel.
- The Vercel project stores only the tunnel URL and proxy secret.
- If a secret is exposed, rotate it at the provider, update `.env`, restart the
  backend, and verify the live mode line at startup.

## Known boundaries

- The owner controls the laptop's operating system. The interface does not show
  one member's files to another member or to the owner, but an administrator
  with local access could reach temporary files while they exist. Files are
  deleted automatically and are not backup storage.
- Razorpay processes card, UPI, and bank details. Margin never receives full
  payment credentials.
- A print already handed to the Windows print queue cannot be recalled by
  Margin.

## Checks run before release

```powershell
npm audit --omit=dev
npm test
```

`npm test` uses an isolated data directory and never sends paper. The physical
print check (`npm run test:print`) runs only with explicit consent.
