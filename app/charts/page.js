"use client";
import React, { useState, useEffect } from 'react';
import ChartsView from '../../components/ChartsView';
import { useTabSync } from '../../lib/useTabSync';

export default function ChartsPage() {
  const [theme, setTheme] = useState('dark');

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

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <ChartsView 
        theme={theme} 
        toggleTheme={toggleTheme} 
        broadcast={broadcast}
      />
    </div>
  );
}
