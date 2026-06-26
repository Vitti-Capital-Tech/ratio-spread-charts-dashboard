"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { authClient } from '@/lib/auth-client';
import { CandlestickChart, AlertCircle, Mail, Check } from 'lucide-react';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Resend countdown ring geometry
const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

// Deterministic candlestick silhouette for the backdrop (stable across SSR/CSR)
const CHART_CANDLES = Array.from({ length: 26 }, (_, i) => {
  const trend = 132 - i * 3.4;
  const o = trend + Math.sin(i * 0.6) * 16;
  const c = trend + Math.sin(i * 0.6 + 1.1) * 16;
  const hi = Math.min(o, c) - (6 + (i % 3) * 4);
  const lo = Math.max(o, c) + (6 + (i % 2) * 5);
  return { x: 14 + i * 18, o, c, hi, lo, up: c <= o };
});

export default function CustomSignIn() {
  const [step, setStep] = useState('identifier'); // 'identifier' | 'verification'
  const [email, setEmail] = useState('');
  const [otpArray, setOtpArray] = useState(Array(OTP_LENGTH).fill(''));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const otpInputsRef = useRef([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    clearErrors
  } = useForm({
    defaultValues: { email: '', otp: '' }
  });

  const emailValue = watch('email');
  const emailValid = EMAIL_RE.test((emailValue || '').trim());

  // Handle countdown ticks for OTP resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleIdentifierSubmit = async (data) => {
    const targetEmail = data.email.trim();
    setEmail(targetEmail);
    setError('');
    setLoading(true);

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: targetEmail,
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
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (error) throw error;
      setCountdown(RESEND_COOLDOWN);
      setOtpArray(Array(OTP_LENGTH).fill(''));
      setCode('');
      setValue('otp', '');
      clearErrors('otp');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (data) => {
    setError('');
    setLoading(true);

    try {
      const { error } = await authClient.signIn.emailOtp({
        email,
        otp: data.otp,
      });

      if (error) throw error;

      // Force authClient to refresh its session cache
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
    setValue('otp', combined, { shouldValidate: true });
    return combined;
  };

  const handleOtpChange = (e, index) => {
    const val = e.target.value;
    if (isNaN(val)) return;

    const newOtp = [...otpArray];
    newOtp[index] = val.slice(-1);
    const combined = commitOtp(newOtp);

    // Auto-focus next input box
    if (val !== '' && index < OTP_LENGTH - 1) {
      otpInputsRef.current[index + 1].focus();
    }

    // Auto-submit once all digits are entered
    if (combined.length === OTP_LENGTH && !loading) {
      handleSubmit(handleVerificationSubmit)();
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
    if (!/^\d+$/.test(pasteData)) return; // numbers only

    const newOtp = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < OTP_LENGTH; i++) {
      newOtp[i] = pasteData[i] || '';
    }
    const combined = commitOtp(newOtp);

    const focusIndex = Math.min(pasteData.length, OTP_LENGTH - 1);
    otpInputsRef.current[focusIndex].focus();

    if (combined.length === OTP_LENGTH && !loading) {
      handleSubmit(handleVerificationSubmit)();
    }
  };

  const otpFilled = code.length === OTP_LENGTH;

  return (
    <div className="trader-signin-container">
      {/* Candlestick silhouette backdrop */}
      <svg
        className="trader-chart-bg"
        viewBox="0 0 480 160"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '46%',
          opacity: 0.1,
          zIndex: 0,
          pointerEvents: 'none',
          WebkitMaskImage: 'linear-gradient(to top, #000 28%, transparent 100%)',
          maskImage: 'linear-gradient(to top, #000 28%, transparent 100%)',
        }}
      >
        {CHART_CANDLES.map((k, i) => (
          <g key={i} stroke={k.up ? 'var(--call)' : 'var(--put)'} fill={k.up ? 'var(--call)' : 'var(--put)'}>
            <line x1={k.x} x2={k.x} y1={k.hi} y2={k.lo} strokeWidth="1.4" />
            <rect x={k.x - 4} y={Math.min(k.o, k.c)} width="8" height={Math.max(2, Math.abs(k.o - k.c))} rx="1" />
          </g>
        ))}
      </svg>

      <div className="trader-card">
        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-logo-wrap">
            <span className="brand-glyph">
              <CandlestickChart size={17} color="var(--accent)" style={{ flexShrink: 0 }} />
            </span>
            <span className="brand-logo-text">VITTI CRYPTO <span>SCANNER</span></span>
          </div>
          <div className="gateway-status">
            <span className="status-dot"></span>
            <span>SYSTEM ONLINE</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="trader-title">
          {step === 'identifier' ? 'Sign In' : 'Enter Verification Code'}
        </h2>
        <p className="trader-subtitle">
          {step === 'identifier'
            ? 'Sign in to access your dashboard'
            : <>Enter the 6-digit code sent to <strong style={{ color: 'var(--text)' }}>{email}</strong></>}
        </p>

        {/* Reserved-height error slot — prevents layout shift */}
        <div className="trader-error-slot">
          {error && (
            <div className="trader-error">
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Step 1: Identifier Input */}
        {step === 'identifier' ? (
          <form onSubmit={handleSubmit(handleIdentifierSubmit)}>
            <div className="trader-label">
              <span>Email Address</span>
            </div>
            <div className="trader-input-container" style={{ marginBottom: errors.email ? '14px' : '8px' }}>
              <span className="trader-input-icon">
                <Mail size={14} />
              </span>
              <input
                type="text"
                className={`trader-input ${errors.email ? 'input-error' : ''}`}
                placeholder="trader@vitti.capital"
                autoFocus
                {...register('email', {
                  required: 'Email address is required',
                  pattern: { value: EMAIL_RE, message: 'Please enter a valid email address' }
                })}
              />
              {emailValid && !errors.email && (
                <span className="trader-input-valid" aria-hidden="true">
                  <Check size={14} />
                </span>
              )}
            </div>
            {errors.email && (
              <span className="field-error-text" style={{ marginTop: '-4px', marginBottom: '12px', display: 'block' }}>{errors.email.message}</span>
            )}
            <p className="trader-hint">We'll email you a 6-digit sign-in code.</p>
            <button type="submit" className="btn-trade" disabled={loading}>
              {loading ? <span className="trade-loader"></span> : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          /* Step 2: Verification Input */
          <form onSubmit={handleSubmit(handleVerificationSubmit)}>
            <div className="trader-label">
              <span>Verification Code</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>6 Digits</span>
            </div>

            {/* Hidden Input field for react-hook-form to register and validate */}
            <input
              type="hidden"
              {...register('otp', {
                required: 'Verification code is required',
                minLength: { value: 6, message: 'Code must be exactly 6 digits' },
                maxLength: { value: 6, message: 'Code must be exactly 6 digits' }
              })}
            />

            <div className="otp-splits-wrapper" onPaste={handleOtpPaste}>
              {otpArray.map((digit, index) => (
                <input
                  key={index}
                  type="text"
                  pattern="\d*"
                  inputMode="numeric"
                  maxLength={1}
                  className={`otp-split-input${errors.otp ? ' input-error' : ''}${otpFilled ? ' otp-filled' : ''}`}
                  value={digit}
                  ref={(el) => (otpInputsRef.current[index] = el)}
                  onChange={(e) => handleOtpChange(e, index)}
                  onKeyDown={(e) => handleOtpKeyDown(e, index)}
                  autoFocus={index === 0}
                />
              ))}
            </div>

            {errors.otp && (
              <div style={{ marginBottom: '20px', marginTop: '-12px' }}>
                <span className="field-error-text">{errors.otp.message}</span>
              </div>
            )}

            <button type="submit" className="btn-trade" disabled={loading || !otpFilled}>
              {loading ? <span className="trade-loader"></span> : 'Verify & Sign In'}
            </button>

            {/* Resend Actions */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { setStep('identifier'); setOtpArray(Array(OTP_LENGTH).fill('')); setCode(''); setValue('otp', ''); clearErrors(); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#848e9c', fontSize: '11.5px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Change Email
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
                  Resend Code
                </button>
              )}
            </div>
          </form>
        )}

        {/* Disclaimer */}
        <div className="terminal-disclaimer">
          CONFIDENTIAL SYSTEM NOTICE: UNAUTHORIZED ACCOUNT ACCESS IS STRICTLY MONITOR-PROHIBITED. ALL SESSION LOGS ENCRYPTED.
        </div>
      </div>
    </div>
  );
}
