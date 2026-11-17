# Margin

A small, privacy-first print room. Invited people can send a document from
anywhere to the printer attached to the owner's Windows laptop. The public
interface can live on Vercel; the laptop and printer stay private behind a
tunnel.

Margin is invitation-only, every account has its own uploads and history, and
documents are never stored in a cloud bucket. Files go straight to the laptop,
are prepared there, and are removed automatically.

```
[ phone / laptop browser ]
   │
   ├── static UI ──────────────> [ Vercel ]  (public, fast, cached)
   │
   ├── API calls ──────────────> [ Vercel route proxy ]
   │                                  │  x-margin-proxy
   │                                  ▼
   └── file body (one-time PUT) ──> [ private tunnel ] ──> [ Windows laptop ]
                                                              │
                                                              ▼
                                                    [ EPSON L3110 / USB printer ]
```

## What is included

- **Invitation-only accounts** with owner/member roles, session cookies, CSRF
  and origin checks, login rate limits, and per-user quotas.
- **Per-user privacy**: a member can only see their own jobs and history. The
  owner manages accounts and printers, but cannot open anyone else's documents.
- **Direct uploads**: the browser asks the laptop for a single-use upload token,
  then sends the file body straight to the tunnel. Vercel only handles small API
  requests.
- **Native Windows printing** through `scripts/print-pages.ps1`, using GDI and
  the printer's DEVMODE capabilities. The EPSON L3110 path is USB/GDI, not a
  browser print dialog.
- **Admin printer selection**: all local printers are detected, but the owner
  chooses the one exposed to clients. Clients only ever see a friendly
  "Your printer" label; they never see real names, drivers, ports, or paths.
- **Shared print PIN**: every print needs the print PIN configured for the room.
  The unlock lasts 30 minutes per session and is checked on the server.
- **Hidden tray app**: `scripts/tray.ps1` supervises the Node backend from the
  Windows notification area, with restart supervision and logs. It can start
  automatically at sign-in.
- **Warm paper interface**: Instrument Sans and Instrument Serif, a warm paper
  palette, vermillion accents, crop marks, and print-room motifs.

## Requirements

- Windows 10 or 11 (64-bit) for the laptop that owns the printer.
- Node.js 20 or newer.
- The printer installed in Windows. EPSON L3110 over USB001 is the tested path.
- Desktop Microsoft Office if you want to convert Word, Excel, or PowerPoint
  files. Browser-only Microsoft 365 is not enough; PDF and image uploads work
  without Office.
- For remote access: Cloudflare Tunnel or Tailscale. A quick Cloudflare tunnel
  is enough to try it; a named tunnel is better for a stable address.
- A Vercel account if you want the public interface there.

## First run on the laptop

```powershell
cd margin
npm install
copy .env.example .env
notepad .env
npm start
```

Fill in at least:

```ini
MARGIN_ADMIN_EMAIL=you@example.com
MARGIN_ADMIN_PASSWORD=choose-a-strong-password
```

If you leave `MARGIN_ADMIN_PASSWORD` blank, Margin generates one and saves it
once to `data/admin-initial-password.txt`. Sign in, change the password from
**Account settings**, then delete that file.

The terminal prints a local address, a mobile address for the same Wi-Fi, and a
QR code. Files and history live in `data/`, which is ignored by git.

## Accounts and invitations

1. Sign in as the owner.
2. Open the account menu and choose **Manage access**.
3. Create an invitation and share the code privately. Codes work once and
   expire.
4. A member creates an account with that code, then signs in normally.

Members cannot open the owner panel, other members' jobs, or other members'
history. The owner can disable an account or reset a temporary password without
seeing that person's documents.

## Payments

Margin uses Razorpay and charges per print job, with every page priced the same.

- **₹1 per page.** The price applies to every account, including the owner.
  There is no free page and no owner exemption.
- **Configured with `MARGIN_PRICE_PER_PAGE_PAISE`** (100 paise by default).
  Razorpay's minimum INR charge is ₹1, so a one-page job costs exactly ₹1. Two
  pages cost ₹2, three pages cost ₹3, and so on.
