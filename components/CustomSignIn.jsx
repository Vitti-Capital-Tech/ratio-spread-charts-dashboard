"use client";
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { CandlestickChart, AlertCircle, Mail, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Resend countdown ring geometry
const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

// ── "CALL + PUT → Combined" volume-driven live candlestick graphic ──
// History candles are fixed. The current (last) candle is driven by a looping
// activity story: first CALL is more active → the combined pushes UP (call's
// way); then PUT gets more active → the combined pushes DOWN. Combined stays
// = call + put at every frame. Hash-based → SSR-stable (no Date/Math.random).
const NC = 9; // candles per chart (index NC-1 is the live candle)
const hsh = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const genPath = (seed, drift) => {
  const p = [50];
  for (let i = 1; i <= NC; i++) p.push(p[i - 1] + (hsh(i * 2.3 + seed) - 0.5) * 9 + drift);
  return p;
};
const buildOHLC = (p, seed) => Array.from({ length: NC }, (_, i) => {
  const open = p[i], close = p[i + 1];
  const wick = 1.4 + hsh(i * 5.1 + seed) * 2.6;
  return { open, close, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick, up: close >= open };
});
const genVol = (seed) => Array.from({ length: NC }, (_, i) => 0.45 + hsh(i * 3.7 + seed) * 0.55);
const sumC = (a, b) => ({ open: a.open + b.open, close: a.close + b.close, high: a.high + b.high, low: a.low + b.low, up: (a.close + b.close) >= (a.open + b.open) });

const CALL_O = buildOHLC(genPath(1.0, 1.3), 2);
const PUT_O = buildOHLC(genPath(9.0, -1.2), 8);
const COMB_O = CALL_O.map((c, i) => sumC(c, PUT_O[i]));
const CALL_VOL = genVol(2.0), PUT_VOL = genVol(6.0);
const COMB_VOL = CALL_VOL.map((v, i) => v + PUT_VOL[i]);

// Activity narrative over one loop (first === last): call surge, then put surge.
const ACT_C = [0.3, 0.9, 1.4, 0.8, 0.4, 0.25, 0.2, 0.35, 0.3];
const ACT_P = [0.3, 0.25, 0.2, 0.45, 0.8, 1.2, 1.4, 0.6, 0.3];
const MOVE = 7; // price units per unit of activity for the live candle

// Live-candle OHLC frames for one leg (sign +1 = call/up, -1 = put/down).
const legLive = (ohlc, act, sign) => {
  const open = ohlc[NC - 1].open;
  return act.map((a) => {
    const close = open + sign * a * MOVE;
    const w = 0.6 + a * 1.4;
    return { open, close, high: Math.max(open, close) + w, low: Math.min(open, close) - w, up: close >= open };
  });
};
const CALL_FR = legLive(CALL_O, ACT_C, +1);
const PUT_FR = legLive(PUT_O, ACT_P, -1);
const COMB_FR = CALL_FR.map((c, i) => sumC(c, PUT_FR[i])); // combined = call + put each frame

// Live volume fractions (0..1 of the strip): the bar grows with this leg's activity.
const maxAct = Math.max(...ACT_C, ...ACT_P);
const VOL_C = ACT_C.map((a) => a / maxAct);
const VOL_P = ACT_P.map((a) => a / maxAct);
const maxSum = Math.max(...ACT_C.map((a, i) => a + ACT_P[i]));
const VOL_K = ACT_C.map((a, i) => (a + ACT_P[i]) / maxSum);

// Lay history OHLC + volume into a panel; scale to fit history + the live frames.
const layout = (ohlc, frames, vols, x0, x1, pTop, pBot, vTop, vBot) => {
  let lo = Infinity, hi = -Infinity;
  const scan = (c) => { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); };
  ohlc.slice(0, NC - 1).forEach(scan); frames.forEach(scan);
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const Y = (v) => +(pBot - ((v - lo) / (hi - lo)) * (pBot - pTop)).toFixed(2);
  const maxV = Math.max(...vols.slice(0, NC - 1)) || 1;
  const step = (x1 - x0) / NC, bw = Math.min(step * 0.56, 13);
  const cands = ohlc.map((c, i) => {
    const vTopY = +(vBot - (vols[i] / maxV) * (vBot - vTop)).toFixed(2);
    return {
      cx: +(x0 + step * (i + 0.5)).toFixed(2), bw, up: c.up,
      top: Math.min(Y(c.open), Y(c.close)), bh: Math.max(1.4, Math.abs(Y(c.open) - Y(c.close))),
      wtop: Y(c.high), wbot: Y(c.low), volTop: vTopY, volH: +(vBot - vTopY).toFixed(2),
    };
  });
  return { cands, Y, vTop, vBot };
};

