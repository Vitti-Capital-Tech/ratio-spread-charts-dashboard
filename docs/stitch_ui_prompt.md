# Vitti Crypto Scanner — UI/UX Improvement Brief for Stitch

## Project Overview

**Vitti Crypto Scanner** is a professional-grade, real-time cryptocurrency options trading dashboard built with **Next.js (App Router)** and **Vanilla CSS**. It is used by active options traders to discover delta-neutral ratio spread opportunities on **Delta Exchange** (BTC/ETH). The application is data-dense, precision-focused, and used in a live trading context — so clarity, speed of visual processing, and zero layout noise are paramount.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router, `app/` directory)
- **Styling**: Vanilla CSS (`app/globals.css`) — **NO Tailwind**, **NO CSS modules**
- **Charting**: TradingView Lightweight Charts
- **Font**: Inter (Google Fonts, already imported)
- **Icons**: Lucide React
- **Auth**: Better Auth (email OTP / 2FA)

---

## Current Design System (CSS Custom Properties)

### Dark Theme (default)
```css
--bg: #0d0e12         /* Page background */
--bg2: #14151a        /* Navbar, card backgrounds */
--bg3: #1e212b        /* Table headers, subtle fills */
--border: #2b2f36     /* All borders */
--text: #eaecef       /* Primary text */
--text-dim: #848e9c   /* Secondary / muted text */
--accent: #f0b90b     /* Primary accent — Binance-style gold/yellow */
--accent2: #1a8c6a    /* Secondary accent (teal-green) */
--call: #0ecb81       /* Call/buy/profit colour (green) */
--put: #f6465d        /* Put/sell/loss colour (red) */
--comb: #f0b90b       /* Combined / neutral */
--danger: #f6465d     /* Error / danger states */
```

### Light Theme (`.light-theme` class on `body`)
```css
--bg: #f5f5f5
--bg2: #ffffff
--bg3: #eeeeee
--border: #e0e0e0
--text: #1e2329
--text-dim: #707a8a
/* accent/call/put remain the same */
```

---

## Application Structure & Pages

The app has **3 main views**, all rendered within a single `Workspace.jsx` component (SPA-style, no full navigation between pages):

### 1. Sign-In Page (`/sign-in`)
Component: `components/CustomSignIn.jsx`

A two-step email OTP authentication flow:
- **Step 1**: Trader enters their email address → triggers a 6-digit OTP email
- **Step 2**: Trader enters the 6-digit OTP in individual split input boxes
- Features: 60-second resend countdown, "Change Email" link, paste support for OTP

**Brand identity on this page**:
- Logo: `<CandlestickChart>` icon + "VITTI CRYPTO **SCANNER**" text (accent + dim)
- Status indicator: "GATEWAY ONLINE" with animated pulsing green dot
- Disclaimer footer: terminal-style confidentiality notice

**Key CSS classes to style**:
- `.trader-signin-container` — full-page flex container
- `.trader-card` — the auth card (currently centered)
- `.brand-header`, `.brand-logo-wrap`, `.brand-logo-text` — brand area
- `.gateway-status`, `.status-dot` — online status badge
- `.trader-title`, `.trader-subtitle` — heading + subtext
- `.trader-error` — inline error message
- `.trader-label` — form field label
- `.trader-input-container`, `.trader-input`, `.trader-input-icon` — email input
- `.otp-splits-wrapper`, `.otp-split-input` — 6 individual OTP boxes
- `.btn-trade` — primary CTA button
- `.trade-loader` — spinner inside button
- `.resend-text`, `.resend-btn` — OTP resend controls
- `.terminal-disclaimer` — bottom disclaimer text
- `.field-error-text` — field-level validation error
- `.input-error` — error state on inputs

---

### 2. Charts View (`/charts`)
Component: `components/ChartsView.jsx`

An interactive options charting dashboard. Users select an underlying (BTC/ETH), an expiry, and one or more option strikes to plot live premium candles. Key features:
- Sidebar with asset/expiry/strike selector, timeframe buttons, SMA/IV toggles
- Main chart area (TradingView Lightweight Charts) with Call, Put, or Combined (straddle/strangle) OHLC candles
- Price alerts, S/R drawing tools on chart
- Live WebSocket price feed badge in navbar

