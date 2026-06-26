"use client";
import React, { useState, useEffect } from 'react';
import ChartsView from './ChartsView';
import RatioSpreadScanner from './RatioSpreadScanner';
import Navbar from './Navbar';
import { useTabSync } from '../lib/useTabSync';
import { authClient } from '../lib/auth-client';
import { CandlestickChart } from 'lucide-react';

export default function Workspace({ defaultTab }) {
  const [activeTab, setActiveTab] = useState(defaultTab || 'charts');
  const [theme, setTheme] = useState('dark');
  const [chartsNavbarProps, setChartsNavbarProps] = useState({});
  const [scannerNavbarProps, setScannerNavbarProps] = useState({});

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) setTheme(savedTheme);
  }, []);

  const { broadcast } = useTabSync({
    theme,
    setTheme,
    handlers: {}
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Listen to popstate for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.includes('/ratio-spread')) {
        setActiveTab('scanner');
      } else if (path.includes('/charts')) {
        setActiveTab('charts');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const { data: session, isPending } = authClient.useSession();

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const newPath = newTab === 'charts' ? '/charts' : '/ratio-spread';
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, '', newPath);
    }
  };

  if (isPending) {
    return (
      <div
        className="workspace-loader"
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '18px',
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
          <span className="workspace-loader-title" style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1, color: 'var(--accent)' }}>
            VITTI CRYPTO <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>SCANNER</span>
          </span>
        </div>
        <div className="workspace-loader-bars" aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 28 }}>
          {[0, 1, 2, 3, 4].map(n => (
            <i key={n} style={{ width: 5, height: 14, borderRadius: 2, background: 'var(--accent)', display: 'block' }} />
          ))}
        </div>
        <div className="workspace-loader-text" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          Loading workspace…
        </div>
      </div>
    );
  }

  const userKey = session?.user?.id || 'anonymous';
  const activeNavbarProps = activeTab === 'charts' ? chartsNavbarProps : scannerNavbarProps;

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        theme={theme}
        toggleTheme={toggleTheme}
        activeTabOverride={activeTab}
        onTabChange={handleTabChange}
        badgeLabel={activeNavbarProps.badgeLabel}
        badgeDotClassName={activeNavbarProps.badgeDotClassName}
        extraHeaderContent={
          activeNavbarProps.extraHeaderContent && (
            <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
              {activeNavbarProps.extraHeaderContent}
            </span>
          )
        }
      />
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: activeTab === 'charts' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
          <ChartsView
            theme={theme}
            toggleTheme={toggleTheme}
            setNavbarProps={setChartsNavbarProps}
            userKey={userKey}
          />
        </div>
        <div style={{ display: activeTab === 'scanner' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
          <RatioSpreadScanner
            theme={theme}
            toggleTheme={toggleTheme}
            setNavbarProps={setScannerNavbarProps}
            userKey={userKey}
          />
        </div>
      </div>
    </div>
  );
}
