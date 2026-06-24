"use client";
import React, { useState, useEffect } from 'react';
import CustomSignIn from "@/components/CustomSignIn";
import { Sun, Moon } from 'lucide-react';

export default function SignInPage() {
  const [theme, setTheme] = useState('dark');

  // Load theme from localStorage on startup
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // Update document body and save theme on state change
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      width: '100vw',
      background: 'var(--bg)',
      position: 'relative'
    }}>
      {/* Floating Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        title="Toggle Theme"
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          width: '38px',
          height: '38px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.2s',
          zIndex: 10
        }}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <CustomSignIn />
    </div>
  );
}