// SMIL value strings (+ frame-0 init) for the live price candle.
const priceForm = (frames, Y) => {
  const bY = frames.map((f) => Math.min(Y(f.open), Y(f.close)));
  const bH = frames.map((f) => Math.max(1.4, Math.abs(Y(f.open) - Y(f.close))));
  const wt = frames.map((f) => Y(f.high)), wb = frames.map((f) => Y(f.low)), dt = frames.map((f) => Y(f.close));
  const j = (a) => a.map((v) => v.toFixed(1)).join(';');
  return {
    bodyY: j(bY), bodyH: j(bH), wtop: j(wt), wbot: j(wb), dot: j(dt),
    init: { y: bY[0].toFixed(1), h: bH[0].toFixed(1), wt: wt[0].toFixed(1), wb: wb[0].toFixed(1), dy: dt[0].toFixed(1) },
  };
};

// SMIL value strings (+ init) for the live volume bar.
const volForm = (fracs, vTop, vBot) => {
  const VH = vBot - vTop;
  const tops = fracs.map((f) => vBot - f * VH), hs = fracs.map((f) => f * VH);
  const j = (a) => a.map((v) => v.toFixed(1)).join(';');
  return { top: j(tops), h: j(hs), init: { top: tops[0].toFixed(1), h: hs[0].toFixed(1) } };
};

const CALL_L = layout(CALL_O, CALL_FR, CALL_VOL, 16, 118, 40, 68, 72, 81);
const PUT_L = layout(PUT_O, PUT_FR, PUT_VOL, 16, 118, 130, 158, 162, 171);
const COMB_L = layout(COMB_O, COMB_FR, COMB_VOL, 244, 500, 46, 144, 150, 168);
const CALL_PFM = priceForm(CALL_FR, CALL_L.Y), CALL_VFM = volForm(VOL_C, CALL_L.vTop, CALL_L.vBot);
const PUT_PFM = priceForm(PUT_FR, PUT_L.Y), PUT_VFM = volForm(VOL_P, PUT_L.vTop, PUT_L.vBot);
const COMB_PFM = priceForm(COMB_FR, COMB_L.Y), COMB_VFM = volForm(VOL_K, COMB_L.vTop, COMB_L.vBot);

const UP = 'var(--call)', DN = 'var(--put)';
const TICK = '10s'; // one full call-surge → put-surge cycle

