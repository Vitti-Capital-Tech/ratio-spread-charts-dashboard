"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const activeTab = activeTabOverride || (pathname.includes('/ratio-spread') ? 'scanner' : 'charts');

  const handleTabClick = (e, tab) => {
    if (onTabChange) {
      e.preventDefault();
      onTabChange(tab);
    }
  };

  const handleSignOut = async () => {
    setShowSignOutModal(false);
    await authClient.signOut();
    window.location.href = '/';
  };

  return (
    <>
      <nav className="navbar">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CandlestickChart size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
          <span className="logo-text">VITTI OPTION<span>SCOPE</span></span>
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
          {extraHeaderContent}
          {toggleTheme && (
            <button className="nav-tab" onClick={toggleTheme} title="Toggle Theme" style={{ padding: '6px' }}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}

          {isPending ? (
            <span style={{ fontSize: '13px', color: 'var(--text-dim)', padding: '6px 12px' }}>
              Checking session...
            </span>
          ) : !user ? (
            <Link href="/sign-in" className="nav-tab" style={{ padding: '6px 14px', background: 'var(--accent)', color: '#000', border: 'none', textDecoration: 'none' }}>
              Sign In / 2FA
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-dim)' }}>
                {user.email}
              </span>
              <button
                onClick={() => setShowSignOutModal(true)}
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

      {/* Sign Out Confirmation Modal */}
      {showSignOutModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            padding: '24px',
            borderRadius: '12px',
            width: '320px',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: 'var(--text)', fontWeight: 600 }}>Confirm Sign Out</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--text-dim)' }}>
              Are you sure you want to sign out of your account?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowSignOutModal(false)}
                style={{ flex: 1, padding: '10px 0', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer', fontWeight: 500, transition: 'background 0.2s' }}
                onMouseOver={(e) => e.target.style.background = 'var(--hover-bg)'}
                onMouseOut={(e) => e.target.style.background = 'var(--bg2)'}
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                style={{ flex: 1, padding: '10px 0', background: 'var(--danger-color, #e02424)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 500, transition: 'opacity 0.2s' }}
                onMouseOver={(e) => e.target.style.opacity = '0.9'}
                onMouseOut={(e) => e.target.style.opacity = '1'}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