- **Pay per job.** There is no prepaid wallet. Each paid print gets its own
  Razorpay order and Checkout is opened from the print sheet.

To enable payments:

1. Create Razorpay API keys. Test keys start with `rzp_test_`; live keys start
   with `rzp_live_`. Live mode requires an activated Razorpay account, including
   KYC and website review.
2. Put the keys in the laptop `.env`:

   ```dotenv
   RAZORPAY_KEY_ID=your_key_id
   RAZORPAY_KEY_SECRET=your_key_secret
   ```

   Use `rzp_live_...` keys for real payments. With `rzp_test_...` keys, Razorpay
   Checkout shows **Test Mode** and no real money moves.
3. Restart the backend. The deployed Vercel site uses this laptop backend, so
   the live mode appears there after the restart.
4. Keep Razorpay's payment-capture setting on **automatic**. The server also
   asks for automatic capture per order and captures an authorised payment if
   one arrives that way.

How verification works:

- The browser receives only the public Key ID, never the Key Secret.
- The server recomputes the price from the job, page range, and copies. A
  client cannot choose the amount.
- Before a print is accepted, the server verifies Razorpay's
  `HMAC_SHA256(order_id|payment_id, key_secret)` signature, fetches the order
  and payment from Razorpay, and confirms the amount, currency, and captured
  status. The same payment cannot be used twice.
- Payment records live in `data/payments.json` and contain only IDs, amounts,
  and page counts. They never contain document names or file contents.
- If a print is accepted by Windows but later fails in the spooler, the payment
  is already consumed. Refund it manually from the Razorpay dashboard.

An open unpaid order blocks another document’s checkout for 30 minutes
(`MARGIN_PAYMENT_ORDER_TTL_MINUTES`) so a member cannot hold several orders at
once. Closing Razorpay Checkout cancels that order.

### Public policy pages

Razorpay's website review needs reachable policy pages without signing in. These
are plain static files in `public/`:

- `/pricing.html` — per-page price, minimum charge, examples
- `/terms.html` — accounts, documents, fair use, printing, payments, liability
- `/privacy.html` — data collected, document handling, cookies, retention
- `/refunds.html` — cancellation, refunds, reprints, timing
- `/contact.html` — operator, email, what to include in a request

They are linked from the signed-out footer, the signed-in footer, and the help
page. The operator is shown as **Sandeep Roy, India**, with
`sandeeproy4984@gmail.com` as the contact. Keep those details, the last-updated
date, and the prices consistent across all five pages when anything changes.

Razorpay may also ask for a full postal address or a phone number during review.
Those details are intentionally not published yet; add them consistently if
the review requires them.

## Choosing the active printer

Margin detects every printer Windows reports, whether it is connected by USB or
Wi-Fi.

1. Sign in as the owner.
2. Open **Manage access** and find **Active printer**.
3. Choose **Use this printer** next to one entry.

The chosen printer is the only printer the print sheet offers, for members and
the owner alike. The full detected list stays in the owner panel. The choice is
stored by printer name in `data/printer-selection.json`, so it survives a
re-enumeration.

If the chosen printer disappears, Margin does **not** silently print on another
one. The client sees that the printer is unavailable until it is reconnected or
the owner clears the choice. Clearing the choice returns to automatic mode:
Windows default printer first, then another online printer.

Clients only see "Your printer" and friendly capabilities (paper sizes, color,
duplex). Real printer names, ports, driver names, and local paths never reach
the browser.

## Keeping Margin running: the tray app

Run it from a terminal while testing:

```powershell
npm run tray
```

Start it hidden, like a normal tray app:

```powershell
npm run tray:start
```

Stop the backend and the tray:

```powershell
npm run tray:stop
```

The tray icon lives in the Windows notification area (the hidden-icons tray).
Right-click it to open Margin, restart the backend, view the log, open the data
folder, or exit. It supervises the Node process and restarts it if it stops.
Only one tray instance can run per Windows session.

Start automatically at sign-in:

```powershell
npm run startup:install
```

