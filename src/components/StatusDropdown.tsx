'use client';

import { useEffect, useRef, useState } from 'react';

interface Option {
  key: string;
  label: string;
}

interface Props {
  options: Option[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}

// Exact values from globals.css select styles + tailwind.config surface colors
const S = {
  bg:       '#0E1320',  // surface-card
  border:   '#1A2236',  // surface-border
  hover:    '#141B2E',  // surface-elevated
  radius:   '0.625rem',
  text:     '#F1F5F9',
  textDim:  '#94A3B8',  // slate-400
} as const;

export function StatusDropdown({ options, selected, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>

      {/* Trigger — identical to <select w-auto !py-1.5 !text-sm> */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display:         'inline-flex',
          alignItems:      'center',
          gap:             '0.375rem',
          backgroundColor: S.bg,
          border:          `1px solid ${S.border}`,
          borderRadius:    S.radius,
          padding:         '0.375rem 1rem',
          fontSize:        '0.875rem',
          color:           S.text,
          cursor:          'pointer',
          whiteSpace:      'nowrap',
          lineHeight:      '1.5',
        }}
      >
        Status
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke={S.textDim}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            width:      '0.75rem',
            height:     '0.75rem',
            flexShrink: 0,
            transform:  open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <polyline points="4 6 8 10 12 6" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position:        'absolute',
            top:             'calc(100% + 4px)',
            left:            0,
            zIndex:          50,
            minWidth:        '9rem',
            backgroundColor: S.bg,
            border:          `1px solid ${S.border}`,
            borderRadius:    '0.75rem',
            boxShadow:       '0 8px 32px rgba(0,0,0,0.55)',
            overflow:        'hidden',
          }}
        >
          {options.map(({ key, label }) => (
            <label
              key={key}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '0.625rem',
                padding:    '0.6rem 0.875rem',
                cursor:     'pointer',
                fontSize:   '0.875rem',
                color:      S.text,
                userSelect: 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = S.hover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <input
                type="checkbox"
                checked={selected.has(key)}
                onChange={() => onToggle(key)}
                style={{
                  width:       '0.875rem',
                  height:      '0.875rem',
                  cursor:      'pointer',
                  accentColor: '#F7931A',
                  flexShrink:  0,
                }}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
