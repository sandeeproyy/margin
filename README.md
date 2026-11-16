# Margin

A small, privacy-first print room. Send a document from anywhere to the EPSON L3110 (or any connected USB or Wi-Fi printer) on your Windows laptop.

The public interface can live on Vercel; the laptop and physical printer stay private behind a secure tunnel. Only you (the owner/admin) decide which connected printer is exposed. Invited users can upload documents from anywhere with complete per-user privacy — no cloud storage, no cross-user visibility, and no technical leakage.

---

## Key Highlights

- **EPSON L3110 Native USB GDI Path**: Direct GDI+ rendering using true device pixels (`graphics.PageUnit = GraphicsUnit.Pixel`) and native DEVMODE capabilities.
- **Privacy-First Multi-User Architecture**: Isolated accounts, invitation control, and quotas. Other users' documents and print history remain completely private—even from administrators.
- **No Cloud Storage**: Files stream directly to the laptop through an encrypted private tunnel and are automatically pruned.
- **Hybrid Vercel + Tunnel Architecture**: Vercel serves the static frontend and proxies API routes with a shared proxy secret (`MARGIN_PROXY_SECRET`). Large document uploads bypass Vercel payload limits via single-use signed tokens directed to the tunnel.
- **Windows Background Tray App**: Margin runs silently in the Windows Notification Area (hidden icons tray) without an intrusive console window. Starts automatically on Windows boot.
- **Auto Printer Discovery & Admin Selection**: Automatically detects all connected printers (USB or Wi-Fi). The owner can choose which printer is active for client-side usage; clients only see a friendly label ("Your printer") without exposing model numbers, ports, or paths.
- **Shared Print Authorization PIN (292929)**: Requires a shared 6-digit PIN before sending jobs to the physical printer, preventing accidental or unauthorized prints from unknown clients.
- **Warm Paper Aesthetics**: Instrument Sans + Instrument Serif, warm paper palette, vermillion accents, crop marks, and registration motifs.

---

## Requirements

- **Laptop**: Windows 10 or 11 (64-bit).
- **Printer**: EPSON L3110 Series (USB001) or any USB/Wi-Fi printer installed in Windows.
- **Node.js**: 20 or newer.
- **PowerShell**: Windows PowerShell 5.1 or PowerShell 7.
- **Office Conversion (Optional)**: Desktop Microsoft Office (Word, Excel, PowerPoint) if converting `.docx`, `.xlsx`, etc.
- **Remote Access**: Cloudflare Tunnel (`cloudflared`) or Tailscale.

---

## Quick Start (Local Run)

```powershell
cd margin
npm install
npm start
```

Margin will start and print:
- Local URL: `http://localhost:3000`
- Mobile LAN URL (with QR code)
- Default admin credentials (initial password generated in `data/admin-initial-password.txt` if not set in `.env`)

---

## Windows Background Tray App

To run Margin silently in the Windows taskbar hidden icons tray:

```powershell
# Launch the background tray app without a console window
npm run tray:start

# Or run tray directly with logs in console
npm run tray

# Stop running Margin processes
npm run tray:stop
```

### Run on Windows Startup (Hidden Icons Tray)

To have Margin start automatically in the background whenever you log into Windows:

```powershell
npm run startup:install
```

This creates a Windows shortcut in your `Startup` folder pointing to `scripts/start-hidden.vbs`. Margin will silently live in your notification area tray.
To remove it from startup:

```powershell
npm run startup:uninstall
```

### Tray Features
- Right-click the Margin icon in the system tray to:
  - **Open Margin in Browser**
  - **Restart Backend**
  - **View Logs** (`logs/margin.log`)
  - **Exit Margin**
- Double-click the tray icon to immediately open `http://localhost:3000`.

---

## Printer Management (Admin vs. Client)

1. **Printer Detection**: Margin scans Windows print queues (`get-printers.ps1`) detecting both USB and network (Wi-Fi) printers.
2. **Owner Selection**: Sign in as administrator and open **Account → Manage access → Active printer**. The owner sees all connected physical printers with their actual names (e.g., `EPSON L3110 Series`, `USB001`).
3. **Client-Side Obfuscation**: Client users never see real printer names, IP addresses, or ports. They only see:
   - `Your printer`
   - Real-time online/offline/busy status
   - Available paper sizes and duplex/color options supported by the chosen printer.

