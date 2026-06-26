"use client";
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { CandlestickChart, BarChart3, Target, Sun, Moon } from 'lucide-react';

// Small equalizer-bar loader used for navbar status (session check / signing out)
function MiniBars() {
  return (
    <span className="eq-bars" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2.5, height: 14 }}>
      {[6, 11, 14, 9, 5].map((h, n) => (
        <i key={n} style={{ width: 3, height: h, borderRadius: 1, background: 'var(--accent)', transformOrigin: 'bottom', display: 'block' }} />
      ))}
    </span>
  );
}

export default function Navbar({
  theme,
  toggleTheme,
  badgeLabel,
  badgeColor,
  badgeDotClassName,
  extraHeaderContent,
  activeTabOverride,
  onTabChange
}) {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const [showSignOut, setShowSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signOutRef = useRef(null);

  const activeTab = activeTabOverride || (pathname.includes('/ratio-spread') ? 'scanner' : 'charts');

  // Dismiss the sign-out popover on outside click
  useEffect(() => {
    if (!showSignOut) return;
    const onDocClick = (e) => {
      if (signOutRef.current && !signOutRef.current.contains(e.target)) {
        setShowSignOut(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showSignOut]);

  const handleTabClick = (e, tab) => {
    if (onTabChange) {
      e.preventDefault();
      onTabChange(tab);
    }
  };

  const handleSignOut = async () => {
    setShowSignOut(false);
    setSigningOut(true); // hold this state through the redirect so the UI never flashes "Sign In"
    try {
      await authClient.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    window.location.href = '/';
  };

  return (
    <>
      <nav className="navbar">
        <div className="logo">
          <span className="logo-glyph">
            <CandlestickChart size={17} color="var(--accent)" style={{ flexShrink: 0 }} />
          </span>
          <span className="logo-wordmark">
            <span className="logo-b1">VITTI</span>
            <span className="logo-b2">Crypto Scanner</span>
          </span>
        </div>

        <div className="nav-tabs-container">
          <Link
            href="/charts"
            onClick={(e) => handleTabClick(e, 'charts')}
            className={`nav-tab ${activeTab === 'charts' ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <span className="nav-tab-icon" aria-hidden="true">
              <BarChart3 size={14} />
            </span> <span className="nav-tab-text">Charts</span>
          </Link>
          <Link
            href="/ratio-spread"
            onClick={(e) => handleTabClick(e, 'scanner')}
            className={`nav-tab ${activeTab === 'scanner' ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <span className="nav-tab-icon" aria-hidden="true">
              <Target size={14} />
            </span> <span className="nav-tab-text">Ratio Spread</span>
          </Link>
        </div>

        <div className="nav-actions-container">
          {toggleTheme && (
            <button className="nav-tab" onClick={toggleTheme} title="Toggle Theme" style={{ padding: '6px' }}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}

          {isPending ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
              <MiniBars />
              <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Checking session…</span>
            </span>
          ) : user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="nav-user-email" title={user.email}>
                {user.email}
              </span>
              <div ref={signOutRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowSignOut(v => !v)}
                  className="nav-tab"
                  style={{ padding: '6px 14px', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  Sign Out
                </button>

                {showSignOut && (
                  <div className="signout-popover">
                    <p className="signout-popover-text">Sign out of your account?</p>
                    <div className="signout-popover-actions">
                      <button className="signout-popover-cancel" onClick={() => setShowSignOut(false)}>Cancel</button>
                      <button className="signout-popover-confirm" onClick={handleSignOut}>Sign Out</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="ws-badge">
            <div className={`ws-dot ${badgeDotClassName || ''}`} style={badgeColor ? { background: badgeColor } : undefined} />
            <span>{badgeLabel || 'Disconnected'}</span>
          </div>
        </div>
      </nav>

      <div className="mobile-bottom-nav">
        <Link
          href="/charts"
          onClick={(e) => handleTabClick(e, 'charts')}
          className={`mobile-bottom-tab ${activeTab === 'charts' ? 'active' : ''}`}
          style={{ textDecoration: 'none' }}
        >
          <span className="mobile-bottom-icon">
            <BarChart3 size={18} />
          </span>
          <span className="mobile-bottom-text">Charts</span>
        </Link>
        <Link
          href="/ratio-spread"
          onClick={(e) => handleTabClick(e, 'scanner')}
          className={`mobile-bottom-tab ${activeTab === 'scanner' ? 'active' : ''}`}
          style={{ textDecoration: 'none' }}
        >
          <span className="mobile-bottom-icon">
            <Target size={18} />
          </span>
          <span className="mobile-bottom-text">Ratio Spread</span>
        </Link>
      </div>

      {/* Full-screen sign-out transition */}
      {signingOut && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            background: 'radial-gradient(ellipse at 50% 35%, rgba(240,185,11,0.05) 0%, transparent 60%), var(--bg)',
            WebkitBackdropFilter: 'blur(2px)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="brand-glyph" style={{
              width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0,
              background: 'linear-gradient(150deg, rgba(240,185,11,0.18), rgba(240,185,11,0.04))',
              border: '1px solid rgba(240,185,11,0.28)'
            }}>
              <CandlestickChart size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
            </span>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1, color: 'var(--accent)' }}>
              VITTI CRYPTO <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>SCANNER</span>
            </span>
          </div>
          <span className="eq-bars" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 4, height: 28 }}>
            {[14, 24, 28, 18, 11].map((h, n) => (
              <i key={n} style={{ width: 5, height: h, borderRadius: 2, background: 'var(--accent)', transformOrigin: 'bottom', display: 'block' }} />
            ))}
          </span>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Signing out…
          </div>
        </div>
      )}
    </>
  );
}
