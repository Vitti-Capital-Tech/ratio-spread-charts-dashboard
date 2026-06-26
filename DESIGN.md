# Vitti Crypto Scanner — Design Brief

A handoff document for redesigning the UI of a real-time crypto options trading dashboard.
The goal is to elevate the visual design and UX while preserving the existing
"professional trading terminal" identity and all current functionality.

---

## 1. Product Overview

**What it is:** A real-time dashboard for crypto options traders. Two primary workspaces:

1. **Charts** — candlestick charts for option spreads (BTC/ETH), with IV overlays, SMA, drawing tools, live WebSocket price updates, watchlist, and price alerts.
2. **Ratio Spread Scanner** — an algorithmic engine that scans live option chains and surfaces optimal ratio-spread setups (call & put) ranked by edge, with configurable filters.

**Who uses it:** Professional / semi-professional options traders. Power users who value information density, speed, and at-a-glance scannability over hand-holding. Used on large desktop monitors primarily, with mobile as a secondary surface.

**Authentication:** Email + 6-digit OTP (passwordless) flow.

---

## 2. Tech Stack & Constraints

| Area | Detail |
|------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | **Tailwind CSS 4** + a large hand-written `app/globals.css` (~5000 lines) driven by CSS custom properties |
| Charts | `lightweight-charts` v5 (canvas-based, styled via JS) |
| Icons | `lucide-react` |
| Fonts | `Inter` (UI), `JetBrains Mono` / monospace (numeric trading data) |
| Forms | `react-hook-form` |
| Auth | `better-auth` with email OTP |

**Hard constraints for any redesign:**
- **Keep the dark trading-terminal aesthetic.** Navy/charcoal backgrounds, gold accent. This is a deliberate brand choice, not a default.
- **Theming must stay token-driven.** Both dark (default) and light themes are supported via CSS variables on `:root` / `body.light-theme`. Do not hardcode colors — use the existing custom properties.
- **Preserve information density.** This is a pro tool; don't trade data-per-screen for whitespace. Compactness is a feature.
- **Numeric data uses tabular/monospace figures** so columns align. Keep this.
- **Must stay responsive** down to mobile (existing breakpoints at 900px and 768px; mobile bottom-nav and per-table tab switching exist).
- All interactive controls should be keyboard-accessible with a visible focus state.

---

## 3. Current Design System (tokens)

These CSS variables already exist in [app/globals.css](app/globals.css). Treat them as the source of truth; a redesign may *refine* the palette but should keep the token names.

### Dark theme (default)
```
--bg:        #0d0e12   /* app background (darkest navy) */
--bg2:       #14151a   /* panels, navbar, cards */
--bg3:       #1e212b   /* inputs, raised surfaces */
--border:    #2b2f36   /* hairline borders */
--text:      #eaecef   /* primary text */
--text-dim:  #848e9c   /* secondary / labels */
--accent:    #f0b90b   /* gold — primary accent, active states, CTAs */
--accent2:   #1a8c6a   /* teal — secondary */
--call:      #0ecb81   /* green — long / call / positive P&L */
--put:       #f6465d   /* red — short / put / negative P&L */
--comb:      #f0b90b   /* gold — combined leg */
--danger:    #f6465d   /* red — errors, destructive */
```

### Light theme
```
--bg: #f5f5f5  --bg2: #ffffff  --bg3: #eeeeee  --border: #e0e0e0
--text: #1e2329  --text-dim: #707a8a
(accent / call / put / danger unchanged)
```

### Typography
- Base font size: **13px** (the app is intentionally small/dense).
- UI font: `Inter` (400–800 weights).
- Numeric/trading data: monospace, `font-variant-numeric: tabular-nums`.
- Labels: 10px, uppercase, `letter-spacing: 0.5px`, `--text-dim`.

### Semantic color language (important — keep consistent everywhere)
- **Gold** = accent / active / "winner" highlight / brand. NOT a buy signal.
- **Green (`--call`)** = long leg, call side, positive P&L.
- **Red (`--put`/`--danger`)** = short leg, put side, negative P&L, errors.

