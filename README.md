# Ratio Spread Charts Dashboard

A high-performance, real-time cryptocurrency options trading dashboard built with Next.js. It features an advanced Ratio Spread Scanner for discovering delta-neutral trading opportunities and a comprehensive Interactive Options Charting tool for tracking combined premium strategies.

## Key Features

* **Ratio Spread Scanner:** Continuously monitors live options data from Delta Exchange to find optimal Call and Put ratio spread opportunities. Features dynamic filtering, ATM ratio scaling, and ROI calculations based on real-time order books.
* **Interactive Option Charts:** Visualizes option premiums with high fidelity. Supports charting individual Call/Put legs or combining them to visualize advanced strategies (like straddles and strangles). Features simple moving averages (SMA), implied volatility (IV) curves, price alerts, and support/resistance drawing tools.
* **Cross-Tab Synchronization:** Seamlessly shares state (like the top spread picks) across browser tabs using the `BroadcastChannel` API.
* **Responsive Dark/Light Mode:** A sleek, fully responsive design optimized for both desktop and mobile views.

## Technology Stack

* **Framework:** [Next.js](https://nextjs.org/) (App Router)
* **UI Library:** React
* **Charting:** [Lightweight-Charts](https://tradingview.github.io/lightweight-charts/) by TradingView
* **Data Sources:** Delta Exchange (REST API & WebSockets)
* **Styling:** Vanilla CSS with custom design tokens

## Architecture Documentation

For detailed information on how the application works under the hood, please refer to the following design documents:

* [High-Level Design (HLD)](./docs/HLD.md) - Overall system architecture and data flow.
* [Low-Level Design (LLD)](./docs/LLD.md) - Component internals, WebSocket buffering, and state management.
* [Ratio Spread Logic Explained](./docs/ratio_spread_explained.md) - The math and filtering logic behind the scanner.
* [Charting Logic Explained](./docs/charts_explained.md) - How combined OHLC candles are generated and corrected.

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The application proxies API requests to Delta Exchange seamlessly using Next.js `rewrites` configuration.
