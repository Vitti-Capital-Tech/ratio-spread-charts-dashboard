"use client";
import React, {
  useEffect, useLayoutEffect, useRef, useState,
  useCallback, forwardRef, useImperativeHandle
} from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import {
  loadProducts, getExpiries, getStrikes, getSpotPrice,
  fetchCandles, sumCandles, putSymbol, fmtExpiry, findATM,
  createWS, TF_SECS
} from '../lib/api';
import { useTabListener } from '../lib/useTabSync';
import { Plus, X, ChevronLeft, ChevronRight, ChevronsRight, ChevronDown, PenLine, Undo2, Trash2, ZoomIn, ZoomOut, Maximize2, Maximize, Minimize, Bell, Clock, Check } from 'lucide-react';
import CustomSelect from './common/CustomSelect';
import CustomInput from './common/CustomInput';

const UNDERLYINGS = ['BTC', 'ETH'];
const TF_LIST = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w'];
const CANDLE_COUNT = 300;

// Collision-proof id — Date.now() alone repeats when two are created in the
// same millisecond (e.g. adding alerts quickly), causing duplicate React keys.
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const playAlertSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playNote = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    playNote(880, ctx.currentTime, 0.2); // A5
    playNote(1108.73, ctx.currentTime + 0.15, 0.4); // C#6
  } catch (e) { console.warn('Audio play failed', e); }
};

const formatCombinedTitle = (callSym, putSym, priceType) => {
  if (!callSym && !putSym) return 'PREMIUM CHART';
  if (!callSym) return `PUT PREMIUM (${priceType.toUpperCase()}) · ${putSym}`;
  if (!putSym) return `CALL PREMIUM (${priceType.toUpperCase()}) · ${callSym}`;

  const cParts = callSym.split('-');
  const pParts = putSym.split('-');
  if (cParts.length < 4 || pParts.length < 4) return `COMBINED PREMIUM · ${callSym} + ${putSym}`;

  const typeC = cParts[0];
  const asset = cParts[1];
  const strikeC = cParts[2];
  const expiry = cParts[3];
  const typeP = pParts[0];
  const strikeP = pParts[2];

  if (strikeC === strikeP) {
    return `COMBINED PREMIUM (${priceType.toUpperCase()}) · ${asset}-${strikeC}-${expiry} (${typeC}+${typeP})`;
  }
  return `COMBINED PREMIUM (${priceType.toUpperCase()}) · ${typeC}-${strikeC} + ${typeP}-${strikeP} · ${asset}-${expiry}`;
};

// ── Timezone display ──────────────────────────────────────────────────────────
// Chart time values are UTC unix-seconds; we format them in the chosen IANA zone
// for the axis ticks and the crosshair readout (lightweight-charts has no native
// timezone support, so we drive it via formatters).
const TZ_OPTIONS = [
  { label: 'UTC', value: 'UTC' },
  { label: 'IST — India (UTC+5:30)', value: 'Asia/Kolkata' },
  { label: 'New York (ET)', value: 'America/New_York' },
  { label: 'London (UK)', value: 'Europe/London' },
  { label: 'Dubai (GST)', value: 'Asia/Dubai' },
  { label: 'Singapore (SGT)', value: 'Asia/Singapore' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Browser Local', value: 'local' },
];

const resolveTz = (tz) => (tz === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : tz) || 'UTC';

const makeTickMarkFormatter = (tz) => {
  const timeZone = resolveTz(tz);
  return (time, tickMarkType) => {
    const d = new Date(time * 1000);
    // 0 Year · 1 Month · 2 DayOfMonth · 3 Time · 4 TimeWithSeconds
    if (tickMarkType === 0) return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(d);
    if (tickMarkType === 1) return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short' }).format(d);
    if (tickMarkType === 2) return new Intl.DateTimeFormat('en-US', { timeZone, day: '2-digit', month: 'short' }).format(d);
    if (tickMarkType === 4) return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  };
};

const makeTimeFormatter = (tz) => {
  const timeZone = resolveTz(tz);
  return (time) => new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(time * 1000));
};

