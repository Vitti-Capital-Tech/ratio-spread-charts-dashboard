"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function CustomSignIn() {
  const router = useRouter();

  const [step, setStep] = useState('identifier'); // 'identifier' | 'verification'
  const [email, setEmail] = useState('');
  const [otpArray, setOtpArray] = useState(['', '', '', '', '', '']);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const otpInputsRef = useRef([]);

  // Handle countdown ticks for OTP resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleIdentifierSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setError('');
    setLoading(true);

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });

      if (error) {
        throw error;
      }
      
      setStep('verification');
      setCountdown(60); // Initialize a 60-second cooldown timer
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
      setCountdown(60);
      setOtpArray(['', '', '', '', '', '']);
      setCode('');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter all 6 digits.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error } = await authClient.signIn.emailOtp({
        email,
        otp: code,
      });

      if (error) {
        throw error;
      }

      router.push('/charts');
    } catch (err) {
      console.error('Verify error:', err);
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (e, index) => {
    const val = e.target.value;
    if (isNaN(val)) return;

    const newOtp = [...otpArray];
    newOtp[index] = val.slice(-1);
    setOtpArray(newOtp);
    
    const combinedCode = newOtp.join('');
    setCode(combinedCode);

    // Auto-focus next input box
    if (val !== "" && index < 5) {
      otpInputsRef.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === "Backspace") {
      if (otpArray[index] === "") {
        // Move backward and clear previous box
        if (index > 0) {
          const newOtp = [...otpArray];
          newOtp[index - 1] = "";
          setOtpArray(newOtp);
          setCode(newOtp.join(''));
          otpInputsRef.current[index - 1].focus();
        }
      } else {
        // Clear current box
        const newOtp = [...otpArray];
        newOtp[index] = "";
        setOtpArray(newOtp);
        setCode(newOtp.join(''));
      }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").trim().slice(0, 6);
    if (!/^\d+$/.test(pasteData)) return; // numbers only

    const newOtp = [...otpArray];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasteData[i] || "";
    }
    setOtpArray(newOtp);
    setCode(newOtp.join(''));

    // Focus last pasted element
    const focusIndex = Math.min(pasteData.length, 5);
    otpInputsRef.current[focusIndex].focus();
  };

  return (
    <div className="trader-signin-container">
      <style>{`
        .trader-signin-container {
          background-image: radial-gradient(rgba(240, 185, 11, 0.03) 1.5px, transparent 0);
          background-size: 20px 20px;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .trader-card {
          background: linear-gradient(160deg, #14161d 0%, #0d0e12 100%);
          border: 1px solid rgba(240, 185, 11, 0.12);
          border-radius: 12px;
          width: 100%;
          max-width: 420px;
          padding: 32px 28px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(240, 185, 11, 0.02);
          position: relative;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        .trader-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, var(--accent, #f0b90b), transparent);
          border-radius: 12px 12px 0 0;
        }

        .trader-card:hover {
          border-color: rgba(240, 185, 11, 0.22);
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 50px rgba(240, 185, 11, 0.04);
        }

        .brand-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          border-bottom: 1px solid rgba(43, 47, 54, 0.5);
          padding-bottom: 16px;
        }

        .brand-logo-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-logo-text {
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.8px;
          color: var(--accent, #f0b90b);
        }

        .brand-logo-text span {
          color: var(--text-dim, #848e9c);
          font-weight: 400;
        }

        .gateway-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: #0ecb81;
          background: rgba(14, 203, 129, 0.08);
          padding: 4px 10px;
          border-radius: 20px;
          font-family: monospace;
          border: 1px solid rgba(14, 203, 129, 0.15);
        }

        .status-dot {
          width: 6px;
          height: 6px;
          background: #0ecb81;
          border-radius: 50%;
          animation: status-blink 1.5s infinite;
          box-shadow: 0 0 6px #0ecb81;
        }

        @keyframes status-blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        .trader-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--text, #eaecef);
          margin-bottom: 6px;
          letter-spacing: -0.2px;
        }

        .trader-subtitle {
          font-size: 12px;
          color: var(--text-dim, #848e9c);
          margin-bottom: 24px;
        }

        .trader-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-dim, #848e9c);
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
        }

        .trader-input-container {
          position: relative;
          margin-bottom: 20px;
        }

        .trader-input {
          width: 100%;
          background: #0a0b0e;
          border: 1px solid var(--border, #2b2f36);
          border-radius: 6px;
          padding: 12px 14px 12px 38px;
          color: var(--text, #eaecef);
          font-size: 13px;
          transition: all 0.2s;
        }

        .trader-input:focus {
          outline: none;
          border-color: var(--accent, #f0b90b);
          box-shadow: 0 0 8px rgba(240, 185, 11, 0.2);
          background: #0d0e12;
        }

        .trader-input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-dim, #848e9c);
          pointer-events: none;
        }

        .btn-trade {
          background: var(--accent, #f0b90b);
          color: #000;
          border: none;
          font-weight: 600;
          border-radius: 6px;
          padding: 12px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .btn-trade:hover:not(:disabled) {
          background: #f8c21a;
          box-shadow: 0 4px 12px rgba(240, 185, 11, 0.25);
        }

        .btn-trade:active:not(:disabled) {
          transform: scale(0.98);
        }

        .btn-trade:disabled {
          background: #2b2f36;
          color: #848e9c;
          cursor: not-allowed;
        }

        .otp-splits-wrapper {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 20px;
        }

        .otp-split-input {
          width: 48px;
          height: 52px;
          background: #0a0b0e;
          border: 1px solid var(--border, #2b2f36);
          border-radius: 6px;
          color: var(--text, #eaecef);
          font-size: 20px;
          font-weight: 700;
          text-align: center;
          transition: all 0.2s;
        }

        .otp-split-input:focus {
          outline: none;
          border-color: var(--accent, #f0b90b);
          box-shadow: 0 0 8px rgba(240, 185, 11, 0.2);
          background: #0d0e12;
        }

        .trader-error {
          background: rgba(246, 70, 93, 0.08);
          border: 1px solid rgba(246, 70, 93, 0.2);
          border-radius: 6px;
          padding: 10px 14px;
          color: var(--danger, #f6465d);
          font-size: 11.5px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .terminal-disclaimer {
          font-family: monospace;
          font-size: 9px;
          color: #848e9c;
          text-align: center;
          margin-top: 24px;
          opacity: 0.5;
          letter-spacing: 0.2px;
        }

        .resend-btn {
          background: none;
          border: none;
          color: var(--accent, #f0b90b);
          font-size: 11.5px;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
          transition: opacity 0.2s;
        }

        .resend-btn:hover {
          opacity: 0.8;
        }

        .resend-text {
          font-size: 11.5px;
          color: var(--text-dim, #848e9c);
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .trade-loader {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0,0,0,0.15);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
      `}</style>

      <div className="trader-card">
        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-logo-wrap">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="7" fill="#0d1117" />
              <rect x="5" y="14" width="4" height="8" rx="1" fill="#3fb950" />
              <line x1="7" y1="10" x2="7" y2="14" stroke="#3fb950" strokeWidth="1.5" />
              <line x1="7" y1="22" x2="7" y2="26" stroke="#3fb950" strokeWidth="1.5" />
              <rect x="13" y="10" width="4" height="10" rx="1" fill="#f85149" />
              <line x1="15" y1="6" x2="15" y2="10" stroke="#f85149" strokeWidth="1.5" />
              <line x1="15" y1="20" x2="15" y2="25" stroke="#f85149" strokeWidth="1.5" />
              <rect x="21" y="12" width="4" height="9" rx="1" fill="#e3b341" />
              <line x1="23" y1="8" x2="23" y2="12" stroke="#e3b341" strokeWidth="1.5" />
              <line x1="23" y1="21" x2="23" y2="26" stroke="#e3b341" strokeWidth="1.5" />
              <rect x="5" y="29" width="22" height="1.5" rx="0.75" fill="#00d9a3" opacity="0.8" />
            </svg>
            <span className="brand-logo-text">VITTI OPTION<span>SCOPE</span></span>
          </div>
          <div className="gateway-status">
            <span className="status-dot"></span>
            <span>GATEWAY ONLINE</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="trader-title">
          {step === 'identifier' ? 'Secure Gateway' : 'Security Token Required'}
        </h2>
        <p className="trader-subtitle">
          {step === 'identifier' 
            ? 'Sign in to access your option spread scanner' 
            : `Enter the 6-digit one-time token sent to ${email}`}
        </p>

        {/* Errors */}
        {error && (
          <div className="trader-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Identifier Input */}
        {step === 'identifier' ? (
          <form onSubmit={handleIdentifierSubmit}>
            <div className="trader-label">
              <span>Trader Email</span>
            </div>
            <div className="trader-input-container">
              <span className="trader-input-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </span>
              <input
                type="email"
                className="trader-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@vitti.capital"
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn-trade" disabled={loading}>
              {loading ? <span className="trade-loader"></span> : 'Request Secure Link / Token'}
            </button>
          </form>
        ) : (
          /* Step 2: Verification Input */
          <form onSubmit={handleVerificationSubmit}>
            <div className="trader-label">
              <span>Security Token</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>6 Digits</span>
            </div>
            <div className="otp-splits-wrapper" onPaste={handleOtpPaste}>
              {otpArray.map((digit, index) => (
                <input
                  key={index}
                  type="text"
                  pattern="\d*"
                  maxLength={1}
                  className="otp-split-input"
                  value={digit}
                  ref={(el) => (otpInputsRef.current[index] = el)}
                  onChange={(e) => handleOtpChange(e, index)}
                  onKeyDown={(e) => handleOtpKeyDown(e, index)}
                  required
                  autoFocus={index === 0}
                />
              ))}
            </div>

            <button type="submit" className="btn-trade" disabled={loading || code.length !== 6}>
              {loading ? <span className="trade-loader"></span> : 'Authenticate'}
            </button>

            {/* Resend Actions */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                type="button" 
                onClick={() => { setStep('identifier'); setOtpArray(['','','','','','']); setCode(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#848e9c', fontSize: '11.5px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Change Email
              </button>

              {countdown > 0 ? (
                <span className="resend-text">Resend in {countdown}s</span>
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
