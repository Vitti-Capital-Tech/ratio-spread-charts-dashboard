"use client";
import React from 'react';

const CustomInput = React.forwardRef(({
  type = 'text',
  disabled = false,
  className = '',
  style = {},
  error = false,
  prefix,        // inline unit shown before the value, e.g. "$" or "1:"
  suffix,        // inline unit shown after the value, e.g. "%"
  showStepper = false,
  step = 1,
  min = 0,
  width,         // convenience: sets wrapper width when adorned
  value,
  onChange,
  ...props
}, ref) => {
  const hasAdornment = prefix != null || suffix != null || showStepper;

  // Backward-compatible plain input (unchanged from the original component)
  if (!hasAdornment) {
    return (
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        className={`custom-input-field ${error ? 'error' : ''} ${className}`}
        style={style}
        value={value}
        onChange={onChange}
        {...props}
      />
    );
  }

  const decimals = step % 1 !== 0 ? (String(step).split('.')[1] || '').length : 0;

  const emit = (nextVal) => {
    if (onChange) onChange({ target: { value: String(nextVal) } });
  };

  const bump = (dir) => {
    if (disabled) return;
    const current = parseFloat(value);
    const base = Number.isFinite(current) ? current : 0;
    let next = base + dir * step;
    if (min != null) next = Math.max(min, next);
    emit(decimals ? Number(next.toFixed(decimals)) : next);
  };

  const wrapperStyle = width != null ? { width, ...style } : style;

  return (
    <div
      className={`uin ${error ? 'error' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      style={wrapperStyle}
    >
      {prefix != null && <span className="uin-pre">{prefix}</span>}
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        className="uin-input"
        value={value}
        onChange={onChange}
        {...props}
      />
      {suffix != null && <span className="uin-suf">{suffix}</span>}
      {showStepper && (
        <span className="uin-step">
          <button type="button" tabIndex={-1} aria-label="Increase" onClick={() => bump(1)} disabled={disabled}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
          </button>
          <button type="button" tabIndex={-1} aria-label="Decrease" onClick={() => bump(-1)} disabled={disabled}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </span>
      )}
    </div>
  );
});

CustomInput.displayName = 'CustomInput';

export default CustomInput;