// ── ChartPanel ────────────────────────────────────────────────────────────────
// Always mounted (never unmounts), shown/hidden via CSS by parent.
// Exposes setData() and update() via ref.
const ChartPanel = forwardRef(function ChartPanel({
  title, colorUp, colorDown, iconColor,
  alerts = [],
  showIvCall, showIvPut, theme, visible = true, timezone = 'UTC'
}, ref) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const legendRef = useRef(null);
  const alertLinesRef = useRef({}); // { [id]: line }
  const callIvRef = useRef(null);
  const putIvRef = useRef(null);
  const combIvRef = useRef(null);
  const smaSeriesRef = useRef(null);
  const candlesCacheRef = useRef([]);
  const [showSma, setShowSma] = useState(false);

  const drawnLinesRef = useRef([]);
  const [drawMode, setDrawMode] = useState(false);
  const drawModeRef = useRef(false);
  const [drawnCount, setDrawnCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const panelRef = useRef(null);

  // Fullscreen via the browser Fullscreen API — true fullscreen on mobile
  // (a fixed overlay can be trapped by transformed ancestors). Falls back to
  // a fixed-position overlay where the API is unavailable (e.g. iOS Safari).
  const toggleFullscreen = () => {
    const el = panelRef.current;
    if (!el) { setFullscreen(f => !f); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fullscreen) {
      if (req) Promise.resolve(req.call(el)).catch(() => setFullscreen(true));
      else setFullscreen(true);
    } else if (active && exit) {
      Promise.resolve(exit.call(document)).catch(() => setFullscreen(false));
    } else {
      setFullscreen(false);
    }
  };

  // Keep state synced when the browser exits fullscreen (system back / Esc).
  useEffect(() => {
    const onFs = () => setFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  // Resize the chart to its new bounds whenever fullscreen toggles; Esc exits
  // the CSS fallback (the API handles Esc natively).
  useEffect(() => {
    const el = containerRef.current, chart = chartRef.current;
    if (!el || !chart) return;
    const id = requestAnimationFrame(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    if (!fullscreen) return () => cancelAnimationFrame(id);
    const onKey = (e) => {
      if (e.key === 'Escape' && !(document.fullscreenElement || document.webkitFullscreenElement)) setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);

  const toggleDrawMode = () => {
    const next = !drawMode;
    setDrawMode(next);
    drawModeRef.current = next;
    if (containerRef.current) {
      containerRef.current.style.cursor = next ? 'crosshair' : 'default';
    }
  };

  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove all old lines
    Object.values(alertLinesRef.current).forEach(line => {
      seriesRef.current.removePriceLine(line);
    });
    alertLinesRef.current = {};

    // Add current lines
    alerts.forEach(a => {
      if (!a.price) return;
      const line = seriesRef.current.createPriceLine({
        price: parseFloat(a.price),
        color: a.dir === '>=' ? '#3fb950' : '#f85149',
        lineWidth: 2,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: `ALERT ${a.dir}`,
      });
      alertLinesRef.current[a.id] = line;
    });
  }, [alerts]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: theme === 'dark' ? '#0a0d12' : '#fff' },
        textColor: theme === 'dark' ? '#7d8590' : '#000',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#161c24' : '#e5e7eb' },
        horzLines: { color: theme === 'dark' ? '#161c24' : '#e5e7eb' },
      },
      crosshair: { mode: 1 },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: {
        scaleMargins: { top: 0.05, bottom: 0.35 },
      },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: colorUp,
      downColor: colorDown,
      borderVisible: false,
      wickUpColor: colorUp,
      wickDownColor: colorDown,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    let ivScaleCreated = false;

    if (showIvCall && showIvPut) {
      combIvRef.current = chart.addSeries(LineSeries, {
        priceScaleId: 'ivScale', color: '#2f81f7', lineWidth: 1.5, title: 'Comb IV', crosshairMarkerRadius: 3
      });
      ivScaleCreated = true;
    } else {
      if (showIvCall) {
        callIvRef.current = chart.addSeries(LineSeries, {
          priceScaleId: 'ivScale', color: '#00d9a3', lineWidth: 1.5, title: 'Call IV', crosshairMarkerRadius: 3
        });
        ivScaleCreated = true;
      }
      if (showIvPut) {
        putIvRef.current = chart.addSeries(LineSeries, {
          priceScaleId: 'ivScale', color: '#ff2ebd', lineWidth: 1.5, title: 'Put IV', crosshairMarkerRadius: 3
        });
        ivScaleCreated = true;
      }
    }

    if (ivScaleCreated) {
      chart.priceScale('ivScale').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0.05 },
        borderColor: theme === 'dark' ? '#1e2730' : '#1e2730',
      });
    }

    chart.subscribeCrosshairMove((param) => {
      if (!legendRef.current) return;
      if (!param.time || param.point.x < 0 || param.point.y < 0) {
        legendRef.current.innerHTML = '';
        return;
      }
      const data = param.seriesData.get(series);
      if (data) {
        const isUp = data.close >= data.open;
        const valColor = isUp ? '#089981' : '#f23645'; // TradingView green/red
        const isLight = theme === 'light';
        const legendBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 13, 18, 0.85)';
        const legendBorder = isLight ? '#e5e7eb' : '#1e2730';
        const labelColor = isLight ? '#4b5563' : '#9ca3af';
        const valTextColor = isLight ? '#111827' : '#fff';

        let ivHtml = '';
        if (callIvRef.current) {
          const callData = param.seriesData.get(callIvRef.current);
          if (callData) ivHtml += `<span style="color:#00d9a3;margin-left:8px;">Call IV <span style="color:${valTextColor}">${(callData.value * 100).toFixed(1)}%</span></span>`;
        }
        if (putIvRef.current) {
          const putData = param.seriesData.get(putIvRef.current);
          if (putData) ivHtml += `<span style="color:#ff2ebd;margin-left:8px;">Put IV <span style="color:${valTextColor}">${(putData.value * 100).toFixed(1)}%</span></span>`;
        }
        if (combIvRef.current) {
          const combData = param.seriesData.get(combIvRef.current);
          if (combData) ivHtml += `<span style="color:#2f81f7;margin-left:8px;">Comb IV <span style="color:${valTextColor}">${(combData.value * 100).toFixed(1)}%</span></span>`;
        }
        legendRef.current.innerHTML = `
          <div style="display:flex;gap:12px;background:${legendBg};padding:6px 10px;border-radius:4px;border:1px solid ${legendBorder};backdrop-filter:blur(4px);align-items:center;">
            <span style="color:${labelColor}">O <span style="color:${valColor}">${data.open}</span></span>
            <span style="color:${labelColor}">H <span style="color:${valColor}">${data.high}</span></span>
            <span style="color:${labelColor}">L <span style="color:${valColor}">${data.low}</span></span>
            <span style="color:${labelColor}">C <span style="color:${valColor}">${data.close}</span></span>
            ${ivHtml}
          </div>
        `;
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(el);

    return () => { ro.disconnect(); chart.remove(); };
  }, []); // mount once, never destroy until page unloads

  // Apply the display timezone to axis ticks + crosshair time readout.
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      localization: { timeFormatter: makeTimeFormatter(timezone) },
      timeScale: { tickMarkFormatter: makeTickMarkFormatter(timezone) },
    });
  }, [timezone]);

  useEffect(() => {
    if (!chartRef.current) return;
    const isLight = theme === 'light';
    chartRef.current.applyOptions({
      layout: {
        background: { color: 'transparent' },
        textColor: isLight ? '#6b7280' : '#7d8590',
      },
      grid: {
        vertLines: { color: isLight ? '#e5e7eb' : '#161c24' },
        horzLines: { color: isLight ? '#e5e7eb' : '#161c24' },
      },
      timeScale: { borderColor: isLight ? '#d1d5db' : '#1e2730' },
      rightPriceScale: { borderColor: isLight ? '#d1d5db' : '#1e2730' },
    });
  }, [theme]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (showSma) {
      if (!smaSeriesRef.current) {
        smaSeriesRef.current = chartRef.current.addSeries(LineSeries, {
          color: '#2f81f7',
          lineWidth: 2,
          title: 'SMA 20',
          crosshairMarkerRadius: 4,
          priceScaleId: 'right'
        });

        const candles = candlesCacheRef.current;
        if (candles.length >= 20) {
          const smaData = [];
          for (let i = 19; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < 20; j++) sum += candles[i - j].close;
            smaData.push({ time: candles[i].time, value: sum / 20 });
          }
          smaSeriesRef.current.setData(smaData);
        }
      }
    } else {
      if (smaSeriesRef.current) {
        chartRef.current.removeSeries(smaSeriesRef.current);
        smaSeriesRef.current = null;
      }
    }
  }, [showSma]);

  // Handle Chart Clicks for Drawing
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    const clickHandler = (param) => {
      console.log('Chart clicked:', param);
      if (!drawModeRef.current) return;

      let price = null;
      if (param.point) {
        price = seriesRef.current.coordinateToPrice(param.point.y);
      } else if (param.time) {
        const data = param.seriesData.get(seriesRef.current);
        if (data && data.close !== undefined) price = data.close;
      }

      if (price !== null && !isNaN(price)) {
        console.log('Drawing line at price:', price);
        const line = seriesRef.current.createPriceLine({
          price: price,
          color: theme === 'dark' ? '#2f81f7' : '#2f81f7',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: 'S/R',
        });
        drawnLinesRef.current.push(line);
        setDrawnCount(prev => prev + 1);

        // Auto-off
        setDrawMode(false);
        drawModeRef.current = false;
        if (containerRef.current) containerRef.current.style.cursor = 'default';
      }
    };

    chartRef.current.subscribeClick(clickHandler);

    return () => {
      if (chartRef.current) {
        chartRef.current.unsubscribeClick(clickHandler);
      }
    };
  }, [theme]); // Re-bind only if theme changes (for color), drawMode is handled via ref

  useImperativeHandle(ref, () => ({
    setData(candles, fit = true) {
      if (!seriesRef.current || !candles?.length) return;
      candlesCacheRef.current = [...candles];
      let range;
      if (!fit) range = chartRef.current?.timeScale().getVisibleLogicalRange();
      seriesRef.current.setData(candles);

      if (smaSeriesRef.current && candles.length >= 20) {
        const smaData = [];
        for (let i = 19; i < candles.length; i++) {
          let sum = 0;
          for (let j = 0; j < 20; j++) sum += candles[i - j].close;
          smaData.push({ time: candles[i].time, value: sum / 20 });
        }
        smaSeriesRef.current.setData(smaData);
      }

      if (fit) {
        chartRef.current?.timeScale().fitContent();
      } else if (range) {
        chartRef.current?.timeScale().setVisibleLogicalRange(range);
      }
    },
    update(candle) {
      if (!seriesRef.current || !candle) return;
      try {
        // Lightweight-charts update handles newer or same-time candles perfectly.
        // For older candles, we should ideally use setData, but for small corrections
        // to the "live" tip, this works.
        seriesRef.current.update(candle);

        const cache = candlesCacheRef.current;
        if (cache.length === 0) {
          cache.push(candle);
        } else {
          const lastIdx = cache.length - 1;
          if (candle.time === cache[lastIdx].time) {
            cache[lastIdx] = candle;
          } else if (candle.time > cache[lastIdx].time) {
            cache.push(candle);
          } else {
            // Historical correction: find and update
            const idx = cache.findIndex(c => c.time === candle.time);
            if (idx !== -1) cache[idx] = candle;
          }
        }

        // Always maintain max history for SMA
        if (cache.length > 500) cache.shift();

        if (smaSeriesRef.current && cache.length >= 20) {
          const idx = cache.findIndex(c => c.time === candle.time);
          if (idx >= 19) {
            let sum = 0;
            for (let j = 0; j < 20; j++) sum += cache[idx - j].close;
            smaSeriesRef.current.update({ time: candle.time, value: sum / 20 });
          }
        }

        if (callIvRef.current && candle.callIv !== undefined && !isNaN(candle.callIv)) {
          callIvRef.current.update({ time: candle.time, value: candle.callIv });
        }
        if (putIvRef.current && candle.putIv !== undefined && !isNaN(candle.putIv)) {
          putIvRef.current.update({ time: candle.time, value: candle.putIv });
        }
        if (combIvRef.current && candle.callIv !== undefined && candle.putIv !== undefined) {
          const sum = candle.callIv + candle.putIv;
          if (!isNaN(sum)) {
            combIvRef.current.update({ time: candle.time, value: sum });
          }
        }
      } catch (e) {
        // console.warn('series.update error:', e.message);
      }
    },
    clearIvData() {
      try {
        if (callIvRef.current) callIvRef.current.setData([]);
        if (putIvRef.current) putIvRef.current.setData([]);
        if (combIvRef.current) combIvRef.current.setData([]);
      } catch { }
    },
    // Seed the combined-IV overlay from persisted points. IV has no REST
    // history (only live WS ticks provide it), so on refresh we restore the
    // previously-streamed IV line instead of leaving it blank.
    seedIv(points) {
      if (!points?.length || !combIvRef.current) return;
      try {
        combIvRef.current.setData(points.map(p => ({ time: p.time, value: p.value })));
      } catch { }
    },
    clearData() {
      if (!seriesRef.current) return;
      try { seriesRef.current.setData([]); } catch { }
    },
  }), []);

  return (
    <div ref={panelRef} className={`chart-panel-container ${fullscreen ? 'chart-fullscreen' : ''}`} style={{
      flex: 1, display: visible ? 'flex' : 'none', flexDirection: 'column',
      border: '1px solid var(--border)', borderRadius: 8,
      overflow: 'hidden', minHeight: 0, background: 'var(--bg)'
    }}>
      <div style={{
        padding: '8px 12px', background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
        color: 'var(--text-dim)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: iconColor || colorUp }}>▮</span>
            <span>{title}</span>
          </div>

          <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

          {/* Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowSma(!showSma)}
              style={{
                background: showSma ? 'rgba(47, 129, 247, 0.15)' : 'transparent',
                border: `1px solid ${showSma ? 'rgba(47, 129, 247, 0.4)' : 'var(--border)'}`,
                color: showSma ? '#2f81f7' : 'var(--text-dim)',
                padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                fontWeight: 600, transition: 'all 0.15s'
              }}
            >
              SMA 20
            </button>
            <button
              onClick={toggleDrawMode}
              title="Toggle Trendline Tool"
              style={{
                background: drawMode ? 'rgba(56, 139, 253, 0.15)' : 'transparent',
                border: `1px solid ${drawMode ? '#388bfd' : 'var(--border)'}`,
                color: drawMode ? '#388bfd' : 'var(--text-dim)',
                padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600
              }}
            >
              TRENDLINE
            </button>
          </div>

        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={legendRef} style={{
          position: 'absolute', top: 8, left: 8, zIndex: 10,
          fontSize: 11, fontFamily: "'Inter', sans-serif", color: '#7d8590', pointerEvents: 'none'
        }} />
        {(showIvCall || showIvPut) && (
          <div style={{
            position: 'absolute',
            top: '70%',
            left: 0,
            right: 0,
            height: '1px',
            background: 'var(--border)',
            zIndex: 5,
            pointerEvents: 'none'
          }} />
        )}

        {/* TradingView-style Tools */}
        <div style={{
          position: 'absolute', bottom: 40, right: 12, zIndex: 10,
          display: 'flex', gap: 4, background: theme === 'dark' ? 'rgba(10, 13, 18, 0.8)' : 'rgba(255, 255, 255, 0.8)', padding: 4,
          borderRadius: 8, border: '1px solid var(--border)', backdropFilter: 'blur(4px)'
        }}>
          <button title="Scroll Left" className="tv-btn" onClick={() => {
            const ts = chartRef.current?.timeScale();
            if (!ts) return;
            const range = ts.getVisibleLogicalRange();
            if (!range) return;
            const shift = (range.to - range.from) * 0.2;
            ts.setVisibleLogicalRange({ from: range.from - shift, to: range.to - shift });
          }}>
            <ChevronLeft size={16} strokeWidth={2} />
          </button>

          <button title="Scroll Right" className="tv-btn" onClick={() => {
            const ts = chartRef.current?.timeScale();
            if (!ts) return;
            const range = ts.getVisibleLogicalRange();
            if (!range) return;
            const shift = (range.to - range.from) * 0.2;
            ts.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
          }}>
            <ChevronRight size={16} strokeWidth={2} />
          </button>

          <button title="Go to Current Time" className="tv-btn" onClick={() => {
            const ts = chartRef.current?.timeScale();
            if (!ts || !candlesCacheRef.current.length) return;

            const lastIndex = candlesCacheRef.current.length - 1;
            const width = ts.width();
            const barSpacing = ts.options().barSpacing || 6;
            const barsVisible = width / barSpacing;

            ts.setVisibleLogicalRange({
              from: lastIndex - barsVisible / 2,
              to: lastIndex + barsVisible / 2
            });
          }}>
            <ChevronsRight size={16} strokeWidth={2} />
          </button>

          <div style={{ width: 1, background: 'var(--border)', margin: '4px 4px' }} />

          <button title="Draw S/R Line" className="tv-btn" onClick={toggleDrawMode} style={{ color: drawMode ? '#2f81f7' : 'var(--text-dim)', background: drawMode ? 'rgba(47, 129, 247, 0.15)' : 'transparent' }}>
            <PenLine size={16} strokeWidth={2} />
          </button>

          {drawnCount > 0 && (
            <>
              <button title="Undo Last Line" className="tv-btn" onClick={() => {
                const last = drawnLinesRef.current.pop();
                if (last) {
                  try { seriesRef.current.removePriceLine(last); } catch (e) { }
                  setDrawnCount(drawnLinesRef.current.length);
                }
              }}>
                <Undo2 size={16} strokeWidth={2} />
              </button>
              <button title="Clear All S/R Lines" className="tv-btn" onClick={() => {
                drawnLinesRef.current.forEach(line => {
                  try { seriesRef.current.removePriceLine(line); } catch (e) { }
                });
                drawnLinesRef.current = [];
                setDrawnCount(0);
              }} style={{ color: '#f85149' }}>
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </>
          )}

          <div style={{ width: 1, background: 'var(--border)', margin: '4px 4px' }} />

          <button title="Zoom Out" className="tv-btn" onClick={() => {
            const ts = chartRef.current?.timeScale();
            if (!ts) return;
            const range = ts.getVisibleLogicalRange();
            if (!range) return;
            const diff = (range.to - range.from) * 0.2;
            ts.setVisibleLogicalRange({ from: range.from - diff, to: range.to + diff });
          }}>
            <ZoomOut size={16} strokeWidth={2} />
          </button>

          <button title="Zoom In" className="tv-btn" onClick={() => {
            const ts = chartRef.current?.timeScale();
            if (!ts) return;
            const range = ts.getVisibleLogicalRange();
            if (!range) return;
            const diff = (range.to - range.from) * 0.2;
            ts.setVisibleLogicalRange({ from: range.from + diff, to: range.to - diff });
          }}>
            <ZoomIn size={16} strokeWidth={2} />
          </button>

          <div style={{ width: 1, background: 'var(--border)', margin: '4px 4px' }} />

          <button title="Auto Fit" className="tv-btn" onClick={() => {
            chartRef.current?.timeScale().fitContent();
          }}>
            <Maximize2 size={16} strokeWidth={2} />
          </button>

          <button title={fullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'} className="tv-btn" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={16} strokeWidth={2} /> : <Maximize size={16} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </div>
  );
});

// ── App ───────────────────────────────────────────────────────────────────────
// Professional/simple sidebar polish. Injected as a scoped <style> (higher
// specificity than the base .card/.btn-start rules) so it renders even while
// the dev server's globals.css bundle is stale. Migrate to globals.css later.
const SIDEBAR_STYLE = `
.sidebar { gap: 14px; }
/* On mobile the wrapper is transparent so nothing about that layout changes. */
.sidebar-scroll { display: contents; }

@media (min-width: 901px) {
  /* Sidebar becomes: [scrollable content] + [right-edge vertical toggle bar]. */
  .sidebar { flex-direction: row; padding: 0; gap: 0; overflow: hidden; align-items: stretch; }
  .sidebar-scroll {
    display: flex; flex-direction: column; gap: 14px;
    flex: 1; min-width: 0; padding: 14px; overflow-y: auto;
    scrollbar-width: none;
  }
  .sidebar-scroll::-webkit-scrollbar { display: none; }        /* hide scrollbar (Chrome) */
  .sidebar.rail-collapsed .sidebar-scroll { display: none; }

  /* Vertical handle bar — same affordance to open (collapsed) and close (open). */
  .sidebar .sidebar-rail-toggle {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    width: 28px; flex-shrink: 0; align-self: stretch;
    background: var(--bg); border: none; border-left: 1px solid var(--border); border-radius: 0;
    color: var(--text-dim); cursor: pointer; padding: 0;
    transition: color 0.15s, background 0.15s;
  }
  .sidebar .sidebar-rail-toggle:hover { color: #2f81f7; background: var(--bg3); }
  .sidebar .sidebar-rail-toggle .rail-vertical-label {
    writing-mode: vertical-rl; text-orientation: mixed;
    letter-spacing: 2px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  }
  .sidebar.rail-collapsed { width: 46px; min-width: 46px; padding: 0; }
  .sidebar.rail-collapsed .sidebar-rail-toggle { flex: 1; border-left: none; }
}
.sidebar .card { box-shadow: none; border-radius: 12px; padding: 16px; }
.sidebar .card-title { color: var(--text); }
.sidebar .config-section-label { color: var(--text-dim); }
.sidebar .config-section-label::before { width: 3px; height: 11px; border-radius: 2px; }
.sidebar .config-divider { margin: 4px 0; opacity: 0.55; }
.sidebar label { margin-bottom: 6px; }
.sidebar .custom-dropdown-trigger { background: var(--bg); border-radius: 8px; min-height: 38px; font-weight: 500; }
.sidebar .custom-dropdown-trigger:hover,
.sidebar .custom-dropdown-container.open .custom-dropdown-trigger { border-color: rgba(47, 129, 247, 0.55); }
.sidebar .seg { height: 38px; border-radius: 8px; width: 100%; }
.sidebar .seg > button { flex: 1; }
.sidebar .btn-start {
  background: linear-gradient(90deg, #2563eb, #3b82f6);
  border: none; border-radius: 10px; color: #fff;
  font-weight: 600; letter-spacing: 0.4px; padding: 12px 14px;
  box-shadow: 0 10px 24px -12px rgba(37, 99, 235, 0.7);
}
.sidebar .btn-start:hover:not(:disabled) {
  background: linear-gradient(90deg, #3b82f6, #58a6ff);
  box-shadow: 0 14px 30px -12px rgba(59, 130, 246, 0.6);
  transform: translateY(-1px);
}
.sidebar .btn-start:disabled { opacity: 0.5; box-shadow: none; }
`;

export default function ChartsView({ onNavigate, theme, toggleTheme, setNavbarProps, userKey }) {
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);
  useEffect(() => { setIsConfigCollapsed(window.innerWidth <= 900); }, []);

  const [isLoaded, setIsLoaded] = useState(false);
  const [underlying, setUnderlying] = useState('BTC');
  const [tf, setTf] = useState('1m');
  const [priceType, setPriceType] = useState('mark');
  const [timezone, setTimezone] = useState('UTC');

  const [products, setProducts] = useState([]);
  const [expiries, setExpiries] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [selExpiry, setSelExpiry] = useState('');
  const [selCallStrike, setSelCallStrike] = useState('');
  const [selPutStrike, setSelPutStrike] = useState('');
  const [callSym, setCallSym] = useState('');
  const [putSym, setPutSym] = useState('');
  const [legType, setLegType] = useState('combined'); // 'combined' | 'call' | 'put'
  const [watchList, setWatchList] = useState([]);
  const watchListRef = useRef(watchList);
  useEffect(() => { watchListRef.current = watchList; }, [watchList]);

  const [listData, setListData] = useState({}); // Stores { price, high, low } per item ID
  const [selectedWatchId, setSelectedWatchId] = useState(null);

  // Desktop builder rail: auto-collapse to a slim rail when a chart is active,
  // handing the width to the chart. One-directional (only collapses) so the
  // user can re-expand and it stays until they open another chart.
  // Builder rail is fully user-controlled via the toggle (no auto-collapse).
  const [railCollapsed, setRailCollapsed] = useState(false);

  // Mount effect: Load from localStorage
  useEffect(() => {
    const savedUnderlying = localStorage.getItem(`${userKey}_vitti_charts_underlying`);
    if (savedUnderlying) setUnderlying(savedUnderlying);

    const savedTf = localStorage.getItem(`${userKey}_vitti_charts_tf`);
    if (savedTf) setTf(savedTf);

    const savedPriceType = localStorage.getItem(`${userKey}_vitti_charts_price_type`);
    if (savedPriceType) setPriceType(savedPriceType);

    const savedTz = localStorage.getItem(`${userKey}_vitti_charts_timezone`);
    if (savedTz) setTimezone(savedTz);

    const savedLegType = localStorage.getItem(`${userKey}_vitti_charts_leg_type`);
    if (savedLegType) setLegType(savedLegType);

    const savedWatchlist = localStorage.getItem(`${userKey}_vitti_charts_watchlist`);
    if (savedWatchlist) {
      try {
        setWatchList(JSON.parse(savedWatchlist));
      } catch (e) { }
    }

    const savedSelectedWatchId = localStorage.getItem(`${userKey}_vitti_charts_selected_watch_id`);
    if (savedSelectedWatchId) setSelectedWatchId(savedSelectedWatchId);

    setIsLoaded(true);
  }, [userKey]);

  // Save effects: Run only when isLoaded is true
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_charts_underlying`, underlying);
    }
  }, [underlying, isLoaded, userKey]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_charts_tf`, tf);
    }
  }, [tf, isLoaded, userKey]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_charts_price_type`, priceType);
    }
  }, [priceType, isLoaded, userKey]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_charts_timezone`, timezone);
    }
  }, [timezone, isLoaded, userKey]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_charts_leg_type`, legType);
    }
  }, [legType, isLoaded, userKey]);

  useEffect(() => {
    if (isLoaded) {
      if (selectedWatchId) {
        localStorage.setItem(`${userKey}_vitti_charts_selected_watch_id`, selectedWatchId);
      } else {
        localStorage.removeItem(`${userKey}_vitti_charts_selected_watch_id`);
      }
    }
  }, [selectedWatchId, isLoaded, userKey]);

  // ── Cross-tab sync for Watchlist ─────────────────────────────────────────
  const isRemoteUpdateRef = useRef(false);
  const selectedWatchIdRef = useRef(selectedWatchId);
  useEffect(() => { selectedWatchIdRef.current = selectedWatchId; }, [selectedWatchId]);

  const { broadcast: tabBroadcast } = useTabListener({
    WATCHLIST_SYNC: (payload) => {
      const currentStr = JSON.stringify(watchListRef.current);
      const newStr = JSON.stringify(payload.watchList);
      if (currentStr !== newStr) {
        isRemoteUpdateRef.current = true;
        setWatchList(payload.watchList);

        // Handle selected item state when watchlist changes remotely
        const currSelected = selectedWatchIdRef.current;
        if (currSelected) {
          const exists = payload.watchList.find(w => w.id === currSelected);
          if (!exists) {
            setSelectedWatchId(payload.watchList.length ? payload.watchList[0].id : null);
          }
        } else if (payload.watchList.length > 0) {
          setSelectedWatchId(payload.watchList[0].id);
        }
      }
    }
  });

  useEffect(() => {
    watchListRef.current = watchList;
    if (isLoaded) {
      localStorage.setItem(`${userKey}_vitti_charts_watchlist`, JSON.stringify(watchList));
    }
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    tabBroadcast('WATCHLIST_SYNC', { watchList });
  }, [watchList, tabBroadcast, isLoaded, userKey]);
  // ─────────────────────────────────────────────────────────────────────────

  const addToWatchList = async () => {
    if (legType !== 'put' && !callSym) { setErrMsg('Select valid call strike.'); return; }
    if (legType !== 'call' && !putSym) { setErrMsg('Select valid put strike.'); return; }
    setErrMsg('');

    const id = uid();
    const item = {
      id,
      type: legType,
      callSym: legType !== 'put' ? callSym : null,
      putSym: legType !== 'call' ? putSym : null,
      callStrike: selCallStrike,
      putStrike: selPutStrike,
      expiry: selExpiry,
      underlying,
      priceType,
      alerts: [], // Array of { id, dir, price }
    };

    setWatchList(prev => {
      const next = [...prev, item];
      if (next.length === 1) setTimeout(() => setSelectedWatchId(id), 0);
      return next;
    });

    try {
      const now = Math.floor(Date.now() / 1000);
      const start = now - 3600;
      let hc = 0, lc = Infinity, hp = 0, lp = Infinity;

      if (item.callSym) {
        const c = await fetchCandles(item.callSym, '1h', start, now, priceType);
        if (c.length) { hc = c[c.length - 1].high; lc = c[c.length - 1].low; }
      }
      if (item.putSym) {
        const p = await fetchCandles(item.putSym, '1h', start, now, priceType);
        if (p.length) { hp = p[p.length - 1].high; lp = p[p.length - 1].low; }
      }

      let initialHigh = 0, initialLow = Infinity;
      if (item.type === 'combined' && hc && hp) {
        initialHigh = hc + hp;
        initialLow = lc + lp;
      } else if (item.type === 'call') {
        initialHigh = hc; initialLow = lc;
      } else if (item.type === 'put') {
        initialHigh = hp; initialLow = lp;
      }
      if (initialLow === Infinity) initialLow = 0;

      setListData(prev => ({
        ...prev,
        [id]: { price: 0, high: initialHigh, low: initialLow }
      }));
    } catch (e) { console.error('High/Low error', e); }
  };

  // 'idle' | 'loading' | 'ready'
  const [phase, setPhase] = useState('idle');
  const [errMsg, setErrMsg] = useState('');
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [callPrice, setCallPrice] = useState(null);
  const [putPrice, setPutPrice] = useState(null);
  const [spotPrice, setSpotPrice] = useState(null);

  // Chart refs — always valid since panels never unmount
  const combRef = useRef(null);
  const wsRef = useRef(null);
  const lastC = useRef(null);
  const lastP = useRef(null);
  const lastComb = useRef(null); // Accurate H/L tracker for combined
  const callSymRef = useRef('');
  const putSymRef = useRef('');
  const pollerRef = useRef(null);
  const offsetRef = useRef(0);
  const currentCandleTimer = useRef(null);
  const correctionTimerRef = useRef(null); // wall-clock based candle correction chain

  // ── Data Hub: stores ALL WebSocket streams for future use ──────────────
  const makeEmptySide = () => ({
    ticker: null,               // latest full v2/ticker snapshot
    greeks: null,               // { delta, gamma, vega, theta, rho, iv }
    markPrice: null,               // { price, timestamp }
    trades: [],                 // last 200 trades [ { price, size, side, ts } ]
    orderbook: { bids: [], asks: [] }, // latest L2 depth
  });
  const dataHubRef = useRef({ call: makeEmptySide(), put: makeEmptySide() });

  // Reactive Greeks for UI display (IV + Delta for Call)
  const [callGreeks, setCallGreeks] = useState(null);
  const [putGreeks, setPutGreeks] = useState(null);

  // Track what symbol the charts currently show
  const [activeCall, setActiveCall] = useState('');
  const [activePut, setActivePut] = useState('');

  useEffect(() => {
    if (setNavbarProps) {
      setNavbarProps({
        badgeLabel: wsStatus === 'live' ? 'Live Feed' : wsStatus === 'error' ? 'WS Error' : 'Disconnected',
        badgeDotClassName: wsStatus === 'live' ? 'live' : wsStatus === 'error' ? 'offline' : 'stale',
        extraHeaderContent: activeCall ? `${activeCall} / ${activePut}` : null
      });
    }
  }, [wsStatus, activeCall, activePut, setNavbarProps]);

  const [alertLogs, setAlertLogs] = useState([]);
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  // Per-watch-card "new alert" draft state ({ [itemId]: { dir, price } }).
  // Replaces the old hidden-DOM-input approach so the ≥/≤ selector is controlled.
  const [cardAlertDrafts, setCardAlertDrafts] = useState({});
  const [alertPopoverOpen, setAlertPopoverOpen] = useState(false);

  const triggeredAlerts = useRef(new Set());
  // Combined-IV overlay persistence: IV comes only from live ticks (no REST
  // history), so we cache the streamed points per strategy and re-seed on load.
  const ivHistRef = useRef([]);
  const ivKeyRef = useRef(null);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = 'alert') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);

    if (type === 'alert') {
      const logId = uid();
      const ts = Date.now();
      setAlertLogs(prev => [{
        id: logId,
        time: new Date(ts).toLocaleTimeString(),
        msg
      }, ...prev].slice(0, 50));
      setUnreadAlerts(n => n + 1);
      // Persist to the server-side alert history so it survives refresh.
      fetch('/api/alert-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: logId, createdAt: ts, type: 'alert', message: msg }),
      }).catch(() => { });
    }

    setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
    }, 8000);
  }, []);

  const listWsRef = useRef(null);
  const tickerCacheRef = useRef({}); // { [sym]: price }

  const greekCacheRef = useRef({}); // { [sym]: greeks }

  useEffect(() => {
    if (!watchList.length) {
      if (listWsRef.current) { listWsRef.current.close(); listWsRef.current = null; }
      return;
    }

    const syms = new Set();
    watchList.forEach(w => {
      if (w.callSym) syms.add(w.callSym);
      if (w.putSym) syms.add(w.putSym);
    });

    if (listWsRef.current) listWsRef.current.close();

    const ws = new WebSocket('wss://socket.india.delta.exchange');
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { channels: [{ name: 'v2/ticker', symbols: Array.from(syms) }] }
      }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'v2/ticker') {
        const sym = msg.symbol;
        const mark = parseFloat(msg.mark_price || 0);
        const ltp = parseFloat(msg.last_price || msg.close || 0);
        if (!mark && !ltp) return;
        const prevCache = tickerCacheRef.current[sym] || { mark: 0, ltp: 0 };
        tickerCacheRef.current[sym] = {
          mark: mark || prevCache.mark,
          ltp: ltp || prevCache.ltp
        };

        if (msg.greeks) {
          greekCacheRef.current[sym] = {
            delta: parseFloat(msg.greeks.delta || 0),
            gamma: parseFloat(msg.greeks.gamma || 0),
            vega: parseFloat(msg.greeks.vega || 0),
            theta: parseFloat(msg.greeks.theta || 0),
            rho: parseFloat(msg.greeks.rho || 0),
            iv: parseFloat(msg.mark_vol ?? msg.quotes?.mark_iv ?? msg.greeks?.iv ?? 0),
          };
        }

        setListData(prev => {
          let changed = false;
          const next = { ...prev };
          watchList.forEach(w => {
            const pcCache = tickerCacheRef.current[w.callSym] || { mark: 0, ltp: 0 };
            const ppCache = tickerCacheRef.current[w.putSym] || { mark: 0, ltp: 0 };
            const pC = w.priceType === 'ltp' ? (pcCache.ltp || pcCache.mark) : (pcCache.mark || pcCache.ltp);
            const pP = w.priceType === 'ltp' ? (ppCache.ltp || ppCache.mark) : (ppCache.mark || ppCache.ltp);

            const gC = greekCacheRef.current[w.callSym];
            const gP = greekCacheRef.current[w.putSym];

            let newPrice = 0;
            if (w.type === 'combined') newPrice = pC + pP;
            else if (w.type === 'call') newPrice = pC;
            else if (w.type === 'put') newPrice = pP;

            let newGreeks = null;
            if (w.type === 'combined') {
              if (gC && gP) {
                newGreeks = {
                  delta: gC.delta + gP.delta,
                  gamma: gC.gamma + gP.gamma,
                  vega: gC.vega + gP.vega,
                  theta: gC.theta + gP.theta,
                  rho: gC.rho + gP.rho,
                  iv: (gC.iv + gP.iv) / 2,
                  cDelta: gC.delta, pDelta: gP.delta,
                  cGamma: gC.gamma, pGamma: gP.gamma,
                  cVega: gC.vega, pVega: gP.vega,
                  cTheta: gC.theta, pTheta: gP.theta,
                  cRho: gC.rho, pRho: gP.rho,
                  cIv: gC.iv, pIv: gP.iv
                };
              }
            } else if (w.type === 'call') {
              if (gC) newGreeks = gC;
            } else if (w.type === 'put') {
              if (gP) newGreeks = gP;
            }

            const old = prev[w.id] || { price: 0, high: 0, low: Infinity, greeks: null };
            const priceChanged = old.price !== newPrice && newPrice !== 0 && (w.type === 'combined' ? (pC && pP) : true);
            const greeksChanged = JSON.stringify(old.greeks) !== JSON.stringify(newGreeks);

            if (priceChanged || greeksChanged) {
              changed = true;
              let newHigh = Math.max(old.high, newPrice);
              let newLow = old.low === Infinity || old.low === 0 ? newPrice : Math.min(old.low, newPrice);
              next[w.id] = { ...old, price: newPrice, high: newHigh, low: newLow, greeks: newGreeks };

              if (priceChanged) {
                (w.alerts || []).forEach(alertObj => {
                  if (!alertObj.price) return;
                  const target = parseFloat(alertObj.price);
                  const alertId = `${w.id}-${alertObj.id}`;
                  const triggered = alertObj.dir === '>=' ? newPrice >= target : newPrice <= target;

                  if (triggered && !triggeredAlerts.current.has(alertId)) {
                    triggeredAlerts.current.add(alertId);
                    playAlertSound();
                    const name = w.type === 'combined' ? `STRADDLE ${w.callStrike}/${w.putStrike}`
                      : w.type === 'call' ? `CALL ${w.callStrike}C`
                        : `PUT ${w.putStrike}P`;
                    addToast(`${name} ${alertObj.dir} ${target} · hit ${newPrice.toFixed(2)}`);

                    // Auto-remove triggered alert
                    setWatchList(prevW => prevW.map(item =>
                      item.id === w.id ? { ...item, alerts: (item.alerts || []).filter(a => a.id !== alertObj.id) } : item
                    ));
                  } else if (!triggered) {
                    triggeredAlerts.current.delete(alertId);
                  }
                });
              }
            }
          });
          return changed ? next : prev;
        });
      }
    };
    listWsRef.current = ws;
    return () => ws.close();
  }, [watchList, addToast]);


  // ── Notification Permissions ──────────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);



  // ── Load products on underlying change ───────────────────────────────────
  useEffect(() => {
    setExpiries([]); setStrikes([]);
    setSelExpiry(''); setSelCallStrike(''); setSelPutStrike(''); setCallSym(''); setPutSym('');
    setErrMsg('');

    loadProducts(underlying)
      .then(prods => {
        setProducts(prods);
        const exps = getExpiries(prods);
        setExpiries(exps);
        if (exps.length) setSelExpiry(exps[0]);
      })
      .catch(e => setErrMsg('Failed to load products: ' + e.message));
  }, [underlying]);

  // ── Load strikes on expiry change ─────────────────────────────────────────
  useEffect(() => {
    if (!selExpiry || !products.length) return;
    const ss = getStrikes(products, selExpiry);
    setStrikes(ss);
    if (!ss.length) return;
    getSpotPrice(underlying)
      .then(spot => {
        const atm = findATM(ss, spot);
        setSelCallStrike(atm);
        setSelPutStrike(atm);
      })
      .catch(() => {
        setSelCallStrike(ss[0]);
        setSelPutStrike(ss[0]);
      });
  }, [selExpiry, products, underlying]);

  // ── Fetch spot price ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSpot = () => {
      getSpotPrice(underlying)
        .then(sp => { if (sp) setSpotPrice(sp); })
        .catch(() => { });
    };
    fetchSpot();
    const interval = setInterval(fetchSpot, 10000);
    return () => clearInterval(interval);
  }, [underlying]);

  // ── Derive symbols ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selExpiry || !products.length) { setCallSym(''); setPutSym(''); return; }

    if (selCallStrike) {
      const callProd = products.find(p =>
        p.settlement_time === selExpiry &&
        parseFloat(p.strike_price) === parseFloat(selCallStrike)
      );
      setCallSym(callProd?.symbol || '');
    } else setCallSym('');

    if (selPutStrike) {
      const putProd = products.find(p =>
        p.settlement_time === selExpiry &&
        parseFloat(p.strike_price) === parseFloat(selPutStrike)
      );
      setPutSym(putProd ? putSymbol(putProd.symbol) : '');
    } else setPutSym('');
  }, [selExpiry, selCallStrike, selPutStrike, products]);

  // ── Imperative combine update ─────────────────────────────────────────────
  const updateComb = useCallback((c, p) => {
    if (!c || !p) return;

    // At candle boundaries, call and put may temporarily have different timestamps.
    // Use the OLDER timestamp to keep the combined chart stable until both legs
    // have transitioned to the new bucket.
    const time = Math.min(c.time, p.time);

    // If the two legs are in different buckets, use the old bucket's close
    // from whichever leg has already rolled over, to avoid a spike.
    let cClose = c.close, pClose = p.close;
    if (c.time !== p.time) {
      // One leg jumped to a new candle while the other is still on the old one.
      // Use the close from both legs' perspective at the shared (older) time.
      // The leg that's ahead just opened, so its open ≈ its close — that's fine.
      // We just don't create a new candle until both legs agree.
      cClose = c.time === time ? c.close : c.open;  // if c jumped ahead, use its open (≈ previous close)
      pClose = p.time === time ? p.close : p.open;
    }

    const combinedPrice = cClose + pClose;

    let current = lastComb.current;

    if (!current || time > current.time) {
      // New bucket started or first data
      current = {
        time: time,
        open: combinedPrice,
        high: combinedPrice,
        low: combinedPrice,
        close: combinedPrice,
        callIv: c.callIv,
        putIv: p.putIv
      };
    } else {
      // Existing bucket - update close and expand H/L based on THIS tick
      current = {
        ...current,
        close: combinedPrice,
        callIv: c.callIv,
        putIv: p.putIv
      };
      if (combinedPrice > current.high) current.high = combinedPrice;
      if (combinedPrice < current.low) current.low = combinedPrice;
    }

    lastComb.current = current;
    combRef.current?.update(current);

    // Accumulate the combined-IV point (call+put per candle). IV is live-only
    // — absent from REST history — so we buffer it and flush to the DB.
    if (current.callIv != null && current.putIv != null && !isNaN(current.callIv + current.putIv)) {
      const hist = ivHistRef.current;
      const last = hist[hist.length - 1];
      if (last && last.t === current.time) { last.callIv = current.callIv; last.putIv = current.putIv; }
      else hist.push({ t: current.time, callIv: current.callIv, putIv: current.putIv });
      if (hist.length > 800) hist.shift();
    }
  }, []);
  // ── START MONITORING ──────────────────────────────────────────────────────
  const startMonitoring = useCallback(async () => {
    const item = watchListRef.current.find(w => w.id === selectedWatchId);
    if (!item) return;

    const cSym = item.callSym || '';
    const pSym = item.putSym || '';
    const pType = item.priceType || priceType;

    if (!cSym && !pSym) { setErrMsg('Select valid strikes first.'); return; }

    // Kill existing WS
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (pollerRef.current) clearInterval(pollerRef.current);

    callSymRef.current = cSym;
    putSymRef.current = pSym;

    setErrMsg('');
    setPhase('loading');
    setCallPrice(null);
    setPutPrice(null);
    setCallGreeks(null);
    setPutGreeks(null);
    dataHubRef.current = { call: makeEmptySide(), put: makeEmptySide() };
    lastC.current = null;
    lastP.current = null;
    lastComb.current = null;

    const now = Math.floor(Date.now() / 1000);
    // Rough estimate of start time, relying on the API to limit to available data
    const start = now - 604800 * 2; // fetch enough back for CANDLE_COUNT

    try {
      console.log(`Fetching: ${cSym} / ${pSym} @ ${tf} (${pType})`);
      const [cCandles, pCandles] = await Promise.all([
        cSym ? fetchCandles(cSym, tf, start, now, pType) : Promise.resolve([]),
        pSym ? fetchCandles(pSym, tf, start, now, pType) : Promise.resolve([]),
      ]);
      console.log(`Candles: call=${cCandles.length} put=${pCandles.length}`);

      // Push data directly — charts are already mounted
      combRef.current?.clearIvData();

      combRef.current?.setData(sumCandles(cCandles, pCandles), true);

      // Restore the combined-IV overlay from the DB (IV has no REST history),
      // then live ticks continue appending to it.
      try {
        const ivKey = `${selectedWatchId}_${tf}_${priceType}`;
        const res = await fetch(`/api/iv-history?key=${encodeURIComponent(ivKey)}`, { credentials: 'include' });
        const data = res.ok ? await res.json() : null;
        const pts = Array.isArray(data?.points) ? data.points : [];
        ivHistRef.current = pts;
        if (pts.length) {
          combRef.current?.seedIv(pts.map(p => ({ time: p.t, value: (p.callIv || 0) + (p.putIv || 0) })));
        }
      } catch { ivHistRef.current = []; }

      setActiveCall(cSym);
      setActivePut(pSym);
      setPhase('ready');

      if (cCandles.length) { lastC.current = cCandles.at(-1); setCallPrice(cCandles.at(-1).close); }
      if (pCandles.length) { lastP.current = pCandles.at(-1); setPutPrice(pCandles.at(-1).close); }

      const bucketSecs = TF_SECS[tf] || 60;

      // ── Helper: refresh only CLOSED candles from REST ──────────────────────
      // Never overwrites the live candle — the WS-driven updateComb tracks
      // accurate tick-by-tick combined OHLC. REST's sumCandles gives incorrect
      // H/L (callHigh + putHigh ≠ combinedHigh) because peaks occur at
      // different times, so we must protect the live candle from it.
      const refreshCurrentCandle = async () => {
        try {
          const nowSec = Math.floor(Date.now() / 1000);
          const bSecs = TF_SECS[tf] || 60;
          const currentBucket = Math.floor(nowSec / bSecs) * bSecs;
          const startTs = Math.max(0, nowSec - bSecs * 3);

          const [cc, pc] = await Promise.all([
            cSym ? fetchCandles(cSym, tf, startTs, nowSec + 1, pType) : Promise.resolve([]),
            pSym ? fetchCandles(pSym, tf, startTs, nowSec + 1, pType) : Promise.resolve([]),
          ]);

          // Update lastC/lastP refs for the WS candle builder
          if (cc?.length) {
            const latestC = cc[cc.length - 1];
            if (!lastC.current || latestC.time >= lastC.current.time) {
              lastC.current = latestC;
            }
          }
          if (pc?.length) {
            const latestP = pc[pc.length - 1];
            if (!lastP.current || latestP.time >= lastP.current.time) {
              lastP.current = latestP;
            }
          }

          // Only update CLOSED candles on the chart — skip the live bucket
          const comb = sumCandles(cc, pc);
          comb.forEach(c => {
            if (c.time < currentBucket) {
              combRef.current?.update(c);
            }
            // Live candle (c.time >= currentBucket) is managed by WS updateComb
          });
        } catch (err) { console.warn('refreshCurrentCandle failed:', err); }
      };

      // ── Helper: completely refresh history when a candle closes ───────────
      // Replaces all CLOSED candles with official REST data, then appends the
      // current live candle from lastComb.current to keep it smooth.
      const refreshAllHistory = async () => {
        try {
          const nowSec = Math.floor(Date.now() / 1000);
          const bSecs = TF_SECS[tf] || 60;
          const currentBucket = Math.floor(nowSec / bSecs) * bSecs;
          // Match startMonitoring's lookback exactly to prevent array size mismatch (which causes vacant canvas on setData)
          const startTs = nowSec - 604800 * 2;

          const [cc, pc] = await Promise.all([
            cSym ? fetchCandles(cSym, tf, startTs, nowSec + 1, pType) : Promise.resolve([]),
            pSym ? fetchCandles(pSym, tf, startTs, nowSec + 1, pType) : Promise.resolve([]),
          ]);

          if (cc?.length) {
            lastC.current = cc[cc.length - 1];
            setCallPrice(lastC.current.close);
          }
          if (pc?.length) {
            lastP.current = pc[pc.length - 1];
            setPutPrice(lastP.current.close);
          }

          const comb = sumCandles(cc, pc);
          if (comb.length) {
            // Split: closed candles from REST + live candle from WS tracker
            const closedCandles = comb.filter(c => c.time < currentBucket);
            const finalData = [...closedCandles];

            // Preserve the WS-tracked live candle (accurate combined H/L)
            if (lastComb.current && lastComb.current.time >= currentBucket) {
              finalData.push(lastComb.current);
            } else {
              // Fallback: if WS hasn't started the live candle yet, use REST's
              const restLive = comb.find(c => c.time >= currentBucket);
              if (restLive) finalData.push(restLive);
            }

            // Atomic replacement — preserves scroll position
            combRef.current?.setData(finalData, false);

            // ── Alert Engine (EVALUATES ONLY ON OFFICIALLY CLOSED CANDLES) ──
            const closedComb = [...closedCandles].reverse()[0]; // most recent closed

            if (closedComb) {
              const activeItem = watchListRef.current.find(w => w.id === selectedWatchId);
              const alerts = (activeItem?.alerts || []);
              alerts.forEach(alertObj => {
                if (!alertObj.price) return;
                const target = parseFloat(alertObj.price);
                const alertId = `comb-${alertObj.id}`;
                const isTriggered = alertObj.dir === '>=' ? closedComb.close >= target : closedComb.close <= target;

                if (isTriggered && !triggeredAlerts.current.has(alertId)) {
                  triggeredAlerts.current.add(alertId);
                  playAlertSound();
                  const title = formatCombinedTitle(cSym, pSym, pType);
                  const msg = `${title} confirmed crossing at close! Price: ${closedComb.close.toFixed(2)} (${alertObj.dir} ${target})`;
                  if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Crypto Scanner Alert', { body: msg });
                  }
                  addToast(msg);

                  // Auto-remove triggered alert
                  setWatchList(prev => prev.map(w =>
                    w.id === selectedWatchId ? { ...w, alerts: w.alerts.filter(a => a.id !== alertObj.id) } : w
                  ));
                } else if (!isTriggered) {
                  triggeredAlerts.current.delete(alertId);
                }
              });
            }
          }
          console.log(`[AutoCorrect] Full history refreshed perfectly.`);
        } catch (err) { console.warn('refreshAllHistory failed:', err); }
      };

      // ── Wall-clock candle correction scheduler ────────────────────────────
      // Fires precisely when each candle closes (regardless of ticker activity).
      // Waits 15s for REST to settle, then replaces the closed candle with
      // official exchange data — exactly like clicking Start Monitoring again.
      const scheduleCandleCorrections = () => {
        if (correctionTimerRef.current) clearTimeout(correctionTimerRef.current);

        const nowSec = Math.floor(Date.now() / 1000);
        const anchor = lastC.current?.time ?? Math.floor(nowSec / bucketSecs) * bucketSecs;
        const currentBucket = anchor + Math.floor((nowSec - anchor) / bucketSecs) * bucketSecs;
        const nextBoundary = currentBucket + bucketSecs;          // when current candle closes
        const msUntilClose = Math.max(0, (nextBoundary - nowSec) * 1000);
        const SETTLE_MS = 15000; // wait 15s after close for REST to finalise

        correctionTimerRef.current = setTimeout(async () => {
          // Fetch and replace the entire chart with official REST data
          console.log(`[AutoCorrect] Triggering full refresh to correct closed candle...`);
          await refreshAllHistory();
          // Chain: schedule correction for the NEXT candle
          scheduleCandleCorrections();
        }, msUntilClose + SETTLE_MS);

        console.log(`[AutoCorrect] Next correction in ${Math.round((msUntilClose + SETTLE_MS) / 1000)}s (candle closes in ${Math.round(msUntilClose / 1000)}s)`);
      };

      // Kick off the correction chain
      scheduleCandleCorrections();

      // Start the current-candle refresh interval (every 5 seconds)
      if (currentCandleTimer.current) clearInterval(currentCandleTimer.current);
      currentCandleTimer.current = setInterval(refreshCurrentCandle, 5000);

      // ── WebSocket: ticker updates Close price in real-time (zero latency) ──
      // ── Debounced correction: both call and put may fire new-candle events
      // within milliseconds of each other — debounce so only one REST fetch runs.
      let correctionDebounce = null;
      const correctClosedCandle = () => {
        if (correctionDebounce) clearTimeout(correctionDebounce);
        correctionDebounce = setTimeout(() => {
          correctionDebounce = null;
          refreshAllHistory();
        }, 2000); // wait 2s for both legs to roll over before fetching
      };

      wsRef.current = createWS(
        cSym, pSym, tf, pType,
        (sym, price, _ts, iv) => {
          // Use exchange timestamp if available, fallback to wall-clock
          const nowSec = _ts || Math.floor(Date.now() / 1000);
          const anchor = lastC.current?.time ?? lastP.current?.time ?? Math.floor(nowSec / bucketSecs) * bucketSecs;
          const currentBucket = anchor + Math.floor((nowSec - anchor) / bucketSecs) * bucketSecs;

          if (sym === callSymRef.current) {
            setCallPrice(price);
            if (!lastC.current || currentBucket > lastC.current.time) {
              const prevTime = lastC.current?.time;
              const newC = { time: currentBucket, open: price, high: price, low: price, close: price, callIv: iv };
              lastC.current = newC;
              if (lastP.current) updateComb(newC, lastP.current);
              if (prevTime) correctClosedCandle();
            } else {
              const upd = { ...lastC.current, close: price, callIv: iv };
              if (price > upd.high) upd.high = price;
              if (price < upd.low) upd.low = price;
              lastC.current = upd;
              if (lastP.current) updateComb(upd, lastP.current);
            }
          }
          if (sym === putSymRef.current) {
            setPutPrice(price);
            if (!lastP.current || currentBucket > lastP.current.time) {
              const prevTime = lastP.current?.time;
              const newP = { time: currentBucket, open: price, high: price, low: price, close: price, putIv: iv };
              lastP.current = newP;
              if (lastC.current) updateComb(lastC.current, newP);
              if (prevTime) correctClosedCandle();
            } else {
              const upd = { ...lastP.current, close: price, putIv: iv };
              if (price > upd.high) upd.high = price;
              if (price < upd.low) upd.low = price;
              lastP.current = upd;
              if (lastC.current) updateComb(lastC.current, upd);
            }
          }
        },
        // ── Data Hub: extract and store ALL WebSocket streams ──────────────
        (msg) => {
          const sym = msg.symbol;

          // ── Master Sync: Update global caches from the active stream ────────
          if (msg.type === 'v2/ticker') {
            const mark = parseFloat(msg.mark_price || 0);
            const ltp = parseFloat(msg.last_price || msg.close || 0);
            if (mark || ltp) {
              const prev = tickerCacheRef.current[sym] || { mark: 0, ltp: 0 };
              tickerCacheRef.current[sym] = { mark: mark || prev.mark, ltp: ltp || prev.ltp };
            }
            if (msg.greeks) {
              greekCacheRef.current[sym] = {
                delta: parseFloat(msg.greeks.delta || 0),
                gamma: parseFloat(msg.greeks.gamma || 0),
                vega: parseFloat(msg.greeks.vega || 0),
                theta: parseFloat(msg.greeks.theta || 0),
                rho: parseFloat(msg.greeks.rho || 0),
                iv: parseFloat(msg.mark_vol ?? msg.quotes?.mark_iv ?? msg.greeks?.iv ?? 0),
              };
            }
          }

          const side = sym === callSymRef.current ? 'call'
            : sym === putSymRef.current ? 'put'
              : null;

          // ── v2/ticker: full snapshot including Greeks + OI + quotes ──
          if (msg.type === 'v2/ticker') {
            if (side) {
              dataHubRef.current[side].ticker = msg;
              // Extract Greeks (only present for options)
              if (msg.greeks) {
                const g = {
                  delta: parseFloat(msg.greeks.delta || 0),
                  gamma: parseFloat(msg.greeks.gamma || 0),
                  vega: parseFloat(msg.greeks.vega || 0),
                  theta: parseFloat(msg.greeks.theta || 0),
                  rho: parseFloat(msg.greeks.rho || 0),
                  iv: parseFloat(msg.mark_vol ?? msg.quotes?.mark_iv ?? msg.greeks?.iv ?? 0),
                };
                dataHubRef.current[side].greeks = g;
                if (side === 'call') setCallGreeks(g);
                else setPutGreeks(g);
              } else if (msg.mark_vol || msg.quotes?.mark_iv) {
                // Fallback: update only IV if greeks object is missing
                const iv = parseFloat(msg.mark_vol ?? msg.quotes?.mark_iv ?? 0);
                const prev = dataHubRef.current[side].greeks || {};
                const g = { ...prev, iv };
                dataHubRef.current[side].greeks = g;
                if (side === 'call') setCallGreeks(g);
                else setPutGreeks(g);
              }
            }
          }

          // ── trades: public trade tape ─────────────────────────────────
          if (msg.type === 'trades' && Array.isArray(msg.trades)) {
            if (side) {
              const parsed = msg.trades.map(t => ({
                price: parseFloat(t.price),
                size: parseFloat(t.size),
                side: t.buyer_role === 'taker' ? 'buy' : 'sell',
                ts: parseInt(t.created_at ?? t.timestamp ?? 0),
              }));
              dataHubRef.current[side].trades = [
                ...parsed,
                ...dataHubRef.current[side].trades,
              ].slice(0, 200); // keep last 200 trades
            }
          }

          // ── l2_updates: incremental orderbook depth ───────────────────
          if (msg.type === 'l2_updates' && side) {
            const ob = dataHubRef.current[side].orderbook;
            // Delta sends full snapshot on first message, then increments
            if (msg.buy) ob.bids = msg.buy;   // array of { limit_price, size }
            if (msg.sell) ob.asks = msg.sell;
          }

          // ── mark_price: dedicated mark price stream ───────────────────
          if (msg.type === 'mark_price' && side) {
            dataHubRef.current[side].markPrice = {
              price: parseFloat(msg.price),
              ts: msg.timestamp ? Math.floor(parseInt(msg.timestamp) / 1000000) : Math.floor(Date.now() / 1000),
            };
          }
        },
        (status) => setWsStatus(status),
      );

    } catch (e) {
      console.error('startMonitoring:', e);
      setErrMsg('Error: ' + e.message);
      setPhase('idle');
    }
  }, [selectedWatchId, tf, priceType, updateComb, addToast, userKey]);

  // Trigger startMonitoring whenever selectedWatchId changes
  useEffect(() => {
    if (selectedWatchId) {
      startMonitoring();
    } else {
      setPhase('idle');
      combRef.current?.clearData();
      combRef.current?.clearIvData();
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    }
  }, [selectedWatchId, startMonitoring]);

  useEffect(() => () => {
    wsRef.current?.close();
    if (currentCandleTimer.current) clearInterval(currentCandleTimer.current);
  }, []);

  const combPrice = (callPrice && putPrice) ? (callPrice + putPrice).toFixed(2) : '—';

  // ── Rolling premium history for context-bar sparklines ───────────────
  const premHistRef = useRef({ call: [], put: [], comb: [] });
  useEffect(() => { premHistRef.current = { call: [], put: [], comb: [] }; }, [selectedWatchId, underlying]);

  // Server-side key for the persisted combined-IV overlay (per strategy + tf +
  // price type). The user is scoped by session on the server, not in the key.
  useEffect(() => {
    ivKeyRef.current = selectedWatchId ? `${selectedWatchId}_${tf}_${priceType}` : null;
  }, [selectedWatchId, tf, priceType]);

  // Flush accumulated IV points to the DB on an interval + when the tab hides.
  useEffect(() => {
    const flush = (keepalive = false) => {
      const key = ivKeyRef.current;
      const points = ivHistRef.current;
      if (!key || !points.length) return;
      fetch('/api/iv-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive,
        body: JSON.stringify({ key, points }),
      }).catch(() => { });
    };
    const timer = setInterval(() => flush(false), 20000);
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(true); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', () => flush(true));
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onHidden); flush(false); };
  }, []);

  // Load persisted alert history (server-side) once the session key is known.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    fetch('/api/alert-history', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d?.logs) return;
        setAlertLogs(d.logs.map(l => ({ id: l.id, time: new Date(l.time).toLocaleTimeString(), msg: l.msg })));
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [isLoaded, userKey]);
  useEffect(() => {
    const push = (arr, v) => { if (v == null || isNaN(v)) return; arr.push(v); if (arr.length > 40) arr.shift(); };
    const h = premHistRef.current;
    push(h.call, callPrice || null);
    push(h.put, putPrice || null);
    push(h.comb, (callPrice && putPrice) ? callPrice + putPrice : null);
  }, [callPrice, putPrice]);

  // Tiny inline sparkline from a value series
  const spark = (data, color) => {
    if (!data || data.length < 2) return <div style={{ height: 14 }} />;
    const w = 46, h = 14;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 1 - ((v - min) / range) * (h - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return (
      <svg width={w} height={h} style={{ display: 'block', marginTop: 2 }} aria-hidden="true">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      </svg>
    );
  };

  // ── Selected strategy summary for the chart context bar ──────────────
  const selectedItem = watchList.find(w => w.id === selectedWatchId) || null;
  let selData = null, selGreeks = null;
  if (selectedItem) {
    const base = listData[selectedItem.id] || { price: 0, high: 0, low: Infinity };
    let cp = 0, ch = 0, cl = Infinity, g = null;
    if (selectedItem.type === 'combined') {
      if (lastComb.current) { cp = lastComb.current.close; ch = lastComb.current.high; cl = lastComb.current.low; }
      if (callGreeks && putGreeks) g = {
        delta: callGreeks.delta + putGreeks.delta, gamma: callGreeks.gamma + putGreeks.gamma,
        vega: callGreeks.vega + putGreeks.vega, theta: callGreeks.theta + putGreeks.theta,
        iv: (callGreeks.iv + putGreeks.iv) / 2
      };
    } else if (selectedItem.type === 'call') {
      if (lastC.current) { cp = lastC.current.close; ch = lastC.current.high; cl = lastC.current.low; }
      g = callGreeks;
    } else {
      if (lastP.current) { cp = lastP.current.close; ch = lastP.current.high; cl = lastP.current.low; }
      g = putGreeks;
    }
    selData = { price: cp > 0 ? cp : base.price, high: ch > 0 ? ch : base.high, low: cl < Infinity ? cl : base.low };
    selGreeks = g || base.greeks || null;
  }
  // Candle direction (close vs open) → premium change arrow
  const dirOf = (r) => (r?.current ? (r.current.close >= r.current.open ? 1 : -1) : 0);
  const addSelAlert = () => {
    if (!selectedItem) return;
    const d = cardAlertDrafts[selectedItem.id] || { dir: '>=', price: '' };
    if (!d.price) return;
    setWatchList(prev => prev.map(w => w.id === selectedItem.id ? { ...w, alerts: [...(w.alerts || []), { id: uid(), dir: d.dir, price: d.price }] } : w));
    setCardAlertDrafts(prev => ({ ...prev, [selectedItem.id]: { dir: d.dir, price: '' } }));
    addToast(`${d.dir} ${d.price}`, 'info');
  };

  return (
    <div className="app">
      <style dangerouslySetInnerHTML={{ __html: SIDEBAR_STYLE }} />
      {/* Toast Container */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
        {toasts.map(t => {
          const isInfo = t.type === 'info';
          return (
            <div key={t.id} style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 11,
              width: 300, padding: '12px 14px',
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 14px 34px -14px rgba(0,0,0,0.55)', animation: 'slideIn 0.25s ease-out',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0,
                color: isInfo ? 'var(--call)' : '#58a6ff',
                background: isInfo ? 'rgba(14,203,129,0.14)' : 'rgba(47,129,247,0.14)',
              }}>
                {isInfo ? <Check size={15} strokeWidth={2.5} /> : <Bell size={15} strokeWidth={2.5} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{isInfo ? 'Alert set' : 'Alert triggered'}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.45, marginTop: 2, overflowWrap: 'anywhere' }}>{t.msg}</div>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setToasts(list => list.filter(x => x.id !== t.id))}
                style={{
                  flexShrink: 0, marginTop: -2, marginRight: -4, background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', width: 20, height: 20, borderRadius: 5, padding: 0,
                }}
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="body">
        {/* Sidebar */}
        <aside className={`sidebar ${railCollapsed ? 'rail-collapsed' : ''}`}>
          <div className="sidebar-scroll">
          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isConfigCollapsed ? 0 : '10px' }}>
              <span className="card-title" style={{ margin: 0 }}>INSTRUMENT SETUP</span>
              <button
                className="scanner-filters-toggle-btn mobile-only-toggle"
                onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}
              >
                <span>{isConfigCollapsed ? 'SHOW' : 'HIDE'}</span>
                <ChevronDown
                  size={12}
                  strokeWidth={2.5}
                  style={{ transform: isConfigCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
                />
              </button>
            </div>

            <div className={`sidebar-collapsible ${isConfigCollapsed ? '' : 'expanded'}`} style={{ width: '100%', display: isConfigCollapsed ? 'none' : 'flex', flexDirection: 'column', gap: '12px', marginTop: isConfigCollapsed ? '0' : '12px' }}>

              <div className="config-section-label">Instrument</div>

              <div className="form-group">
                <label>Underlying</label>
                <div className="seg" role="tablist">
                  {UNDERLYINGS.map(u => (
                    <button
                      key={u}
                      type="button"
                      role="tab"
                      aria-selected={underlying === u}
                      className={underlying === u ? 'on' : ''}
                      onClick={() => setUnderlying(u)}
                    >
                      <span className="coin" data-coin={u}></span>{u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Expiry</label>
                <CustomSelect
                  value={selExpiry}
                  onChange={val => setSelExpiry(val)}
                  disabled={!expiries.length}
                  options={!expiries.length ? [{ label: 'Loading...', value: selExpiry }] : expiries.map(e => ({ label: fmtExpiry(e), value: e }))}
                />
              </div>

              <div className="config-divider" aria-hidden="true"></div>
              <div className="config-section-label">Legs</div>

              <div className="form-group" style={{ opacity: legType === 'put' ? 0.5 : 1 }}>
                <label>Call Strike</label>
                <CustomSelect
                  value={selCallStrike}
                  onChange={val => setSelCallStrike(val)}
                  disabled={!strikes.length || legType === 'put'}
                  options={!strikes.length ? [{ label: 'Select Expiry First', value: selCallStrike }] : strikes.map(s => ({ label: Number(s).toLocaleString(), value: s }))}
                />
              </div>

              <div className="form-group" style={{ opacity: legType === 'call' ? 0.5 : 1 }}>
                <label>Put Strike</label>
                <CustomSelect
                  value={selPutStrike}
                  onChange={val => setSelPutStrike(val)}
                  disabled={!strikes.length || legType === 'call'}
                  options={!strikes.length ? [{ label: 'Select Expiry First', value: selPutStrike }] : strikes.map(s => ({ label: Number(s).toLocaleString(), value: s }))}
                />
              </div>

              <div className="form-group">
                <label>Leg Structure</label>
                <CustomSelect
                  value={legType}
                  onChange={val => setLegType(val)}
                  options={[
                    { label: 'Straddle / Strangle (C+P)', value: 'combined' },
                    { label: 'Call Leg Only', value: 'call' },
                    { label: 'Put Leg Only', value: 'put' }
                  ]}
                />
              </div>

              <div className="config-divider" aria-hidden="true"></div>
              <div className="config-section-label">View</div>

              <div className="form-group">
                <label>Price Feed</label>
                <CustomSelect
                  value={priceType}
                  onChange={val => setPriceType(val)}
                  options={[
                    { label: 'Mark Price (Fair Value)', value: 'mark' },
                    { label: 'LTP (Last Traded)', value: 'ltp' }
                  ]}
                />
              </div>

              <div className="form-group">
                <label>Candle Timeframe</label>
                <CustomSelect
                  value={tf}
                  onChange={val => setTf(val)}
                  options={TF_LIST.map(t => ({ label: t, value: t }))}
                />
              </div>
            </div>
          </div>

          <button className="btn-start" disabled={(!callSym && !putSym) || (legType !== 'put' && !callSym) || (legType !== 'call' && !putSym)} onClick={addToWatchList} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            ADD TO WATCHLIST <Plus size={15} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          </button>

          {errMsg && <div style={{ color: '#f85149', fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>{errMsg}</div>}
          </div>

          <button
            type="button"
            className="sidebar-rail-toggle"
            onClick={() => setRailCollapsed(c => !c)}
            title={railCollapsed ? 'Expand builder' : 'Collapse builder'}
          >
            {railCollapsed
              ? <><ChevronsRight size={16} strokeWidth={2.5} /><span className="rail-vertical-label">BUILD</span></>
              : <><ChevronLeft size={14} strokeWidth={2.5} /><span className="rail-vertical-label">CLOSE</span></>}
          </button>
        </aside>

        {/* Chart area — charts ALWAYS mounted, overlay sits on top */}
        <main className="main" style={{ position: 'relative', padding: 12, gap: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, color: theme === 'dark' ? '#e6edf3' : '#1e2730', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Spot</span>
            <span style={{ color: '#2f81f7', marginLeft: 2 }}>{spotPrice ? spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</span>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Chart display timezone">
                <Clock size={14} strokeWidth={2} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                <CustomSelect
                  value={timezone}
                  onChange={val => setTimezone(val)}
                  options={TZ_OPTIONS}
                  style={{ width: 200 }}
                />
              </div>

              <button
                type="button"
                title="Alert signal log"
                onClick={() => { setAlertDrawerOpen(true); setUnreadAlerts(0); }}
                style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
                  background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)'
                }}
              >
                <Bell size={16} strokeWidth={2} />
                {unreadAlerts > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px',
                    borderRadius: 8, background: '#f85149', color: '#fff', fontSize: 9, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
                  }}>{unreadAlerts > 99 ? '99+' : unreadAlerts}</span>
                )}
              </button>
            </div>
          </div>

          {/* Strategy switcher — compact selectable chips (replaces stacked cards) */}
          <div className="strategy-switcher" style={{ flexShrink: 0, display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 6, zIndex: 11 }}>
            {watchList.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center', width: '100%' }}>
                No positions tracked. Build a strategy from the sidebar and click ADD TO WATCHLIST.
              </div>
            ) : (
              watchList.map(item => {
                const d = listData[item.id] || { price: 0 };
                const isSel = selectedWatchId === item.id;
                const label = item.type === 'combined' ? `${item.callStrike}C+${item.putStrike}P` : item.type === 'call' ? `${item.callStrike}C` : `${item.putStrike}P`;
                const badgeClass = item.type === 'combined' ? 'comb' : item.type;
                const badgeText = item.type === 'combined' ? 'STRADDLE' : item.type.toUpperCase();
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedWatchId(item.id)}
                    className={`strategy-chip ${isSel ? 'on' : ''}`}
                    title={label}
                  >
                    <span className={`badge ${badgeClass}`}>{badgeText}</span>
                    <span className="strategy-chip-label">{label}</span>
                    <span className="strategy-chip-live">{d.price > 0 ? d.price.toFixed(2) : '—'}</span>
                    <span
                      className="strategy-chip-x"
                      title="Remove strategy"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWatchList(prev => prev.filter(w => w.id !== item.id));
                        setListData(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                        if (selectedWatchId === item.id) setSelectedWatchId(null);
                      }}
                    >
                      <X size={13} strokeWidth={2.5} />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Chart context bar — selected strategy's premiums, greeks & alerts */}
          {selectedItem && (
            <div className="chart-context-bar">
              <div className="ctx-id">
                <span className={`badge ${selectedItem.type === 'combined' ? 'comb' : selectedItem.type}`}>
                  {selectedItem.type === 'combined' ? 'STRADDLE' : selectedItem.type.toUpperCase()}
                </span>
                <span className="ctx-name">
                  {selectedItem.type === 'combined'
                    ? `${selectedItem.callStrike}C + ${selectedItem.putStrike}P`
                    : selectedItem.type === 'call' ? `${selectedItem.callStrike}C` : `${selectedItem.putStrike}P`}
                </span>
                <span className="ctx-exp">{fmtExpiry(selectedItem.expiry)}</span>
              </div>

              <div className="ctx-scroll">
                {selectedItem.type === 'combined' && (
                  <div className="ctx-stat">
                    <span className="ctx-lbl">Straddle</span>
                    <span className="ctx-val" style={{ color: combPrice === '—' ? 'var(--text-dim)' : dirOf(lastComb) >= 0 ? 'var(--call)' : 'var(--put)' }}>
                      {combPrice}{combPrice !== '—' ? (dirOf(lastComb) >= 0 ? ' ▲' : ' ▼') : ''}
                    </span>
                    {spark(premHistRef.current.comb, dirOf(lastComb) >= 0 ? '#3fb950' : '#f85149')}
                  </div>
                )}
                {selectedItem.type !== 'put' && (
                  <div className="ctx-stat">
                    <span className="ctx-lbl">Call</span>
                    <span className="ctx-val" style={{ color: !callPrice ? 'var(--text-dim)' : dirOf(lastC) >= 0 ? 'var(--call)' : 'var(--put)' }}>
                      {callPrice ? callPrice.toFixed(2) : '—'}{callPrice ? (dirOf(lastC) >= 0 ? ' ▲' : ' ▼') : ''}
                    </span>
                    {spark(premHistRef.current.call, dirOf(lastC) >= 0 ? '#3fb950' : '#f85149')}
                  </div>
                )}
                {selectedItem.type !== 'call' && (
                  <div className="ctx-stat">
                    <span className="ctx-lbl">Put</span>
                    <span className="ctx-val" style={{ color: !putPrice ? 'var(--text-dim)' : dirOf(lastP) >= 0 ? 'var(--call)' : 'var(--put)' }}>
                      {putPrice ? putPrice.toFixed(2) : '—'}{putPrice ? (dirOf(lastP) >= 0 ? ' ▲' : ' ▼') : ''}
                    </span>
                    {spark(premHistRef.current.put, dirOf(lastP) >= 0 ? '#3fb950' : '#f85149')}
                  </div>
                )}

                <span className="ctx-div" />

                <div className="ctx-stat"><span className="ctx-lbl">1H Hi</span><span className="ctx-val" style={{ color: 'var(--call)' }}>{selData?.high > 0 ? selData.high.toFixed(2) : '—'}</span></div>
                <div className="ctx-stat"><span className="ctx-lbl">1H Lo</span><span className="ctx-val" style={{ color: 'var(--put)' }}>{selData?.low < Infinity && selData?.low > 0 ? selData.low.toFixed(2) : '—'}</span></div>

                <span className="ctx-div" />

                <div className="ctx-stat"><span className="ctx-lbl">Delta</span><span className="ctx-val g">{selGreeks?.delta != null ? selGreeks.delta.toFixed(4) : '—'}</span></div>
                <div className="ctx-stat"><span className="ctx-lbl">Gamma</span><span className="ctx-val g">{selGreeks?.gamma != null ? selGreeks.gamma.toFixed(5) : '—'}</span></div>
                <div className="ctx-stat"><span className="ctx-lbl">Vega</span><span className="ctx-val g">{selGreeks?.vega != null ? selGreeks.vega.toFixed(2) : '—'}</span></div>
                <div className="ctx-stat"><span className="ctx-lbl">Theta</span><span className="ctx-val g">{selGreeks?.theta != null ? selGreeks.theta.toFixed(2) : '—'}</span></div>
                <div className="ctx-stat"><span className="ctx-lbl">IV</span><span className="ctx-val g">{selGreeks?.iv != null ? (selGreeks.iv * 100).toFixed(1) + '%' : '—'}</span></div>
              </div>

              <div className="ctx-actions">
                {selectedItem.alerts?.length > 0 && (
                  <div className="ctx-alert-pills">
                    {selectedItem.alerts.map(a => (
                      <span key={a.id} className="ctx-alert-pill" style={{ color: a.dir === '>=' ? 'var(--call)' : 'var(--put)', borderColor: a.dir === '>=' ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)' }}>
                        {a.dir} {parseFloat(a.price).toFixed(2)}
                        <span className="alert-delete-icon" style={{ cursor: 'pointer', display: 'inline-flex', opacity: 0.6, marginLeft: 2 }}
                          onClick={() => setWatchList(prev => prev.map(w => w.id === selectedItem.id ? { ...w, alerts: w.alerts.filter(x => x.id !== a.id) } : w))}>
                          <X size={12} strokeWidth={2.5} />
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <button type="button" className={`ctx-add-alert ${alertPopoverOpen ? 'on' : ''}`} onClick={() => setAlertPopoverOpen(o => !o)}>
                    <Bell size={12} strokeWidth={2.5} /> Alert
                  </button>
                  {alertPopoverOpen && (
                    <div className="ctx-alert-popover">
                      <button type="button" title="Toggle ≥ / ≤"
                        onClick={() => setCardAlertDrafts(prev => { const cur = prev[selectedItem.id]?.dir || '>='; return { ...prev, [selectedItem.id]: { dir: cur === '>=' ? '<=' : '>=', price: prev[selectedItem.id]?.price || '' } }; })}
                        style={{
                          minWidth: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          background: (cardAlertDrafts[selectedItem.id]?.dir || '>=') === '>=' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
                          border: `1px solid ${(cardAlertDrafts[selectedItem.id]?.dir || '>=') === '>=' ? 'rgba(63,185,80,0.4)' : 'rgba(248,81,73,0.4)'}`,
                          color: (cardAlertDrafts[selectedItem.id]?.dir || '>=') === '>=' ? '#3fb950' : '#f85149',
                          fontWeight: 700, fontSize: 14, borderRadius: 6, cursor: 'pointer'
                        }}>
                        {(cardAlertDrafts[selectedItem.id]?.dir || '>=') === '>=' ? '≥' : '≤'}
                      </button>
                      <CustomInput type="number" placeholder="Alert price"
                        value={cardAlertDrafts[selectedItem.id]?.price || ''}
                        onChange={e => { const v = e.target.value; setCardAlertDrafts(prev => ({ ...prev, [selectedItem.id]: { dir: prev[selectedItem.id]?.dir || '>=', price: v } })); }}
                        onKeyDown={e => { if (e.key === 'Enter') addSelAlert(); }}
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', width: 90, fontSize: 12, fontFamily: 'JetBrains Mono', borderRadius: 6, padding: '5px 8px' }} />
                      <button type="button" onClick={addSelAlert}
                        style={{ background: '#238636', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Idle/Loading overlay — rendered as a flex container taking remaining space */}
          {(phase === 'idle' || phase === 'loading') && (
            <div style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: theme === 'dark' ? 'rgba(10,13,18,0.96)' : 'rgba(255,255,255,0.96)',
              borderRadius: 8, border: '1px solid var(--border)',
              gap: 12,
              minHeight: 250,
            }}>
              {phase === 'loading' && (
                <div className="eq-bars" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 4, height: 30 }}>
                  {[14, 24, 30, 20, 12].map((h, n) => (
                    <i key={n} style={{ width: 5, height: h, borderRadius: 2, background: 'var(--accent)', transformOrigin: 'bottom', display: 'block' }} />
                  ))}
                </div>
              )}
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>
                {phase === 'loading' ? 'LOADING CANDLES…' : 'PREMIUM CHART TERMINAL'}
              </div>
              <div style={{ fontSize: 12, color: '#7d8590', textAlign: "center" }}>
                {phase === 'loading' ? 'Fetching candle history from exchange…' : 'Build a strategy in the sidebar, add it to the watchlist, and select it to open the live chart.'}
              </div>
              {errMsg && <div style={{ color: '#f85149', fontSize: 12, maxWidth: 320, textAlign: 'center' }}>{errMsg}</div>}
            </div>
          )}

          {/* Combined chart — Always in DOM */}
          <ChartPanel
            ref={combRef}
            visible={phase !== 'idle' && phase !== 'loading'}
            title={formatCombinedTitle(activeCall, activePut, priceType)}
            colorUp="#3fb950"
            colorDown="#f85149"
            iconColor="#2f81f7"
            alerts={watchList.find(w => w.id === selectedWatchId)?.alerts || []}
            showIvCall={true}
            showIvPut={true}
            theme={theme}
            timezone={timezone}
          />

          {/* Alert Signal Log — right drawer, opened from the header bell */}
          {alertDrawerOpen && (
            <div
              onClick={() => setAlertDrawerOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
            />
          )}
          <aside
            style={{
              position: 'absolute', top: 0, right: 0, height: '100%', width: 340, maxWidth: '90%',
              background: 'var(--bg2)', borderLeft: '1px solid var(--border)', zIndex: 41,
              display: 'flex', flexDirection: 'column',
              transform: alertDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.25s ease', boxShadow: '-8px 0 24px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text)' }}>
                <Bell size={14} strokeWidth={2.5} /> Signal Log
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {alertLogs.length > 0 && (
                  <button type="button" onClick={() => { setAlertLogs([]); fetch('/api/alert-history', { method: 'DELETE', credentials: 'include' }).catch(() => { }); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-dim)', padding: '4px 6px', borderRadius: 5 }}>Clear</button>
                )}
                <div onClick={() => setAlertDrawerOpen(false)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  <X size={16} strokeWidth={2.5} />
                </div>
              </div>
            </div>
            <div className="trade-list" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
              {!alertLogs.length && (
                <div style={{ textAlign: 'center', padding: '44px 24px', color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif', fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, margin: '0 auto 12px', display: 'grid', placeItems: 'center', color: 'var(--text-dim)', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                    <Bell size={20} strokeWidth={2} />
                  </div>
                  No alerts yet.<br />Set a price alert to start tracking signals.
                </div>
              )}
              {alertLogs.map(log => (
                <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 2px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center', color: '#58a6ff', background: 'rgba(47,129,247,0.12)' }}>
                    <Bell size={13} strokeWidth={2.5} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'var(--text)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{log.msg}</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>{log.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