---

## Print Authorization PIN Gate (292929)

To ensure no unauthorized or accidental prints occur:
- Clients sign in with their email and password.
- When clicking **Print**, clients are prompted to enter the shared print PIN (`292929`).
- The PIN is verified server-side with sliding window rate limiting.
- Once verified, the user's session is unlocked for printing for 30 minutes (configurable via `MARGIN_PIN_UNLOCK_MINUTES`).

---

## Public Deployment (Vercel + Tunnel)

```text
[ Client Browser / Phone ]
       │
       ├─── 1. Static UI & proxied API ───> [ Vercel Edge ] (vercel.json)
       │                                           │  (x-margin-proxy header)
       │                                           ▼
       └─── 2. Direct File Upload (PUT) ──> [ Private Tunnel ] (Cloudflare / Tailscale)
                                                   │
                                                   ▼
                                        [ Laptop (Port 3000) ]
                                                   │
                                        [ EPSON L3110 Printer ]
```

### 1. Set up Tunnel on Laptop
Run Cloudflare Tunnel:
```powershell
cloudflared tunnel --url http://localhost:3000
```
Or use the included helper:
```powershell
npm run share
```
Note the assigned URL (e.g. `https://quiet-paper-1234.trycloudflare.com`).

### 2. Configure Laptop `.env`
```ini
MARGIN_PUBLIC_ORIGIN=https://your-margin-app.vercel.app
MARGIN_PUBLIC_API_URL=https://quiet-paper-1234.trycloudflare.com
MARGIN_PROXY_SECRET=choose-a-strong-secret-token
MARGIN_ADMIN_EMAIL=owner@margin.local
MARGIN_ADMIN_PASSWORD=your-secure-admin-password
MARGIN_PRINT_PIN=292929
```

### 3. Deploy to Vercel
Deploy the workspace to Vercel and configure the environment variables in the Vercel project settings:
- `MARGIN_TUNNEL_URL`: `https://quiet-paper-1234.trycloudflare.com`
- `MARGIN_PROXY_SECRET`: `choose-a-strong-secret-token`

`vercel.json` will automatically proxy all `/api/*` calls to your laptop tunnel with the authenticated proxy header, while static assets are served instantly from Vercel's global CDN.

---

## Security & Isolation

- **Zero Cloud Storage**: All documents are prepared, converted, and printed directly on the laptop. Files are purged from the laptop after 2 hours.
- **Admin Isolation**: The administrator manages user accounts and printer selection. The administrator cannot view or download other users' documents or history.
- **Direct Upload Protection**: File bodies stream directly to `/api/uploads/:id` on the laptop using single-use, cryptographically generated tokens (`x-upload-token`).
- **Proxy Secret & Origin Protection**: All incoming API requests from the public internet must pass proxy authentication and strict CORS origin validation.
- **No Technical Error Leaks**: Stack traces, driver faults, local file paths, and internal network addresses are completely sanitized before reaching clients.

---

## Scripts Reference

| Script | Purpose |
| --- | --- |
| `npm start` | Start Node server in current console |
| `npm run dev` | Start Node server with file watching |
| `npm run tray` | Run the Windows tray application |
| `npm run tray:start` | Run the Windows tray application completely hidden |
| `npm run tray:stop` | Stop all Margin processes |
| `npm run startup:install` | Add Margin to Windows Startup (background tray) |
| `npm run startup:uninstall` | Remove Margin from Windows Startup |
| `npm run share` | Open temporary Cloudflare Tunnel |
| `npm run test:print` | Print test page (requires user confirmation) |

---

## Design System

- **Typography**: Instrument Sans & Instrument Serif
- **Palette**: Warm Paper (`#f1ede3`, `#faf7ef`, `#e6e0d2`), Ink (`#171810`), Vermillion (`#ef542f`)
- **Motifs**: Print marks, crop marks, registration crosses, sheet dialogs.