**Key layout structure**:
- `.app` → `.body` (flex row) → `.sidebar` | `.main`
- `.sidebar` contains `.card` sections with filters/selectors
- `.main` contains `.chart-header` (toolbar) + `.chart-wrap` (chart container)
- `.tf-grid`, `.tf-btn` — timeframe selector grid
- `.toggle-btn` — active class variants: `.active.call`, `.active.put`, `.active.comb`
- `.stat-row`, `.stat-label`, `.stat-val` — statistics display rows
- `.chart-header`, `.sym-label` — chart toolbar
- `.overlay`, `.overlay-title`, `.overlay-sub` — loading/placeholder overlay

---

### 3. Ratio Spread Scanner (`/ratio-spread`)
Component: `components/RatioSpreadScanner.jsx` + `components/ResultTable.jsx`

The flagship feature. A live scanner that discovers delta-neutral ratio spread opportunities by subscribing to WebSocket tick data from Delta Exchange.

**Layout**:
- **Top config bar** (`.scanner-config-bar`): Underlying selector (BTC/ETH), expiry selector, collapsible filters, START/STOP button
- **Results area**: Two side-by-side tables — Call Spreads and Put Spreads
- On mobile: tab switcher (`.scanner-mobile-tabs`) to switch between call/put tables

**Filters Panel** (collapsible):
- Min Spread Width ($), Min IV Edge (%), Max Delta Deviation, Min Short Premium ($), Max Net Debit ($), Min Spot Distance ($), Max Short Ratio (1:X), Dynamic ATM Scaling toggle (+ scaling % inputs when enabled)

**Results Table** (`ResultTable.jsx`):
Each row represents a grouped set of ratio spread opportunities sharing the same buy strike. Columns:
1. **Spread Strikes** — Buy / Sell strike pair, ∆ (strike difference)
2. **Premium (L/S)** — Buy leg ask price (green) + sell leg bid price (red) with IV %
3. **Ratio (L/S)** — Lot size ratio, with ATM scaling indicator
4. **Net Premium & IV Edge** — Net credit/debit + IV edge %
5. **Delta (L/S)** — Delta notional values (hidden on mobile)
6. **ATM Pricing** — Buy/sell leg prices if spot moves to the buy strike
7. **ATM Edge (P&L)** — Projected P&L + ROI% at the ATM boundary
8. **Req. Margin** — Required margin to enter the position

Rows are grouped by buy strike. The best row (by ROI) is shown first; clicking expands sub-rows for alternative sell strikes.

**Key CSS classes**:
- `.scanner-config-bar`, `.scanner-config-main`, `.scanner-config-title`, `.scanner-filters-container`, `.scanner-filters-toggle-btn` — config/filter bar
- `.scanner-body`, `.scanner-main` — layout wrappers
- `.scanner-mobile-tabs`, `.scanner-mobile-tab` — mobile tab switcher
- `.scanner-table-wrap`, `.scanner-table-header`, `.scanner-table-title`, `.scanner-table-body` — table container
- `.scanner-table`, `.scanner-table thead`, `.scanner-table th`, `.scanner-table td` — table elements
- `.scanner-row-best` — highlighted best row (border-left: 3px accent)
- `.scanner-row-sub` — sub-row (expanded alternatives)
- `.scanner-row-group` — parent row with expandable sub-rows
- `.scanner-group-toggle` — expand/collapse chevron
- `.scanner-pulse` — pulsing live-feed dot (`data-active="true"`)
- `.scanner-match-badge` — "X matches" green badge
- `.scanner-empty`, `.scanner-empty-icon`, `.scanner-empty-title`, `.scanner-empty-desc` — empty state
- `.scanner-buy` — green text (buy/call colour)
- `.scanner-sell` — red text (sell/put colour)
- `.scanner-highlight` — gold text (combined/accent colour)
- `.btn-start` / `.btn-stop` — START SCAN / STOP SCAN button

---

### 4. Shared Navbar
Component: `components/Navbar.jsx`

Present on all authenticated pages. Contains:
- Left: Logo (CandlestickChart icon + "VITTI CRYPTO SCANNER")
- Center: Navigation tabs — "Charts" and "Ratio Spread" (with Lucide icons)
- Right: Extra header content (live ticker count or last price), theme toggle (Sun/Moon), user email + Sign Out button, WebSocket connection badge