### Existing motion vocabulary
`grid-drift` (login bg), `ws-sonar` (status dot ping), `pulse-glow` (scanner active), `btn-shimmer` (loading sweep), dropdown `slideDropdownDown`. A redesign should add a `prefers-reduced-motion` path if introducing new motion.

---

## 4. Screen / Component Inventory & Redesign Goals

For each area below: **(A)** what it is today, **(B)** the design problems to solve. Functional behavior must not change.

### 4.1 Login (email step) — `components/CustomSignIn.jsx`
**Today:** Glassmorphism card centered on an animated gold grid background. Brand header ("VITTI CRYPTO SCANNER" + "SYSTEM ONLINE" status dot), title, subtitle, single email input with a mail icon, gold CTA button. Monospace legal disclaimer at the bottom.

**Improve:**
- Make the card feel more like a premium trading-terminal "gateway" and less like a generic SaaS login, while keeping it clean.
- The email input focus state is weaker than the OTP boxes — unify the focus treatment (gold ring).
- Error message currently pushes content down (layout shift). Reserve space for it.
- Strengthen the visual hierarchy: brand → title → form → disclaimer.
- Consider a subtle data-viz / candlestick motif in the background instead of (or layered with) the plain grid — but keep it tasteful and low-contrast.

### 4.2 OTP verification step — `components/CustomSignIn.jsx`
**Today:** 6 separate digit boxes (48×56px), auto-advance, paste support, backspace navigation. Green glow when all 6 filled. "Resend in 60s" countdown text + "Change Email" link. Verify button.

**Improve:**
- Make the 6-box group feel like a cohesive, polished unit (consider connected/segmented styling).
- Replace the plain "Resend in 60s" text with a more refined countdown affordance (e.g., a small circular progress ring around the resend control).
- Clear "filled / valid / error" visual states for the box group.
- Consider auto-submitting once all 6 digits are entered (reduce a click) — note this in the design so it's intentional.

### 4.3 Navbar — `components/Navbar.jsx`
**Today:** Left: logo (icon + "VITTI CRYPTO SCANNER"). Center: two tabs (Charts / Ratio Spread) with gold underline on active. Right: theme toggle, session email, Sign Out button, and a WebSocket status badge (Disconnected / Live Feed / Scanning · N tickers) with an animated dot. 48px tall. Mobile: bottom tab bar.

**Improve:**
- The logo wordmark is long; explore a more compact lockup (icon + "VITTI" with a "SCANNER" sub-label) to free horizontal space.
- Active tab: the gold underline is subtle — strengthen the active/hover affordance (e.g., faint gold background tint + underline).
- Long session emails can overflow on narrow widths — truncate with ellipsis + tooltip.
- Sign-out confirmation is a full-screen modal — feels heavy for a one-click action. Consider a lightweight inline popover anchored to the button.
- The WS status badge is the single most important "is my data live?" signal — make sure its three states (offline / live / error) are instantly distinguishable. On mobile it currently hides behind the bottom nav; give it a reliable home.

### 4.4 Charts workspace — `components/ChartsView.jsx`
**Today:** A configuration panel (underlying, a 12-button timeframe grid 1m→1w, price type, leg type combined/call/put, call/put strike selectors, "Add to Watchlist"), a watchlist list with alerts, and one or more candlestick chart panels with a toolbar (scroll/zoom/fit/draw/undo/clear), crosshair OHLC+IV legend, SMA & IV overlays, and price-alert lines.