That creates a shortcut in your Personal Startup folder which launches
`scripts/start-hidden.vbs`. To remove it:

```powershell
npm run startup:uninstall
```

Logs are written to `logs/margin.log` and `logs/margin-error.log`. The log is
rotated to `logs/margin.previous.log` when the backend restarts.

## Public interface on Vercel

The public site is static files in `public/`. Vercel serves them from its CDN.
API requests are proxied from Vercel to the laptop tunnel, with a secret header
added by the Vercel route. File bodies use the tunnel directly and never pass
through Vercel.

### 1. Start the laptop and a tunnel

Install `cloudflared` once:

```powershell
winget install --id Cloudflare.cloudflared
```

Start Margin on the laptop:

```powershell
npm start
```

In a second terminal, start a quick tunnel:

```powershell
npm run share
```

Look for a URL like `https://quiet-paper-1234.trycloudflare.com`. Keep both
windows open while the room is in use. A quick tunnel's address changes when it
restarts; use a named Cloudflare tunnel or Tailscale if you want a stable
address.

### 2. Fill in the laptop `.env`

```ini
MARGIN_PUBLIC_ORIGIN=https://your-margin.vercel.app
MARGIN_PUBLIC_API_URL=https://quiet-paper-1234.trycloudflare.com
MARGIN_PROXY_SECRET=a-long-random-secret
```

`MARGIN_PUBLIC_ORIGIN` must match the Vercel production URL exactly, or the
laptop will reject the request's `Origin`. `MARGIN_PUBLIC_API_URL` is used for
the direct upload URL. `MARGIN_PROXY_SECRET` must be the same value on both
sides.

Restart the backend after changing `.env`.

### 3. Deploy to Vercel

The repository is set up for a static site in `public/` plus an external API
proxy in `vercel.json`.

```powershell
npx vercel login
npx vercel link
npx vercel env add MARGIN_TUNNEL_URL production
npx vercel env add MARGIN_PROXY_SECRET production
npx vercel --prod
```

Set:

- `MARGIN_TUNNEL_URL` to the full tunnel URL, without a trailing slash.
- `MARGIN_PROXY_SECRET` to the same long secret as the laptop.

`vercel.json` matches `^/api/(.*)$`, sends it to
`${MARGIN_TUNNEL_URL}/api/$1`, and adds `x-margin-proxy:
${MARGIN_PROXY_SECRET}`. Static files are served by Vercel's filesystem
handler.

If the quick tunnel address changes, update both `MARGIN_PUBLIC_API_URL` in the
laptop `.env` and `MARGIN_TUNNEL_URL` in Vercel, then redeploy or update the
environment variable. The laptop must be awake, online, and running Margin for
API calls or printing to work.

### Same Wi-Fi instead of Vercel

You can also open the laptop's LAN address directly. In that case leave
`MARGIN_PUBLIC_ORIGIN` and `MARGIN_PUBLIC_API_URL` empty, and use the address
printed by `npm start`. The PIN and account gates still apply. Vercel is only
needed when the person printing is away from the laptop's network.

## Security model

- **No cloud document storage.** Upload bodies go directly to the laptop. Vercel
  sees only small API metadata requests.
- **Upload tokens are single-use** and expire after ten minutes. The upload
  endpoint checks the token and the account before accepting bytes.
- **Proxy secret.** When configured, every API request to the laptop must carry
  the secret header added by Vercel. Requests that hit the tunnel directly are
  rejected, except the single-use upload PUT.
- **Origin and intent checks.** State-changing requests need the app's
  `X-Margin-Intent` header and a same-origin browser request.
- **Private by user.** Jobs are looked up with both job ID and user ID. The owner
  panel exposes accounts, invitations, and printers, never another person's
  documents.
- **Sanitized errors.** Driver names, local paths, ports, and stack traces are
  logged on the laptop, not returned to the browser.
- **Automatic cleanup.** Uploaded files are removed after
  `MARGIN_FILE_TTL_HOURS` (two hours by default). History keeps only the file
  name, settings, and result.

