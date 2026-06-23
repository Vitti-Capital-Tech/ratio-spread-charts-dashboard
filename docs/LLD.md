# Low-Level Design (LLD)

This document dives into the internal mechanics, state management, and component responsibilities of the Ratio Spread Charts Dashboard.

## 1. Directory Structure

```text
/app
  /charts/page.js         # Entry point for the charts view
  /ratio-spread/page.js   # Entry point for the scanner view
  layout.js               # Global Next.js layout
  globals.css             # Unified CSS tokens and styles
/components
  ChartsView.jsx          # Main orchestrator for charting
  RatioSpreadScanner.jsx  # Main orchestrator for the scanner engine
  ResultTable.jsx         # Presentation table for scanner results
  Navbar.jsx              # Navigation and theme toggle
  /common                 # Reusable UI primitives (CustomInput, CustomSelect)
/lib
  api.js                  # Axios/Fetch wrappers and WebSocket factory
  scannerUtils.js         # Math helpers (IV normalization, finite checks)
  useTabSync.js           # Custom React hook for BroadcastChannel integration
```

## 2. State Management Strategy

The application avoids complex global state libraries (like Redux or Zustand) in favor of localized React State (`useState`) paired with Mutable References (`useRef`) for high-frequency data.

### Why `useRef` for Tick Data?
React's rendering cycle is too slow to handle 100+ ticks per second efficiently. If every WebSocket message triggered a `useState` update, the browser would lock up.
Instead:
1. Incoming WebSocket data is written directly into a mutable `useRef` object (e.g., `tickerBufferRef`).
2. A `setTimeout` or `setInterval` runs at a fixed interval (e.g., 50ms).
3. The timer reads the `useRef` object, commits it to `useState` (e.g., `setTickerData`), and clears the buffer.
4. React renders the updated state to the DOM exactly once per interval.

## 3. Component Details

### 3.1 `RatioSpreadScanner.jsx`
- **Responsibilities:** Managing scanner configuration, maintaining WebSocket streams for all option strikes of a given expiry, evaluating ratio spread math, and rendering results.
- **Key Flow:**
  - `refreshProducts()`: Loads all available option products.
  - `startScan()`: Subscribes to the WebSocket feed for all strikes.
  - `computeSpreads()`: The core algorithmic engine. Loops through all possible pairs of options, applies configurable filters (e.g., `minStrikeDiff`, `maxNetPremium`), calculates delta-neutral ratios, and applies the $200k Short Value portfolio cap.
  - Runs on a strict 2-second throttle loop to ensure the DOM doesn't freeze.

### 3.2 `ChartsView.jsx`
- **Responsibilities:** Initializing the TradingView `lightweight-charts` instance, handling drawing tools, and synthesizing audio alerts.
- **Key Flow:**
  - `useEffect` hooks manage the lifecycle of the chart instance.
  - When the selected asset changes, it destroys the old chart and creates a new one to prevent memory leaks.
  - `updateComb()` processes incoming ticks to build composite OHLC candles for spread combinations.
  - Synthesizes audio using `window.AudioContext` when a closed candle breaches a user-defined alert price.

### 3.3 `lib/api.js`
- **Responsibilities:** Centralizing all external communication.
- **Key Flow:**
  - `apiGet()`: Wraps `fetch` and injects the `/api` proxy prefix when running in the browser to circumvent CORS.
  - `createWS()` & `createTickerStream()`: Factory functions that return an object with a `close()` method. They handle automatic reconnection logic if the WebSocket drops, and parse the raw JSON payloads into manageable callbacks for the React components.

## 4. Performance Considerations

- **Canvas Rendering:** `lightweight-charts` uses HTML5 Canvas, completely decoupling chart rendering from React's Virtual DOM tree. `ChartsView` updates the chart imperatively via `series.update()`.
- **CSS Transitions:** Micro-interactions (like row expansions in the scanner) use hardware-accelerated CSS transitions (`transform`, `opacity`) instead of React-driven animation frames.
- **Next.js SSR Hydration Guarding:** All components touching `window` or `document` (like `window.innerWidth` for responsive checks or `window.AudioContext`) are guarded with `typeof window !== 'undefined'` or wrapped in `useEffect` to ensure seamless Server-Side Rendering (SSR) without hydration mismatches.