**Improve:**
- The config panel is a flat horizontal row of many controls — **group** them visually ("Instrument" · "View" · "Legs") with dividers and small section labels so the eye can parse it.
- The 12-button timeframe grid is bulky — consider a compact segmented control that scrolls on mobile.
- Chart toolbar buttons are icon-only with no labels — add tooltips and a clear active/selected state (esp. for the "draw" mode toggle).
- Watchlist rows should carry a leg-type color cue (gold=combined / green=call / red=put) so an entry's type reads at a glance.
- Keep the chart canvas itself uncluttered; the crosshair legend should be legible over both up and down candles.
- Define empty/loading states (skeletons in the navy palette) for when chart data is streaming in.

### 4.5 Ratio Spread Scanner — `components/RatioSpreadScanner.jsx`
**Today:** A top **config bar** containing: title "RATIO SPREAD ENGINE", Underlying select, Expiry select, a "SHOW/HIDE FILTERS" toggle, then a **filters block** (8 controls: Min Wing Width, Min IV Skew Edge, Max Delta Skew, Min Short Leg Premium, Max Net Debit, Min SPOT Distance, Max Short Ratio, plus a "Dynamic ATM Ratio Scaling" checkbox that reveals 2 more % inputs), and a START/STOP SCAN button. Below: two side-by-side result tables (Call Spreads / Put Spreads) — see 4.6. Mobile shows a Call/Put tab switcher.

