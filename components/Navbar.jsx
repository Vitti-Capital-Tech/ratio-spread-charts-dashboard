"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function Navbar({
  theme,
  toggleTheme,
  badgeLabel,
  badgeColor,
  badgeDotClassName,
  extraHeaderContent
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const activeTab = pathname.includes('/ratio-spread') ? 'scanner' : 'charts';

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/');
  };

  return (
    <>
      <nav className="navbar">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
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
          <span className="logo-text">VITTI OPTION<span>SCOPE</span></span>
        </div>

        <div className="nav-tabs-container">
          <Link
            href="/charts"
            className={`nav-tab ${activeTab === 'charts' ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <span className="nav-tab-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 20V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M4 20H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <rect x="7" y="12" width="3" height="6" rx="0.6" fill="currentColor" />
                <rect x="12" y="9" width="3" height="9" rx="0.6" fill="currentColor" />
                <rect x="17" y="6" width="3" height="12" rx="0.6" fill="currentColor" />
              </svg>
            </span> <span className="nav-tab-text">Charts</span>
          </Link>
          <Link
            href="/ratio-spread"
            className={`nav-tab ${activeTab === 'scanner' ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <span className="nav-tab-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="1.7" fill="currentColor" />
              </svg>
            </span> <span className="nav-tab-text">Ratio Spread</span>
          </Link>
        </div>

        <div className="nav-actions-container">
          {extraHeaderContent}
          {toggleTheme && (
            <button className="nav-tab" onClick={toggleTheme} title="Toggle Theme" style={{ padding: '6px' }}>
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </button>
          )}

          {!user ? (
            <Link href="/sign-in" className="nav-tab" style={{ padding: '6px 14px', background: 'var(--accent)', color: '#000', border: 'none', textDecoration: 'none' }}>
              Sign In / 2FA
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-dim)' }}>
                {user.email}
              </span>
              <button
                onClick={handleSignOut}
                className="nav-tab"
                style={{ padding: '6px 14px', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                Sign Out
              </button>
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
          className={`mobile-bottom-tab ${activeTab === 'charts' ? 'active' : ''}`}
          style={{ textDecoration: 'none' }}
        >
          <span className="mobile-bottom-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M4 20H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <rect x="7" y="12" width="3" height="6" rx="0.6" fill="currentColor" />
              <rect x="12" y="9" width="3" height="9" rx="0.6" fill="currentColor" />
              <rect x="17" y="6" width="3" height="12" rx="0.6" fill="currentColor" />
            </svg>
          </span>
          <span className="mobile-bottom-text">Charts</span>
        </Link>
        <Link
          href="/ratio-spread"
          className={`mobile-bottom-tab ${activeTab === 'scanner' ? 'active' : ''}`}
          style={{ textDecoration: 'none' }}
        >
          <span className="mobile-bottom-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            </svg>
          </span>
          <span className="mobile-bottom-text">Ratio Spread</span>
        </Link>
      </div>
    </>
  );
}