The shared PIN is an authorization gate, not encryption. Use HTTPS (Vercel and
the tunnel provide it), keep the tunnel secret, and only invite people you
trust.

## Quotas and limits

Defaults, all configurable in `.env`:

| Setting | Default | Meaning |
| --- | ---: | --- |
| `MAX_UPLOAD_MB` | 25 | Maximum file size |
| `MARGIN_MAX_PAGES` | 300 | Maximum pages per document |
| `MARGIN_DAILY_PAGES` | 120 | Pages per member per day |
| `MARGIN_GLOBAL_DAILY_PAGES` | 400 | Pages for the whole room per day |
| `MARGIN_MAX_ACTIVE_JOBS` | 3 | Active jobs per member |
| `MARGIN_MAX_JOBS` | 6 | Active jobs across the room |
| `MARGIN_UPLOADS_PER_HOUR` | 30 | Upload preparations per member per hour |
| `MARGIN_PRINTS_PER_HOUR` | 40 | Print requests per member per hour |
| `MARGIN_FILE_TTL_HOURS` | 2 | File lifetime on the laptop |

## Tests

The test suite uses an isolated temporary data directory and a random local
port. It exercises health, sign-in, invitations, per-user isolation, PIN gating,
admin printer selection, client-side name filtering, direct upload, PDF
preparation, thumbnails, page previews, paywall pricing, payment-record persistence, Razorpay signature verification, and the Razorpay
client against a local mock. It deliberately stops before any real print, so no
paper moves.

```powershell
npm test
```

A separate physical print test exists for a consented check on the actual
printer:

```powershell
npm run test:print
```

Run that only when you are ready for paper to move.

## Troubleshooting

**The public site says the printer is unavailable.**
Check that the laptop is awake and online, Margin is running in the tray, and the
tunnel is still open. Quick tunnel addresses change; update Vercel and the
laptop `.env` if it did.

**Vercel API calls return 404.**
The laptop's `MARGIN_PROXY_SECRET` and the Vercel environment variable must be
identical. Also confirm `MARGIN_TUNNEL_URL` has no trailing slash and points at
the running tunnel.

**Signing in works on the laptop but not through Vercel.**
Set `MARGIN_PUBLIC_ORIGIN` to the exact Vercel production URL (including
`https://`). The origin guard rejects mismatched origins on state-changing
requests.

**A document will not convert.**
Install desktop Microsoft Office, or export the file as PDF and upload that.

**Nothing comes out, but the app says sent.**
The app confirms that Windows accepted the job, not that ink met paper. Open the
Windows print queue and check for a paused or stuck job, then check paper, ink,
and the USB cable.

**The printer was replaced or renamed.**
Open **Manage access → Active printer**, refresh, and choose the new queue. If
the old selection is missing, Margin intentionally refuses to fall back to a
different printer until the owner clears or replaces the choice.

## Project map

| Path | Purpose |
| --- | --- |
| `public/` | Static UI, policy pages, help page, fonts, icons |
| `public/app.js` | Browser application, PIN flow, print sheet, admin panel |
| `server/index.js` | Express API, auth routes, uploads, PIN gate, admin printer routes |
| `server/printers.js` | Printer discovery, selection store, client-safe projection |
| `server/print-service.js` | Print queue, rasterization, GDI print helper, history |
| `server/paywall.js` | Free-page rules and per-page quote calculation |
| `server/payments.js` | Payment records, idempotency, open-order tracking |
| `server/razorpay.js` | Razorpay orders, payments, capture, signature checks |
| `server/security.js` | Sessions, origin/CSRF checks, proxy secret, rate limits |
| `scripts/print-pages.ps1` | Native Windows GDI printing |
| `scripts/get-printers.ps1` | Windows printer enumeration |
| `scripts/tray.ps1` | Hidden tray app and backend supervisor |
| `scripts/test-paywall.js` | Isolated pricing, payment and Razorpay client tests |
| `scripts/test-multiuser-pin.js` | Isolated end-to-end test suite |
| `vercel.json` | Static hosting plus external API proxy to the tunnel |

## License

Private project. Not intended for public redistribution.
