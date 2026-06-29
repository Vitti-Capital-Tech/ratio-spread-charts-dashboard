"use client";
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  loadProducts, getExpiries, getStrikes, getSpotPrice,
  fmtExpiry, createTickerStream, getTickers
} from '../lib/api';

const UNDERLYINGS = ['BTC', 'ETH'];
const SCANNER_TOP_KEY = 'vitti_scanner_top_spreads_v1';

import ResultTable from './ResultTable';
import { TrendingUp, TrendingDown, ChevronDown, Play, Square } from 'lucide-react';
import { normalizeIv, toFiniteNumber, matchesOptionType } from '../lib/scannerUtils';
import CustomSelect from './common/CustomSelect';
import CustomInput from './common/CustomInput';

// ── Main Scanner Component ──────────────────────────────────────────────────
export default function RatioSpreadScanner({ onNavigate, theme, toggleTheme, setNavbarProps, userKey }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [underlying, setUnderlying] = useState('BTC');
  const [products, setProducts] = useState([]);
  const [expiries, setExpiries] = useState([]);
  const [selExpiry, setSelExpiry] = useState('');
  const [spotPrice, setSpotPrice] = useState(null);
  const [scanning, setScanning] = useState(false);

  // Mount effect: Load from localStorage
  useEffect(() => {
    const savedUnderlying = localStorage.getItem(`${userKey}_vitti_scanner_underlying`);
    if (savedUnderlying && UNDERLYINGS.includes(savedUnderlying)) {
      setUnderlying(savedUnderlying);
    }
    const savedExpiry = localStorage.getItem(`${userKey}_vitti_scanner_expiry`);
    if (savedExpiry) {
      setSelExpiry(savedExpiry);
    }
    const savedScanning = localStorage.getItem(`${userKey}_vitti_scanner_scanning`) === 'true';
    if (savedScanning) setScanning(savedScanning);

    setIsLoaded(true);
  }, []);

  // Save effects: Run only when isLoaded is true
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_scanner_underlying`, underlying);
    }
  }, [underlying, isLoaded, userKey]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_scanner_expiry`, selExpiry);
    }
  }, [selExpiry, isLoaded, userKey]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_scanner_scanning`, String(scanning));
    }
  }, [scanning, isLoaded, userKey]);

  const [resultsCall, setResultsCall] = useState([]);
  const [resultsPut, setResultsPut] = useState([]);
  const [globalAtmStrike, setGlobalAtmStrike] = useState(null);
  const [tickerData, setTickerData] = useState({});

  const latestTickerDataRef = useRef({});
  const [expectedTickerCount, setExpectedTickerCount] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(0);

  const [activeTableTab, setActiveTableTab] = useState('call');
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  useEffect(() => { setIsFiltersCollapsed(window.innerWidth <= 900); }, []);

  useEffect(() => {
    if (setNavbarProps) {
      const count = Object.keys(tickerData).length;
      setNavbarProps({
        badgeLabel: scanning ? `Scanning · ${count} tickers` : 'Idle',
        badgeDotClassName: scanning ? 'live' : ''
      });
    }
  }, [scanning, tickerData, setNavbarProps]);

  const wsRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const spotIntervalRef = useRef(null);
  const tickerBufferRef = useRef({});
  const flushTimerRef = useRef(null);
  const lastScanTimeRef = useRef(0);
  const scanIdRef = useRef(0);

  // Configurable thresholds initialized from localStorage
  const [config, setConfig] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(`${userKey}_vitti_algo_config`) : null;
    const base = {
      minStrikeDiff: 800,
      minIvDiff: 5,
      maxRatioDeviation: 0.25,
      minSellPremium: 10,
      maxNetPremium: 20,
      minLongDist: 500,
      maxSellQty: 10,
      atmRatioScaling: false,
      atmRatioPctCall: 50,
      atmRatioPctPut: 50
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = { ...base, ...parsed };
        if (parsed.atmRatioDistanceCall !== undefined && parsed.atmRatioPctCall === undefined) {
          migrated.atmRatioPctCall = parsed.atmRatioDistanceCall > 5 ? parsed.atmRatioDistanceCall : 50;
        }
        if (parsed.atmRatioDistancePut !== undefined && parsed.atmRatioPctPut === undefined) {
          migrated.atmRatioPctPut = parsed.atmRatioDistancePut > 5 ? parsed.atmRatioDistancePut : 50;
        }
        return migrated;
      } catch (err) {
        console.error('Failed to parse saved scanner config:', err);
      }
    }
    return base;
  });

  const pickTopUniqueStrikes = useCallback((spreads, limit = 3) => {
    const out = [];
    const seenBuy = new Set();
    for (const s of spreads) {
      const bStrike = s?.buyLeg?.strike != null ? Number(s.buyLeg.strike) : null;
      if (bStrike == null) continue;
      if (seenBuy.has(bStrike)) continue;
      seenBuy.add(bStrike);
      out.push(s);
      if (out.length >= limit) break;
    }
    return out;
  }, []);


  const flushTickerBuffer = useCallback(() => {
    flushTimerRef.current = null;
    const buffered = tickerBufferRef.current;
    if (!Object.keys(buffered).length) return;
    tickerBufferRef.current = {};
    latestTickerDataRef.current = { ...latestTickerDataRef.current, ...buffered };
    setTickerData(latestTickerDataRef.current);
  }, []);

  const broadcastScannerTopSpreads = useCallback((payload) => {
    try {
      const ch = new BroadcastChannel('crypto-scanner-sync');
      ch.postMessage({ type: 'SCANNER_TOP_SPREADS_SYNC', payload, senderId: 'scanner', timestamp: Date.now() });
      ch.close();
    } catch (e) { }
  }, []);

  const publishTopSpreads = useCallback((calls, puts) => {
    const topCalls = pickTopUniqueStrikes(calls, 3);
    const topPuts = pickTopUniqueStrikes(puts, 3);
    const payload = {
      underlying,
      expiry: selExpiry,
      timestamp: Date.now(),
      callTop3: topCalls.map(s => ({
        id: `${s.buyLeg.symbol}_${s.sellLeg.symbol}`,
        buySymbol: s.buyLeg.symbol,
        sellSymbol: s.sellLeg.symbol,
        buyStrike: s.buyLeg.strike,
        sellQty: s.sellQty
      })),
      putTop3: topPuts.map(s => ({
        id: `${s.buyLeg.symbol}_${s.sellLeg.symbol}`,
        buySymbol: s.buyLeg.symbol,
        sellSymbol: s.sellLeg.symbol,
        buyStrike: s.buyLeg.strike,
        sellQty: s.sellQty
      }))
    };
    localStorage.setItem(`${userKey}_${SCANNER_TOP_KEY}`, JSON.stringify(payload));
    broadcastScannerTopSpreads(payload);
  }, [underlying, selExpiry, broadcastScannerTopSpreads, pickTopUniqueStrikes]);


  const refreshProducts = useCallback(async () => {
    try {
      const prods = await loadProducts(underlying);
      setProducts(prods);
      const exps = getExpiries(prods);
      setExpiries(exps);
    } catch (e) { console.error('Failed to load products:', e); }
  }, [underlying]);

  // ── Load products on underlying change ──────────────────────────────────
  useEffect(() => {
    setExpiries([]); setResultsCall([]); setResultsPut([]);
    setTickerData({});
    latestTickerDataRef.current = {};
    tickerBufferRef.current = {};
    setExpectedTickerCount(0);
    refreshProducts();
  }, [underlying]);

  // ── Handle default expiry selection reactive to expiries ────────────────
  useEffect(() => {
    if (expiries.length) {
      if (!selExpiry || !expiries.includes(selExpiry)) {
        setSelExpiry(expiries[0]);
      }
    } else {
      setSelExpiry('');
    }
  }, [expiries, selExpiry]);

  // ── Periodically refresh products to catch expiries and rollover ────────
  useEffect(() => {
    const interval = setInterval(() => {
      refreshProducts();
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [refreshProducts]);

  // ── Fetch spot price ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSpot = () => {
      getSpotPrice(underlying)
        .then(sp => { if (sp) setSpotPrice(sp); })
        .catch(() => { });
    };
    fetchSpot();
    spotIntervalRef.current = setInterval(fetchSpot, 10000);
    return () => clearInterval(spotIntervalRef.current);
  }, [underlying]);

  // ── Build strike pairs and subscribe to WS ──────────────────────────────
  const startScan = useCallback(async () => {
    if (!selExpiry || !products.length) {
      return;
    }

    const scanId = ++scanIdRef.current; // Increment active scan session ID

    // Close any existing WS
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    tickerBufferRef.current = {};

    setScanning(true);
    setResultsCall([]);
    setResultsPut([]);
    setTickerData({});
    latestTickerDataRef.current = {};
    setExpectedTickerCount(0);
    setLastRefreshed(0);
    lastScanTimeRef.current = 0;

    // Get all strikes for this expiry
    const strikes = getStrikes(products, selExpiry);

    if (strikes.length < 2) {
      setScanning(false);
      return;
    }

    const symbolMeta = {};     // symbol -> { strike, lotSize, type, underlying, expiry }
    for (const strike of strikes) {
      // Find Call
      const callProd = products.find(p =>
        p.settlement_time === selExpiry &&
        parseFloat(p.strike_price) === parseFloat(strike) &&
        matchesOptionType(p, 'call')
      );
      if (callProd) {
        const sym = callProd.symbol;
        const lotSize = parseFloat(callProd.contract_size ?? callProd.quoting_precision ?? 1);
        symbolMeta[sym] = { strike: parseFloat(strike), lotSize, type: 'call', underlying, expiry: selExpiry };
      }

      // Find Put
      const putProd = products.find(p =>
        p.settlement_time === selExpiry &&
        parseFloat(p.strike_price) === parseFloat(strike) &&
        matchesOptionType(p, 'put')
      );
      if (putProd) {
        const sym = putProd.symbol;
        const lotSize = parseFloat(putProd.contract_size ?? putProd.quoting_precision ?? 1);
        symbolMeta[sym] = { strike: parseFloat(strike), lotSize, type: 'put', underlying, expiry: selExpiry };
      }
    }

    const perpSymbol = `${underlying}USD`;
    const allSymbols = Object.keys(symbolMeta);
    if (!allSymbols.includes(perpSymbol)) {
      allSymbols.push(perpSymbol);
    }
    setExpectedTickerCount(allSymbols.length);

    // REST Backfill
    try {
      const restTickers = await getTickers(underlying, allSymbols);
      if (scanId !== scanIdRef.current) return; // Guard: ignore if scan session changed
      if (restTickers && Array.isArray(restTickers)) {
        for (const t of restTickers) {
          const sym = t.symbol;
          const meta = symbolMeta[sym];
          if (!meta) continue;

          const { strike, lotSize, type } = meta;
          const markPrice = toFiniteNumber(t.mark_price ?? t.last_price);
          const bid = toFiniteNumber(t.quotes?.best_bid);
          const ask = toFiniteNumber(t.quotes?.best_ask);
          const bidIv = normalizeIv(toFiniteNumber(t.quotes?.bid_iv));
          const askIv = normalizeIv(toFiniteNumber(t.quotes?.ask_iv));
          const iv = normalizeIv(toFiniteNumber(t.mark_vol ?? t.quotes?.mark_iv ?? t.greeks?.iv));
          const delta = t.greeks ? toFiniteNumber(t.greeks.delta) : null;
          const gamma = t.greeks ? toFiniteNumber(t.greeks.gamma) : null;
          const theta = t.greeks ? toFiniteNumber(t.greeks.theta) : null;

          latestTickerDataRef.current[sym] = {
            symbol: sym,
            underlying,
            expiry: selExpiry,
            strike,
            lotSize,
            type,
            markPrice,
            bid,
            ask,
            bidIv,
            askIv,
            iv,
            delta,
            deltaNotional: delta !== null ? Math.abs(delta) * lotSize : null,
            gamma,
            theta,
            lastUpdate: Date.now(),
            bidUpdatedAt: bid != null ? Date.now() : 0,
            askUpdatedAt: ask != null ? Date.now() : 0,
          };
        }
        setTickerData({ ...latestTickerDataRef.current });
        lastScanTimeRef.current = 0; // Trigger scan immediately on backfill load
      }
    } catch (e) {
      console.error('REST backfill error in scanner:', e);
    }

    const stream = createTickerStream(
      allSymbols,
      (msg) => {
        if (scanId !== scanIdRef.current) return; // Guard: ignore messages for stale scan sessions
        const sym = msg.symbol;
        const perpSymbol = `${underlying}USD`;
        if (sym === perpSymbol) {
          const sp = toFiniteNumber(msg.spot_price ?? msg.mark_price ?? msg.close ?? msg.last_price);
          if (sp && !isNaN(sp)) {
            setSpotPrice(sp);
          }
          return;
        }

        const markPrice = toFiniteNumber(msg.mark_price);
        const lastPrice = toFiniteNumber(msg.last_price ?? msg.close);
        const bid = toFiniteNumber(msg.quotes?.best_bid);
        const ask = toFiniteNumber(msg.quotes?.best_ask);
        const bidIv = normalizeIv(toFiniteNumber(msg.quotes?.bid_iv));
        const askIv = normalizeIv(toFiniteNumber(msg.quotes?.ask_iv));
        const iv = normalizeIv(toFiniteNumber(msg.mark_vol ?? msg.quotes?.mark_iv ?? msg.greeks?.iv));
        const delta = msg.greeks ? toFiniteNumber(msg.greeks.delta) : null;
        const gamma = msg.greeks ? toFiniteNumber(msg.greeks.gamma) : null;
        const theta = msg.greeks ? toFiniteNumber(msg.greeks.theta) : null;

        const meta = symbolMeta[sym];
        if (!meta) return;

        const { strike, lotSize, type, underlying: symUnderlying, expiry: symExpiry } = meta;
        const prevBuffered = tickerBufferRef.current[sym] ?? tickerData[sym];
        tickerBufferRef.current[sym] = {
          symbol: sym,
          underlying: symUnderlying,
          expiry: symExpiry,
          strike,
          lotSize,
          type,
          markPrice: markPrice ?? prevBuffered?.markPrice ?? null,
          lastPrice: lastPrice ?? prevBuffered?.lastPrice ?? null,
          bid: bid ?? prevBuffered?.bid ?? null,
          ask: ask ?? prevBuffered?.ask ?? null,
          bidUpdatedAt: bid != null ? Date.now() : (prevBuffered?.bidUpdatedAt ?? 0),
          askUpdatedAt: ask != null ? Date.now() : (prevBuffered?.askUpdatedAt ?? 0),
          bidIv: bidIv ?? prevBuffered?.bidIv ?? null,
          askIv: askIv ?? prevBuffered?.askIv ?? null,
          iv: iv ?? prevBuffered?.iv ?? null,
          delta: delta !== null ? delta : prevBuffered?.delta,
          deltaNotional: delta !== null
            ? Math.abs(delta) * lotSize
            : prevBuffered?.deltaNotional,
          gamma: gamma ?? prevBuffered?.gamma ?? null,
          theta: theta ?? prevBuffered?.theta ?? null,
          lastUpdate: Date.now(),
        };

        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(flushTickerBuffer, 50);
        }
      },
      (status) => {
      }
    );
    wsRef.current = stream;
  }, [selExpiry, products, underlying]);

  // ── Compute Spreads Logic ───────────
  const computeSpreads = useCallback((force = false) => {
    if (!scanning || !spotPrice) return;

    // Mirror of ResultTable.getTickerPrice: best price for a strike + type,
    // falling back to the nearest strike within a tight tolerance. Used to
    // anchor the ATM ratio when atmRatioScaling is enabled.
    const getTickerPrice = (strike, optType, priceField) => {
      const pool = Object.values(latestTickerDataRef.current).filter(
        t => t.underlying === underlying && t.expiry === selExpiry && t.type === optType
      );
      if (!pool.length) return null;

      const exact = pool.find(t => t.strike === strike);
      if (exact) {
        const val = exact[priceField] ?? exact.lastPrice ?? exact.markPrice;
        return (val != null && val > 0) ? val : null;
      }

      const sampleSymbol = pool[0]?.symbol || '';
      const isEth = sampleSymbol.includes('ETH');
      const maxTolerance = isEth ? 50 : 500;

      let nearest = null;
      let minDist = Infinity;
      for (const t of pool) {
        const dist = Math.abs(t.strike - strike);
        if (dist < minDist && dist <= maxTolerance) {
          minDist = dist;
          nearest = t;
        }
      }
      if (!nearest) return null;
      const val = nearest[priceField] ?? nearest.lastPrice ?? nearest.markPrice;
      return (val != null && val > 0) ? val : null;
    };

    const scanTickers = (tickers) => {
      if (tickers.length < 2) return [];

      const sorted = [...tickers].sort((a, b) => a.strike - b.strike);
      const validPairs = [];

      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const buy = sorted[i];
          const sell = sorted[j];

          let buyLeg, sellLeg;
          if (buy.type === 'call') {
            buyLeg = buy; sellLeg = sell; // Call: buy lower, sell higher
          } else {
            buyLeg = sell; sellLeg = buy; // Put: buy higher, sell lower
          }

          const strikeDiff = Math.abs(sellLeg.strike - buyLeg.strike);
          if (strikeDiff < config.minStrikeDiff) continue;

          if (buyLeg.expiry !== sellLeg.expiry) continue;

          // For Buy Leg (Long): use Ask price and Ask IV
          // For Sell Leg (Short): use Bid price and Bid IV
          const buyPrice = buyLeg.ask;
          const sellPrice = sellLeg.bid;

          if (buyPrice == null || sellPrice == null || buyPrice <= 0 || sellPrice <= 0) continue;

          // Require WS-confirmed quotes (reject stale REST backfill data)
          const now = Date.now();
          const FRESHNESS_MS = 120000; // 120 seconds
          const buyAskFresh = (buyLeg.askUpdatedAt || 0) > 0 && (now - buyLeg.askUpdatedAt) < FRESHNESS_MS;
          const sellBidFresh = (sellLeg.bidUpdatedAt || 0) > 0 && (now - sellLeg.bidUpdatedAt) < FRESHNESS_MS;
          if (!buyAskFresh || !sellBidFresh) continue;
          const buyIv = buyLeg.askIv ?? buyLeg.iv;
          const sellIv = sellLeg.bidIv ?? sellLeg.iv;

          if (buyIv == null || sellIv == null) continue;
          const ivDiff = Math.abs(buyIv - sellIv);
          if (ivDiff < config.minIvDiff) continue;

          const spotDist = Math.abs(buyLeg.strike - spotPrice);
          if (spotDist < (config.minLongDist || 0)) continue;

          if (!sellPrice || sellPrice < config.minSellPremium) continue;

          const buyDN = buyLeg.deltaNotional;
          const sellDN = sellLeg.deltaNotional;

          if (buyDN == null || sellDN == null ||
            buyPrice == null || sellPrice == null ||
            buyPrice === 0 || sellPrice === 0 ||
            buyDN === 0 || sellDN === 0) continue;

          const premiumRatio = buyPrice / sellPrice;
          const deltaNotionalRatio = buyDN / sellDN;

          const ratioDeviation = Math.abs(premiumRatio - deltaNotionalRatio) / deltaNotionalRatio;
          if (ratioDeviation > config.maxRatioDeviation) continue;

          const rawQty = buyDN / sellDN;
          const sellQty = Math.max(1, Math.round(rawQty / 0.25) * 0.25);
          if (sellQty > (config.maxSellQty || 10)) continue;

          const deltaDiff = buyDN - sellQty * sellDN;

          const netPrem = sellQty * sellPrice - buyPrice;

          // Apply ATM ratio scaling first (mirrors ResultTable): scale the short
          // qty toward the ATM-anchored ratio, then gate max debit on the net
          // premium that the table will actually display — keeping the scanner's
          // filter and the displayed value consistent.
          let effectiveNetPrem = netPrem;
          const optType = buyLeg.type; // 'call' | 'put' (uniform within this scan)
          if (config.atmRatioScaling && atmStrike != null) {
            const buyIntrinsic = getTickerPrice(atmStrike, optType, 'bid');
            const targetSellStrike = optType === 'call'
              ? atmStrike + strikeDiff
              : atmStrike - strikeDiff;
            const sellIntrinsic = getTickerPrice(targetSellStrike, optType, 'ask');
            const atmRatio = (buyIntrinsic != null && sellIntrinsic != null && sellIntrinsic > 0)
              ? buyIntrinsic / sellIntrinsic
              : null;
            if (atmRatio != null) {
              const pct = optType === 'call' ? config.atmRatioPctCall : config.atmRatioPctPut;
              const atmRatioVal = Math.round(atmRatio / 0.25) * 0.25;
              const diff = Math.max(0, atmRatioVal - sellQty);
              const scaledSellQty = Math.max(sellQty, Math.round((sellQty + (pct / 100) * diff) / 0.25) * 0.25);
              effectiveNetPrem = sellPrice * scaledSellQty - buyPrice;
            }
          }

          if (effectiveNetPrem < -config.maxNetPremium) continue;

          validPairs.push({
            buyLeg,
            sellLeg,
            strikeDiff,
            ivDiff,
            premiumRatio: premiumRatio.toFixed(3),
            deltaNotionalRatio: deltaNotionalRatio.toFixed(3),
            ratioDeviation: (ratioDeviation * 100).toFixed(1),
            sellQty,
            buyPrice,
            sellPrice,
            buyIv,
            sellIv,
            netPremium: netPrem.toFixed(2),
            deltaDiff
          });
        }
      }

      // Sort: closest to ATM first, then by net premium descending (highest credit/lowest debit first)
      validPairs.sort((a, b) => {
        const distA = Math.abs(a.buyLeg.strike - spotPrice);
        const distB = Math.abs(b.buyLeg.strike - spotPrice);
        if (distA !== distB) return distA - distB;
        return b.netPremium - a.netPremium;
      });
      return validPairs;
    };

    const allTickers = Object.values(latestTickerDataRef.current).filter(
      t => t.underlying === underlying && t.expiry === selExpiry
    );

    // Find ATM strike (closest to spotPrice)
    let atmStrike = null;
    let minDiff = Infinity;
    for (const t of allTickers) {
      const diff = Math.abs(t.strike - spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        atmStrike = t.strike;
      }
    }

    // For Call: ATM or OTM means strike >= atmStrike
    const callTickers = allTickers.filter(t => t.type === 'call' && (atmStrike === null || t.strike >= atmStrike));
    // For Put: ATM or OTM means strike <= atmStrike
    const putTickers = allTickers.filter(t => t.type === 'put' && (atmStrike === null || t.strike <= atmStrike));

    const nextCalls = scanTickers(callTickers);
    const nextPuts = scanTickers(putTickers);
    setResultsCall(nextCalls);
    setResultsPut(nextPuts);
    setGlobalAtmStrike(atmStrike);
    publishTopSpreads(nextCalls, nextPuts);

    setLastRefreshed(Date.now());

  }, [scanning, spotPrice, config, publishTopSpreads]);

  // Periodic and conditional scanning with 2-second throttling
  useEffect(() => {
    if (!scanning || !spotPrice) return;

    const nowTime = Date.now();
    // Scan if:
    // 1. We haven't scanned yet (lastRefreshed === 0)
    // 2. Or it has been at least 2 seconds (2000ms) since the last scan
    if (lastRefreshed === 0 || (nowTime - lastScanTimeRef.current >= 2000)) {
      lastScanTimeRef.current = nowTime;
      computeSpreads();
    }
  }, [tickerData, scanning, spotPrice, config, lastRefreshed, computeSpreads]);



  // ── Stop scanning ──────────────────────────────────────────────────────
  const stopScan = useCallback(() => {
    scanIdRef.current++; // Invalidate any running scan stream callbacks
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    tickerBufferRef.current = {};
    // Intentionally keep latestTickerDataRef and tickerData so the frozen table rows 
    // can still access the last known prices for ATM P&L and Margin calculations.
    setScanning(false);
    setExpectedTickerCount(0);
    const payload = { underlying, expiry: selExpiry, timestamp: Date.now(), callTop3: [], putTop3: [] };
    localStorage.setItem(`${userKey}_${SCANNER_TOP_KEY}`, JSON.stringify(payload));
    broadcastScannerTopSpreads(payload);
  }, [underlying, selExpiry, broadcastScannerTopSpreads]);

  const updateConfig = (keyOrObj, value) => {
    setConfig(c => {
      const updates = typeof keyOrObj === 'object' ? keyOrObj : { [keyOrObj]: value };
      const newConfig = { ...c, ...updates };
      try {
        localStorage.setItem(`${userKey}_vitti_algo_config`, JSON.stringify(newConfig));
      } catch (err) {
        console.error('Failed to save config to localStorage:', err);
      }
      return newConfig;
    });
    lastScanTimeRef.current = 0; // Trigger scan immediately on config change
  };

  // Start/stop scanner locally
  const handleStartScan = useCallback(() => {
    startScan();
  }, [startScan]);

  const handleStopScan = useCallback(() => {
    stopScan();
  }, [stopScan]);

  // Auto-start scanning on load if scanner state is set to scan
  useEffect(() => {
    if (scanning && selExpiry && products.length && !wsRef.current) {
      startScan();
    }
  }, [scanning, selExpiry, products, startScan]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (wsRef.current) wsRef.current.close();
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (spotIntervalRef.current) clearInterval(spotIntervalRef.current);
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
  }, []);

  const tickerCount = Object.keys(tickerData).length;
  const hasLiveFeed = scanning && tickerCount > 0;

  return (
    <div className="app">

      <div className="body scanner-body" style={{ flexDirection: 'column' }}>


        {/* Topbar Configuration */}
        <div className="scanner-config-bar">
          {/* Top row: engine + instrument + scan action */}
          <div className="config-top">
            <span className="eng-title">
              <span className="eng-bars" aria-hidden="true">
                <i style={{ height: 6 }}></i>
                <i style={{ height: 11 }}></i>
                <i style={{ height: 14 }}></i>
                <i style={{ height: 8 }}></i>
              </span>
              Ratio Spread Engine
            </span>

            <div className="config-rule hide-mobile"></div>

            <div className="config-zone">
              <div className="config-field">
                <label>Underlying</label>
                <div className="seg" role="tablist">
                  {UNDERLYINGS.map(u => (
                    <button
                      key={u}
                      type="button"
                      role="tab"
                      aria-selected={underlying === u}
                      className={underlying === u ? 'on' : ''}
                      onClick={() => { setUnderlying(u); stopScan(); }}
                    >
                      <span className="coin" data-coin={u}></span>{u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-field">
                <label>Expiry</label>
                <CustomSelect
                  value={selExpiry}
                  onChange={val => { setSelExpiry(val); stopScan(); }}
                  disabled={!expiries.length}
                  options={!expiries.length ? [{ label: 'Loading…', value: selExpiry }] : expiries.map(e => ({ label: fmtExpiry(e), value: e }))}
                  style={{ width: '184px' }}
                />
              </div>
            </div>

            <button
              className="scanner-filters-toggle-btn"
              onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
            >
              <span>{isFiltersCollapsed ? 'SHOW FILTERS' : 'HIDE FILTERS'}</span>
              <ChevronDown
                size={12}
                strokeWidth={2.5}
                style={{ transition: 'transform 0.25s ease', transform: isFiltersCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
              />
            </button>
          </div>

          {/* Body: grouped filters */}
          <div className={`config-body ${isFiltersCollapsed ? 'collapsed' : 'expanded'}`}>
            <div className="fgroup">
              <span className="fgroup-label structure">Structure</span>
              <div className="fgroup-row">
                <div className="fmini">
                  <span>Min wing width</span>
                  <CustomInput type="number" prefix="$" showStepper step={50} width={120}
                    value={config.minStrikeDiff}
                    onChange={e => updateConfig('minStrikeDiff', Number(e.target.value))} />
                </div>
                <div className="fmini">
                  <span>Min spot distance</span>
                  <CustomInput type="number" prefix="$" showStepper step={50} width={120}
                    value={config.minLongDist}
                    onChange={e => updateConfig('minLongDist', Number(e.target.value))} />
                </div>
                <div className="fmini">
                  <span>Max short ratio</span>
                  <CustomInput type="number" prefix="1:" showStepper step={0.25} width={108}
                    value={config.maxSellQty}
                    onChange={e => updateConfig('maxSellQty', Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="config-rule"></div>

            <div className="fgroup">
              <span className="fgroup-label edge">Edge</span>
              <div className="fgroup-row">
                <div className="fmini">
                  <span>Min IV skew edge</span>
                  <CustomInput type="number" suffix="%" showStepper step={0.5} width={108}
                    value={config.minIvDiff}
                    onChange={e => updateConfig('minIvDiff', Number(e.target.value))} />
                </div>
                <div className="fmini">
                  <span>Max delta skew</span>
                  <CustomInput type="number" showStepper step={0.01} width={108}
                    value={config.maxRatioDeviation}
                    onChange={e => updateConfig('maxRatioDeviation', Number(e.target.value))} />
                </div>
                <div className="fmini">
                  <span>Min short premium</span>
                  <CustomInput type="number" prefix="$" showStepper step={1} width={120}
                    value={config.minSellPremium}
                    onChange={e => updateConfig('minSellPremium', Number(e.target.value))} />
                </div>
                <div className="fmini">
                  <span>Max net debit</span>
                  <CustomInput type="number" prefix="$" showStepper step={1} width={120}
                    value={config.maxNetPremium}
                    onChange={e => updateConfig('maxNetPremium', Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="config-rule"></div>

            <div className="fgroup">
              <span className="fgroup-label mode">ATM Mode</span>
              <div className="fgroup-row" style={{ alignItems: 'center' }}>
                <div
                  className={`config-toggle ${config.atmRatioScaling ? 'on' : ''}`}
                  role="switch"
                  aria-checked={config.atmRatioScaling ?? false}
                  tabIndex={0}
                  onClick={() => updateConfig('atmRatioScaling', !config.atmRatioScaling)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateConfig('atmRatioScaling', !config.atmRatioScaling); } }}
                >
                  <span className="config-toggle-track"></span>
                  <span className="config-toggle-label">
                    Dynamic ratio scaling
                    <small>Scales short qty toward ATM</small>
                  </span>
                </div>

                {config.atmRatioScaling && (
                  <>
                    <div className="fmini">
                      <span>Call scale</span>
                      <CustomInput type="number" suffix="%" showStepper step={5} width={108}
                        value={config.atmRatioPctCall ?? 50}
                        onChange={e => updateConfig('atmRatioPctCall', Number(e.target.value))} />
                    </div>
                    <div className="fmini">
                      <span>Put scale</span>
                      <CustomInput type="number" suffix="%" showStepper step={5} width={108}
                        value={config.atmRatioPctPut ?? 50}
                        onChange={e => updateConfig('atmRatioPctPut', Number(e.target.value))} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Scan action — sits after the filters on every viewport */}
          <div className="config-actions">
            <button
              className={`scan-btn ${scanning ? 'stop' : 'start'}`}
              onClick={scanning ? handleStopScan : handleStartScan}
              disabled={!selExpiry}
            >
              {scanning ? (
                <><Square size={11} fill="currentColor" strokeWidth={0} /> STOP SCAN</>
              ) : (
                <>
                  <Play size={11} fill="currentColor" strokeWidth={0} />
                  START SCAN
                </>
              )}
            </button>
          </div>

          {/* Foot: live status */}
          <div className="config-foot">
            <span className={`foot-live ${hasLiveFeed ? 'on' : ''}`}>
              <span className="foot-dot"></span>
              {scanning ? (hasLiveFeed ? 'Live feed' : 'Connecting…') : 'Idle'}
            </span>
            <span><b>{tickerCount}</b>{expectedTickerCount ? ` / ${expectedTickerCount}` : ''} tickers</span>
            {lastRefreshed > 0 && (
              <span className="hide-xs">Last scan <b>{new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(lastRefreshed))}</b></span>
            )}
            <span className="foot-setups">
              <b>{resultsCall.length + resultsPut.length}</b> setups · <b>{resultsCall.length}</b> calls / <b>{resultsPut.length}</b> puts
            </span>
          </div>
        </div>

        <div className="scanner-mobile-tabs">
          <div className={`scanner-mobile-tab ${activeTableTab === 'call' ? 'active' : ''}`} onClick={() => setActiveTableTab('call')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <TrendingUp size={15} style={{ flexShrink: 0 }} /> Call Spreads
          </div>
          <div className={`scanner-mobile-tab ${activeTableTab === 'put' ? 'active' : ''}`} onClick={() => setActiveTableTab('put')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <TrendingDown size={15} style={{ flexShrink: 0 }} /> Put Spreads
          </div>
        </div>

        <main className={`main scanner-main show-${activeTableTab}`} style={{ position: 'relative', padding: 12, gap: 12, display: 'flex', flexDirection: 'row', overflow: 'hidden', flex: 1 }}>
          <ResultTable
            title="CALL SPREAD"
            type="CALL"
            results={resultsCall}
            scanning={scanning}
            hasLiveFeed={hasLiveFeed}
            tickerCount={tickerCount}
            expectedTickerCount={expectedTickerCount}
            config={config}
            onRefresh={() => computeSpreads(true)}
            spotPrice={spotPrice}
            lastRefreshed={lastRefreshed}
            trueAtmStrike={globalAtmStrike}
            tickerData={tickerData}
          />
          <ResultTable
            title="PUT SPREAD"
            type="PUT"
            results={resultsPut}
            scanning={scanning}
            hasLiveFeed={hasLiveFeed}
            tickerCount={tickerCount}
            expectedTickerCount={expectedTickerCount}
            config={config}
            onRefresh={() => computeSpreads(true)}
            spotPrice={spotPrice}
            lastRefreshed={lastRefreshed}
            trueAtmStrike={globalAtmStrike}
            tickerData={tickerData}
          />
        </main>
      </div>
    </div>
  );
}