// One candlestick chart: volume strip + fixed history + a volume-driven live candle.
function CandleSeries({ L, PFM, VFM, tone }) {
  const col = (up) => tone === 'combined' ? (up ? UP : DN) : (tone === 'call' ? UP : DN);
  const op = (up) => tone === 'combined' ? 1 : (up ? 1 : 0.4);
  const last = L.cands.length - 1;
  const lc = L.cands[last];
  const liveCol = tone === 'combined' ? '#58a6ff' : col(true);
  return (
    <g>
      {/* History volume */}
      {L.cands.slice(0, last).map((c, i) => (
        <rect key={`v${i}`} x={c.cx - c.bw / 2} y={c.volTop} width={c.bw} height={c.volH} rx="0.5" fill={col(c.up)} opacity="0.26" />
      ))}
      {/* Live volume bar — grows with this leg's activity */}
      <rect x={lc.cx - lc.bw / 2} y={VFM.init.top} width={lc.bw} height={VFM.init.h} rx="0.5" fill={liveCol} opacity="0.5">
        <animate attributeName="y" values={VFM.top} dur={TICK} repeatCount="indefinite" />
        <animate attributeName="height" values={VFM.h} dur={TICK} repeatCount="indefinite" />
      </rect>
      {/* History candles */}
      {L.cands.slice(0, last).map((c, i) => (
        <g key={i} stroke={col(c.up)} fill={col(c.up)} opacity={op(c.up)}>
          <line x1={c.cx} x2={c.cx} y1={c.wtop} y2={c.wbot} strokeWidth="1" />
          <rect x={c.cx - c.bw / 2} y={c.top} width={c.bw} height={c.bh} rx="1" />
        </g>
      ))}
      {/* Live (forming) candle */}
      <g stroke={liveCol} fill={liveCol}>
        <line x1={lc.cx} x2={lc.cx} y1={PFM.init.wt} y2={PFM.init.wb} strokeWidth="1">
          <animate attributeName="y1" values={PFM.wtop} dur={TICK} repeatCount="indefinite" />
          <animate attributeName="y2" values={PFM.wbot} dur={TICK} repeatCount="indefinite" />
        </line>
        <rect x={lc.cx - lc.bw / 2} y={PFM.init.y} width={lc.bw} height={PFM.init.h} rx="1">
          <animate attributeName="y" values={PFM.bodyY} dur={TICK} repeatCount="indefinite" />
          <animate attributeName="height" values={PFM.bodyH} dur={TICK} repeatCount="indefinite" />
        </rect>
      </g>
      <circle cx={lc.cx} cy={PFM.init.dy} r={tone === 'combined' ? 3 : 2.4} fill={liveCol}>
        <animate attributeName="cy" values={PFM.dot} dur={TICK} repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// Connector paths: call/put feeds → merge node → combined chart
const CONN_CALL = 'M126 55 C152 55 158 98 167 98';
const CONN_PUT = 'M126 143 C152 143 158 98 167 98';
const CONN_OUT = 'M193 98 C214 98 222 100 244 100';

/** Live "combine a call + a put into one chart" graphic for the hero panel. */
function CombineGraphic() {
  return (
    <svg viewBox="0 0 520 190" className="si-graphic" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="clipCall"><rect x="8" y="22" width="118" height="62" rx="9" /></clipPath>
        <clipPath id="clipPut"><rect x="8" y="112" width="118" height="62" rx="9" /></clipPath>
        <clipPath id="clipComb"><rect x="232" y="22" width="280" height="152" rx="10" /></clipPath>
      </defs>

      {/* ── Panels ── */}
      <rect x="8" y="22" width="118" height="62" rx="9" fill="rgba(14,203,129,0.05)" stroke="var(--border)" />
      <rect x="8" y="112" width="118" height="62" rx="9" fill="rgba(246,70,93,0.05)" stroke="var(--border)" />
      <rect x="232" y="22" width="280" height="152" rx="10" fill="rgba(47,129,247,0.05)" stroke="rgba(47,129,247,0.25)" />

      {/* Labels */}
      <text x="16" y="37" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1.2" fill="var(--call)">CALL</text>
      <text x="16" y="127" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1.2" fill="var(--put)">PUT</text>
      <text x="240" y="37" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1" fill="#58a6ff">COMBINED = CALL + PUT</text>

      {/* LIVE pill */}
      <circle cx="470" cy="33.5" r="3" fill="var(--call)">
        <animate attributeName="opacity" values="1;0.25;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <text x="479" y="37" fontFamily="Inter, sans-serif" fontSize="8.5" fontWeight="700" letterSpacing="1" fill="var(--call)">LIVE</text>

      {/* ── Candlestick charts ── */}
      <g clipPath="url(#clipCall)"><CandleSeries L={CALL_L} PFM={CALL_PFM} VFM={CALL_VFM} tone="call" /></g>
      <g clipPath="url(#clipPut)"><CandleSeries L={PUT_L} PFM={PUT_PFM} VFM={PUT_VFM} tone="put" /></g>

      {/* ── Connectors + flowing "trade" dots ── */}
      {[CONN_CALL, CONN_PUT, CONN_OUT].map((d, i) => (
        <path key={i} d={d} stroke="#58a6ff" strokeWidth="1.2" opacity="0.35" strokeDasharray="3 4" />
      ))}
      {[
        { d: CONN_CALL, begin: '0s' },
        { d: CONN_PUT, begin: '0.4s' },
        { d: CONN_OUT, begin: '0.9s' },
        { d: CONN_OUT, begin: '1.9s' },
      ].map((f, i) => (
        <circle key={i} r="2.6" fill="#58a6ff">
          <animateMotion dur="2s" repeatCount="indefinite" path={f.d} begin={f.begin} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="2s" repeatCount="indefinite" begin={f.begin} />
        </circle>
      ))}

      {/* ── Merge node (＋) with pulse rings ── */}
      {[0, 1].map((i) => (
        <circle key={i} cx="180" cy="98" r="13" fill="none" stroke="#58a6ff" strokeWidth="1.4">
          <animate attributeName="r" values="12;22;12" dur="2.6s" repeatCount="indefinite" begin={`${i * 1.3}s`} />
          <animate attributeName="opacity" values="0.55;0;0.55" dur="2.6s" repeatCount="indefinite" begin={`${i * 1.3}s`} />
        </circle>
      ))}
      <circle cx="180" cy="98" r="13" fill="rgba(47,129,247,0.16)" stroke="#58a6ff" strokeWidth="1.5" />
      <path d="M173 98 H187 M180 91 V105" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />

      {/* ── Combined candlestick chart ── */}
      <g clipPath="url(#clipComb)"><CandleSeries L={COMB_L} PFM={COMB_PFM} VFM={COMB_VFM} tone="combined" /></g>
    </svg>
  );
}

export default function CustomSignIn() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' — flip faces; both drive the same OTP flow
  const [step, setStep] = useState('identifier'); // 'identifier' | 'verification'
  const [emailInput, setEmailInput] = useState('');
  const [email, setEmail] = useState(''); // email a code was actually sent to
  const [emailErr, setEmailErr] = useState('');
  const [otpArray, setOtpArray] = useState(Array(OTP_LENGTH).fill(''));
  const [code, setCode] = useState('');
  const [otpErr, setOtpErr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const otpInputsRef = useRef([]);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const [flipH, setFlipH] = useState(undefined);

  const emailValid = EMAIL_RE.test(emailInput.trim());

  // Countdown ticks for OTP resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Match the flip container's height to whichever face is showing, and
  // re-measure when its content grows/shrinks (error banner, validation text).
  useLayoutEffect(() => {
    if (step !== 'identifier') return;
    const el = (mode === 'signin' ? frontRef : backRef).current;
    if (!el) return;
    const measure = () => setFlipH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, step, error, emailErr]);

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setError('');
    setEmailErr('');
  };

  const submitIdentifier = async (e) => {
    e.preventDefault();
    const input = emailInput.trim();
    setEmailErr('');
    setError('');

    const isEmail = EMAIL_RE.test(input);
    // A non-email "access word" is allowed on either face — typing the keyword logs you straight in.
    const isWord = !input.includes('@') && /^\S{3,64}$/.test(input);
    if (!isEmail && !isWord) {
      setEmailErr('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // OTP bypass: the secret access word signs in directly, skipping OTP.
      // The server validates it against BYPASS_WORD.
      if (!input.includes('@')) {
        const res = await fetch('/api/auth/otp-bypass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ word: input }),
        });
        if (!res.ok) throw new Error('Invalid access word.');
        await authClient.getSession();
        window.location.href = '/charts';
        return;
      }

      setEmail(input);
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: input,
        type: 'sign-in',
      });
      if (error) throw error;

      setStep('verification');
      setCountdown(RESEND_COOLDOWN);
    } catch (err) {
      console.error('SignIn error:', err);
      setError(err.message || 'An error occurred while sending the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      if (error) throw error;
      setCountdown(RESEND_COOLDOWN);
      setOtpArray(Array(OTP_LENGTH).fill(''));
      setCode('');
      setOtpErr('');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (full) => {
    const c = full ?? code;
    if (c.length !== OTP_LENGTH) {
      setOtpErr('Enter the 6-digit code');
      return;
    }
    setError('');
    setOtpErr('');
    setLoading(true);
    try {
      const { error } = await authClient.signIn.emailOtp({ email, otp: c });
      if (error) throw error;
      await authClient.getSession();
      window.location.href = '/charts';
    } catch (err) {
      console.error('Verify error:', err);
      setError(err.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const commitOtp = (nextOtp) => {
    setOtpArray(nextOtp);
    const combined = nextOtp.join('');
    setCode(combined);
    return combined;
  };

  const handleOtpChange = (e, index) => {
    const val = e.target.value;
    if (isNaN(val)) return;
    const newOtp = [...otpArray];
    newOtp[index] = val.slice(-1);
    const combined = commitOtp(newOtp);
    if (val !== '' && index < OTP_LENGTH - 1) {
      otpInputsRef.current[index + 1].focus();
    }
    if (combined.length === OTP_LENGTH && !loading) {
      verifyCode(combined);
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (otpArray[index] === '') {
        if (index > 0) {
          const newOtp = [...otpArray];
          newOtp[index - 1] = '';
          commitOtp(newOtp);
          otpInputsRef.current[index - 1].focus();
        }
      } else {
        const newOtp = [...otpArray];
        newOtp[index] = '';
        commitOtp(newOtp);
      }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim().slice(0, OTP_LENGTH);
    if (!/^\d+$/.test(pasteData)) return;
    const newOtp = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < OTP_LENGTH; i++) newOtp[i] = pasteData[i] || '';
    const combined = commitOtp(newOtp);
    const focusIndex = Math.min(pasteData.length, OTP_LENGTH - 1);
    otpInputsRef.current[focusIndex].focus();
    if (combined.length === OTP_LENGTH && !loading) verifyCode(combined);
  };

  const otpFilled = code.length === OTP_LENGTH;

  const brand = (
    <>
      <span className="si-brand-glyph">
        <CandlestickChart size={19} color="#58a6ff" style={{ flexShrink: 0 }} />
      </span>
      <span className="si-brand-name">JODI <span>CRYPTO SCANNER</span></span>
    </>
  );

  // One identifier face (sign-in or sign-up). Rendered via a plain function call —
  // NOT as a <Component/> — so changing `mode` reconciles instead of remounting
  // (a remount would replay the card's entrance animation and cause a flash).
  const renderFace = (face) => {
    const active = mode === face;
    const isSignin = face === 'signin';
    return (
      <div className="si-card-inner">
        <h2 className="si-h1">{isSignin ? 'Welcome back' : 'Create your account'}</h2>
        <p className="si-sub">
          {isSignin ? 'Sign in to your Jodi Crypto Scanner account.' : 'Start scanning the options chain in minutes.'}
        </p>

        <form onSubmit={submitIdentifier}>
          <div className="si-label"><span>Email address</span></div>
          <div className={`si-field ${active && emailErr ? 'has-error' : ''}`}>
            <span className="si-field-icon"><Mail size={16} /></span>
            <input
              type="text"
              className="si-input"
              placeholder="you@vitti.capital"
              value={emailInput}
              autoFocus={active}
              tabIndex={active ? 0 : -1}
              onChange={(e) => { setEmailInput(e.target.value); if (emailErr) setEmailErr(''); }}
            />
          </div>
          {active && emailErr && <span className="si-field-error">{emailErr}</span>}

          <div className="si-error-slot">
            {active && error && (
              <div className="si-error">
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <button type="submit" className="si-btn" disabled={loading} tabIndex={active ? 0 : -1}>
            <span className="si-shine" aria-hidden="true" />
            {loading && active
              ? <span className="si-loader" />
              : <>{isSignin ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></>}
          </button>
        </form>

        <p className="si-switch">
          {isSignin ? "No account? " : 'Already have an account? '}
          <button type="button" onClick={() => switchMode(isSignin ? 'signup' : 'signin')} tabIndex={active ? 0 : -1}>
            {isSignin ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    );
  };

  return (
    <div className="si-wrap">
      {/* ── Left: brand hero (desktop only) ── */}
      <aside className="si-hero">
        <div className="si-orb si-orb-a" />
        <div className="si-orb si-orb-b" />
        <div className="si-grid" />

        <div className="si-brand hero-rise hero-d1">{brand}</div>

        <div className="si-hero-mid">
          <h1 className="si-headline hero-rise hero-d3">
            Scan the chain.<br />
            <span className="grad">Trade the edge.</span>
          </h1>
          <div className="si-graphic-wrap hero-rise hero-d4">
            <CombineGraphic />
          </div>
        </div>

        <div className="si-foot hero-rise hero-d5">
          © {new Date().getFullYear()}{' '}
          <a href="https://vitti.capital" target="_blank" rel="noopener noreferrer" className="si-foot-link">Vitti Capital</a>
          {' '}· Jodi Crypto Scanner
        </div>
      </aside>

      {/* ── Right: form ── */}
      <main className="si-main">
        <div className="si-card">
          <div className="si-brand-mobile">{brand}</div>

          {step === 'identifier' ? (
            /* Flip card: sign-in on the front, sign-up on the back */
            <div className="si-flip-perspective">
              <div
                className="si-flip"
                style={{
                  height: flipH,
                  transform: mode === 'signup' ? 'rotateY(-180deg)' : 'rotateY(0deg)',
                }}
              >
                <div ref={frontRef} className="si-face">
                  {renderFace('signin')}
                </div>
                <div ref={backRef} className="si-face si-face-back">
                  {renderFace('signup')}
                </div>
              </div>
            </div>
          ) : (
            /* Verification step (no flip) */
            <div className="si-card-inner">
              <div className="si-verify-badge"><ShieldCheck size={20} /></div>
              <h2 className="si-h1" style={{ textAlign: 'center' }}>Enter verification code</h2>
              <p className="si-sub" style={{ textAlign: 'center' }}>
                We emailed a 6-digit code to <strong>{email}</strong>
              </p>

              <div className="si-error-slot">
                {error && (
                  <div className="si-error">
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); verifyCode(); }}>
                <div className="otp-splits-wrapper" onPaste={handleOtpPaste} style={{ marginTop: 22 }}>
                  {otpArray.map((digit, index) => (
                    <input
                      key={index}
                      type="text"
                      pattern="\d*"
                      inputMode="numeric"
                      maxLength={1}
                      className={`otp-split-input${otpErr ? ' input-error' : ''}${otpFilled ? ' otp-filled' : ''}`}
                      value={digit}
                      ref={(el) => (otpInputsRef.current[index] = el)}
                      onChange={(e) => handleOtpChange(e, index)}
                      onKeyDown={(e) => handleOtpKeyDown(e, index)}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
                {otpErr && <span className="si-field-error" style={{ textAlign: 'center' }}>{otpErr}</span>}

                <button type="submit" className="si-btn" disabled={loading || !otpFilled}>
                  <span className="si-shine" aria-hidden="true" />
                  {loading ? <span className="si-loader" /> : 'Verify & sign in'}
                </button>
              </form>

              <div className="si-verify-actions">
                <button
                  type="button"
                  className="si-link-muted"
                  onClick={() => { setStep('identifier'); setOtpArray(Array(OTP_LENGTH).fill('')); setCode(''); setOtpErr(''); setError(''); }}
                >
                  <ArrowLeft size={13} /> Change email
                </button>

                {countdown > 0 ? (
                  <span className="resend-countdown">
                    <svg width="22" height="22" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} aria-hidden="true">
                      <circle cx="12" cy="12" r={RING_R} fill="none" stroke="var(--border)" strokeWidth="2.4" />
                      <circle
                        cx="12" cy="12" r={RING_R}
                        fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"
                        strokeDasharray={RING_C}
                        strokeDashoffset={RING_C * (1 - countdown / RESEND_COOLDOWN)}
                        style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                      />
                    </svg>
                    <span className="resend-text">{countdown}s</span>
                  </span>
                ) : (
                  <button type="button" onClick={handleResend} className="resend-btn" disabled={loading}>
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
