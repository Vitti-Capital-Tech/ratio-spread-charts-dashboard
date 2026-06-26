"use client";
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { CandlestickChart, BarChart3, Target, Sun, Moon } from 'lucide-react';

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
    await authClient.signOut();
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
              <span className="eq-bars" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2.5, height: 14 }}>
                {[6, 11, 14, 9, 5].map((h, n) => (
                  <i key={n} style={{ width: 3, height: h, borderRadius: 1, background: 'var(--accent)', transformOrigin: 'bottom', display: 'block' }} />
                ))}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Checking session…</span>
            </span>
          ) : !user ? (
            <Link href="/sign-in" className="nav-tab" style={{ padding: '6px 14px', background: 'var(--accent)', color: '#000', border: 'none', textDecoration: 'none' }}>
              Sign In / 2FA
            </Link>
          ) : (
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
          )}

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
    </>
  );
}