**CSS classes**:
- `.navbar` — 48px tall top bar
- `.logo`, `.logo-text` — brand identity
- `.nav-tabs-container`, `.nav-tab`, `.nav-tab.active`, `.nav-tab-icon`, `.nav-tab-text`
- `.nav-actions-container`
- `.ws-badge`, `.ws-dot`, `.ws-dot.live`, `.ws-dot.stale`, `.ws-dot.offline`

---

## Custom Form Components

### `CustomSelect` (`components/common/CustomSelect.jsx`)
A fully custom-styled dropdown (not native `<select>`). Uses a button trigger + absolute-positioned option list. CSS classes:
- `.custom-select-trigger`, `.custom-select-dropdown`, `.custom-select-option`, `.custom-select-option.active`

### `CustomInput` (`components/common/CustomInput.jsx`)
A thin wrapper around `<input>` for consistent scanner filter inputs.

---

## Current UX Pain Points to Address

The following are specific areas where the UI/UX needs improvement. These should guide your redesign priorities:

### 1. Sign-In Page
- The card feels flat and generic. It should feel like a professional, secure trading terminal gateway — dark, precise, with a sense of authority and security.
- The OTP input boxes lack visual polish — they should feel like premium digital input displays.
- The "GATEWAY ONLINE" badge needs more visual presence.
- The submit button (`.btn-trade`) needs a loading state with better visual feedback.
- Consider subtle animated background (e.g., slow-moving grid or chart lines) to reinforce the trading platform identity.
- The terminal disclaimer at the bottom should feel genuinely "terminal-like" — monospace font, dim, scan-line style.

### 2. Navbar
- The navbar is functional but plain. It should feel premium and purposeful.
- The nav tabs lack visual clarity when active vs inactive — the distinction should be more obvious without being garish.
- The WebSocket badge label (e.g., "Scanning · 87 tickers") should be more prominent / better styled — this is critical operational information for traders.
- The logo deserves more visual weight — it is a brand identifier.
- User email shown in plain text feels informal; it could be wrapped in a subtle user-profile chip.

### 3. Scanner Config Bar
- The filter inputs are dense and hard to scan quickly. Labels need better visual hierarchy.
- The "SHOW FILTERS / HIDE FILTERS" toggle looks like a plain text button — it should be clearly interactive.
- The START/STOP SCAN button needs more urgency and state clarity:
  - **START SCAN** → should have a green glow / play feel
  - **STOP SCAN** → should have a red/danger feel with a square stop icon
- The config bar stacks awkwardly on narrow viewports — needs better responsive behaviour.

### 4. Results Tables
- Table headers are too small (8.5px) and hard to read at a glance.
- The "best row" highlight (`.scanner-row-best`) is subtle — it needs more visual pop to draw the trader's eye.
- The ATM Pricing and ATM Edge columns (highlighted in green tint) don't stand out enough from the rest of the table.
- The empty state (`.scanner-empty`) is too minimal — it should guide the user toward action.
- The expand/collapse chevron for grouped rows is too small — should be easier to tap on mobile.
- The match badge should animate in when results appear.

### 5. Charts Sidebar
- The sidebar feels like a generic form — it needs to read more like a trading instrument control panel.
- Card sections (`.card`) could benefit from subtle top-border accent lines by type (call = green, put = red, combined = gold).
- Timeframe buttons (`.tf-grid`) need more padding and clearer active/hover states.

### 6. Global / Micro-interactions
- Buttons lack micro-animation on click (scale/ripple).
- Loading states are sparse — when scanning starts, there is no animated "boot sequence" feel.
- Transitions between states (scanning → idle, expanded → collapsed) could be smoother.
- On dark theme, backgrounds are very flat — subtle radial gradients or noise textures on card surfaces would add depth.

---

## Design Principles to Follow

