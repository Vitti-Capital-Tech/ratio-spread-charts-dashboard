"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { authClient } from '@/lib/auth-client';
import { CandlestickChart, AlertCircle, Mail } from 'lucide-react';

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

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
    clearErrors
  } = useForm({
    defaultValues: {
      email: '',
      otp: ''
    }
  });

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

      if (error) {
        throw error;
      }

      // Force authClient to refresh its session cache
      await authClient.getSession();

      window.location.href = '/charts';
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
    setValue('otp', combinedCode, { shouldValidate: true });

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

          const combinedCode = newOtp.join('');
          setCode(combinedCode);
          setValue('otp', combinedCode, { shouldValidate: true });

          otpInputsRef.current[index - 1].focus();
        }
      } else {
        // Clear current box
        const newOtp = [...otpArray];
        newOtp[index] = "";
        setOtpArray(newOtp);

        const combinedCode = newOtp.join('');
        setCode(combinedCode);
        setValue('otp', combinedCode, { shouldValidate: true });
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

    const combinedCode = newOtp.join('');
    setCode(combinedCode);
    setValue('otp', combinedCode, { shouldValidate: true });

    // Focus last pasted element
    const focusIndex = Math.min(pasteData.length, 5);
    otpInputsRef.current[focusIndex].focus();
  };

  return (
    <div className="trader-signin-container">
      <div className="trader-card">
        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-logo-wrap">
            <CandlestickChart size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span className="brand-logo-text">VITTI CRYPTO <span>SCANNER</span></span>
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

        {/* System Error Message (like API failure) */}
        {error && (
          <div className="trader-error">
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Identifier Input */}
        {step === 'identifier' ? (
          <form onSubmit={handleSubmit(handleIdentifierSubmit)}>
            <div className="trader-label">
              <span>Trader Email</span>
            </div>
            <div className="trader-input-container" style={{ marginBottom: errors.email ? '14px' : '20px' }}>
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
                  pattern: {
                    value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    message: 'Please enter a valid email address'
                  }
                })}
              />
            </div>
            {errors.email && (
              <span className="field-error-text" style={{ marginTop: '-12px', marginBottom: '16px' }}>{errors.email.message}</span>
            )}
            <button type="submit" className="btn-trade" disabled={loading}>
              {loading ? <span className="trade-loader"></span> : 'Request Secure Link / Token'}
            </button>

          </form>
        ) : (
          /* Step 2: Verification Input */
          <form onSubmit={handleSubmit(handleVerificationSubmit)}>
            <div className="trader-label">
              <span>Security Token</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>6 Digits</span>
            </div>

            {/* Hidden Input field for react-hook-form to register and validate */}
            <input
              type="hidden"
              {...register('otp', {
                required: 'Verification token is required',
                minLength: { value: 6, message: 'Verification token must be 6 digits' },
                maxLength: { value: 6, message: 'Verification token must be 6 digits' }
              })}
            />

            <div className="otp-splits-wrapper" onPaste={handleOtpPaste}>
              {otpArray.map((digit, index) => (
                <input
                  key={index}
                  type="text"
                  pattern="\d*"
                  maxLength={1}
                  className={`otp-split-input ${errors.otp ? 'input-error' : ''}`}
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

            <button type="submit" className="btn-trade" disabled={loading || code.length !== 6}>
              {loading ? <span className="trade-loader"></span> : 'Authenticate'}
            </button>

            {/* Resend Actions */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { setStep('identifier'); setOtpArray(['', '', '', '', '', '']); setCode(''); setValue('otp', ''); clearErrors(); setError(''); }}
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