**Improve (this is the user's main focus — desktop especially):**
- **The filter row is the weakest area.** On desktop the 8 filters are a long wrapping row of tiny `label: [input]` pairs that wrap awkwardly and read as undifferentiated clutter. Redesign this into a clean, scannable control surface:
  - Consider a structured **filter bar / filter chips / grouped control groups** with clear labels, consistent input sizing, and units shown inline (`$`, `%`, `1:X`).
  - Group related filters (e.g., "Structure": wing width, spot distance, max ratio · "Edge": IV skew, delta skew, premiums).
  - Surface the 2–3 highest-value filters inline and keep the rest in an expandable "advanced" area — but make the expand/collapse feel intentional on desktop, not just a mobile afterthought.
  - The "Dynamic ATM Ratio Scaling" checkbox + its conditional inputs need a clearer visual grouping (it's a mode toggle that changes the math).
  - Give the config bar a clear left-to-right flow: **Instrument (underlying/expiry) → Filters → Scan action**, with the START/STOP button as the obvious primary action.
- Make the START SCAN / STOP SCAN states unmistakable (green-to-go / red-stop already exist — refine).
- Provide a richer "scanning" status (ticker count, last-updated time, scan freshness) near the results, not just a small navbar badge.

### 4.6 Result tables — `components/ResultTable.jsx`
**Today:** A dense table per side. Columns: Spread Strikes (buy/sell + Δ width), Premium L/S (with IV%), Ratio L/S, Net Premium · IV Edge, Delta L/S (desktop only), and a gold-tinted "ATM" cluster (ATM Fair Value, ATM Edge/P&L with ROI%, Margin Req.). Rows group by buy-strike; the best row per group is highlighted (gold left-border + tint) and expandable to reveal sub-rows. Has a per-table header with a live pulse dot, match count, spot price, last-updated, and a refresh button. Empty and scanning states exist.

**Improve:**
- It's information-dense by necessity — the goal is **legibility within density**, not less data.
- Strengthen the column-group structure: the "ATM" cluster is already gold-tinted; make the visual separation between the core spread columns and the derived ATM/margin columns clearer (group headers / subtle vertical rules).
- The "best of group" highlight and the expandable sub-rows need clear affordances (what's clickable, what's expanded).
- Positive/negative numbers should pop via the green/red semantic colors consistently.
- Keep row height tight; ensure the two side-by-side tables scroll independently and don't leave dead space when one side has fewer matches.
- Define a polished empty state ("NO SETUPS FOUND") and the scanning/loading state.

### 4.7 Form controls — `components/common/CustomSelect.jsx` & `components/common/CustomInput.jsx`
These are the shared building blocks used across the scanner config and charts config, so improving them lifts the whole app.

**CustomSelect (today):** A button trigger (`--bg3` bg, border, 13px/600, chevron) that opens an absolutely-positioned menu (`--bg2`, max-height 250px, scroll) of items with hover (`--bg3` + gold text) and a gold checkmark on the selected item. Has a `default` and a borderless `inline` variant. Closes on outside click.

**CustomInput (today):** A simple `forwardRef` text/number input — `--bg3` bg, border, 13px, gold focus ring, red error state. Used at tiny widths (50–70px) for numeric filter values.

**Improve:**
- Give both controls a single, cohesive visual language so a select and an input sitting next to each other in the filter bar look like siblings (matching height, radius, border, focus ring, padding).
- Numeric `CustomInput`s in the scanner are very narrow and unlabeled-by-unit — design a variant that shows the unit (`$`, `%`, `1:`) as an inline prefix/suffix adornment, and consider stepper affordances for number inputs.
- Define consistent **states** for both: default, hover, focus (gold ring already), disabled, error. Make focus keyboard-visible.
- The select menu could use light grouping/section support for when option lists grow.
- Ensure both work and look correct in the light theme.

---

## 5. Design Principles (the bar to hit)

1. **Bloomberg-terminal polish, not consumer-app cute.** Dense, precise, confident. Gold-on-navy. Restraint with color — color carries meaning (long/short, +/− P&L), so decorative color use should be minimal.
2. **Scannability first.** A trader should locate the live-feed status, the top-ranked spread, and the key numbers in well under a second.
3. **Consistency across surfaces.** One button language, one input language, one set of state colors, used identically in login, navbar, charts, and scanner.
4. **Density with breathing room.** Tighten alignment and rhythm rather than adding whitespace. Use hairline rules and subtle background tints to create groups instead of large gaps.
5. **Token-driven & themeable.** Everything resolves to the CSS variables; both themes must look intentional.
6. **Motion is functional.** Live-data pulses, loading shimmers, state transitions — never decorative-only. Respect `prefers-reduced-motion`.
7. **Accessible.** Visible keyboard focus, sufficient contrast (especially `--text-dim` on `--bg2`), tooltips on icon-only controls.

---

## 6. Priority Order (suggested)

1. **Scanner filter bar + CustomSelect/CustomInput** (user's primary ask — biggest desktop UX win).
2. **Result table legibility** (the core value of the product).
3. **Navbar** (status badge clarity + compact logo + inline sign-out).
4. **Login + OTP** (first impression).
5. **Charts config grouping + toolbar tooltips**.
6. **Cross-cutting**: loading skeletons, focus-visible, reduced-motion.

---

## 7. Deliverables Requested from Design

- Refined color/typography token set (dark + light) that stays compatible with the existing variable names.
- A reusable control kit: button, select, input (with unit adornment + numeric stepper), checkbox/toggle, filter-group container, chip — with all states.
- Redesigned **scanner config + filter bar** (desktop-first, with the responsive/collapsed behavior defined).
- Redesigned **result table** styling (column groups, best-row, expand affordance, +/− P&L treatment, empty/loading states).
- Navbar, login, and OTP visual refresh.
- Notes on motion and accessibility for each.

---

## 8. Key Files (for reference)

| Area | File |
|------|------|
| Global styles & tokens | [app/globals.css](app/globals.css) |
| Login + OTP | [components/CustomSignIn.jsx](components/CustomSignIn.jsx) |
| Navbar (+ mobile nav) | [components/Navbar.jsx](components/Navbar.jsx) |
| Charts workspace | [components/ChartsView.jsx](components/ChartsView.jsx) |
| Scanner (config + filters) | [components/RatioSpreadScanner.jsx](components/RatioSpreadScanner.jsx) |
| Result tables | [components/ResultTable.jsx](components/ResultTable.jsx) |
| Shared select | [components/common/CustomSelect.jsx](components/common/CustomSelect.jsx) |
| Shared input | [components/common/CustomInput.jsx](components/common/CustomInput.jsx) |
| App shell / tabs / theme | [components/Workspace.jsx](components/Workspace.jsx) |
