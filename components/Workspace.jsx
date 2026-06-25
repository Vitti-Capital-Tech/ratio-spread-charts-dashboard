"use client";
import React, { useState, useEffect } from 'react';
import ChartsView from './ChartsView';
import RatioSpreadScanner from './RatioSpreadScanner';
import Navbar from './Navbar';
import { useTabSync } from '../lib/useTabSync';
import { authClient } from '../lib/auth-client';

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
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>Loading workspace...</div>;
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