1. **Trading Terminal Aesthetic**: Think Bloomberg Terminal meets modern crypto exchange (Binance/Bybit). Dark, precise, data-dense. No playful or consumer-app aesthetics.
2. **Colour Semantics are Sacred**: Green (`--call`) = buy/profit. Red (`--put`) = sell/loss. Gold (`--accent`) = accent/highlight. Do not re-purpose these colours.
3. **Monospace for Numbers**: All financial figures, strikes, and quantities should use monospace/tabular-nums for alignment.
4. **No Layout Breaks**: The layout is intentionally `overflow: hidden` at root level — the app must not ever cause a page scroll. Everything scrolls within its own container.
5. **Performance**: Avoid CSS that would cause repaint/reflow on the scanner table rows, which update every 2 seconds with live data. Prefer `transform` and `opacity` for animations over layout-affecting properties.
6. **Responsive**: The app must work on both desktop (primary) and mobile. The navbar switches to a bottom tab bar on mobile (`.mobile-bottom-nav`). The scanner switches to tab-based layout on mobile.

---

## Specific Design Requests

### Sign-In Card
- Replace plain card background with a glassmorphism card: `backdrop-filter: blur(20px)` over a very dark base, with a subtle inner border glow using `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08)`.
- Add an animated gradient background (slow-moving) behind the card — e.g., a deep space gradient with subtle movement.
- Make the 6 OTP boxes larger, with a visible border flash on focus and a soft green glow when all 6 are filled.
- Make the `.btn-trade` button display a progress shimmer animation while loading.
- Make `.gateway-status` use an animated pulse ring (not just a dot) — like a sonar ping.

### Navbar
- Give the navbar a subtle `border-bottom` glow in the accent colour: `box-shadow: 0 1px 0 rgba(240, 185, 11, 0.15)`.
- Add a visible active indicator to nav tabs — a 2px bottom border in `--accent` below the active tab label.
- Make the WS badge use a pill-shaped chip with the dot inside: `background: rgba(14, 203, 129, 0.08)`, rounded pill, with the status dot pulsing inside.
- Logo should have a subtle `text-shadow: 0 0 20px rgba(240, 185, 11, 0.3)` glow.

### Scanner Config Bar
- Visually separate the main config (underlying/expiry) from the filter section with a distinct visual divider.
- Filter labels should be ALL CAPS, 9px, letter-spacing: 1.5px — they look like instrument labels on a control panel.
- Filter inputs should have visible focus rings in `--accent` with a subtle glow.
- The START SCAN button:
  - **Idle state**: Solid `--accent` (#f0b90b), bold, full-width in its cell, with ▶ icon
  - **Active (scanning)**: Background changes to `rgba(246, 70, 93, 0.15)`, border: 1px solid `#f6465d`, text color: `#f6465d`, with ■ icon and a subtle pulse animation on the border

### Results Table
- Increase `th` font-size to 10px minimum.
- `.scanner-row-best` should have a more prominent left border: `border-left: 3px solid var(--accent)` + `background: rgba(240, 185, 11, 0.06)` (use gold for the best row, not green — it's a ranked winner, not a buy signal).
- ATM column group headers: Add a thin top border line across those 3 columns in `--accent` colour to visually "band" them together.
- Add `transition: background 0.3s ease` on table rows for smooth hover.
- Empty state: Add an animated radar/scan circle SVG to the empty state container.

### Overall Micro-interactions
- Buttons: Add `transform: scale(0.97)` on `:active` for click feedback.
- Collapsed filters: Use `max-height` + `overflow: hidden` + `transition: max-height 0.3s ease` for smooth accordion animation.
- The scanner match badge (`.scanner-match-badge`) should appear with a `scale(0) → scale(1)` + `opacity(0) → opacity(1)` animation when results first appear.

---

## Files to Edit

All styling changes should go in `app/globals.css`.

Component structure changes (if needed) should be made to:
- `components/CustomSignIn.jsx`
- `components/Navbar.jsx`
- `components/RatioSpreadScanner.jsx`
- `components/ResultTable.jsx`
- `components/ChartsView.jsx`
- `components/common/CustomSelect.jsx`

**Do not modify**: `lib/`, `app/api/`, `next.config.mjs`, `package.json`, or any server-side logic files.

---

## Important Constraints

- The app already works and is in production use. **Do not change any logic, state management, API calls, or data processing code.**
- All visual changes must be **backwards-compatible** with both dark and light theme.
- Every financial number must remain on a single line (no wrapping) — use `white-space: nowrap` and `font-variant-numeric: tabular-nums` wherever displaying numeric data.
- The table layout is critical — do not add padding/sizing changes that would break the 8-column scanner table layout on desktop.
- The sign-in page must remain fully accessible: all inputs must have labels, focus states must be visible.
