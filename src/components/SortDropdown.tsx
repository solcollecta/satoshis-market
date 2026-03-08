'use client';

import { useEffect, useRef, useState } from 'react';

interface Option {
  key: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (key: string) => void;
}

const S = {
  bg:       '#0E1320',
  border:   '#1A2236',
  hover:    '#141B2E',
  radius:   '0.625rem',
  text:     '#F1F5F9',
  textDim:  '#94A3B8',
  brand:    '#F7931A',
} as const;

export function SortDropdown({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeLabel = options.find(o => o.key === value)?.label ?? 'Sort';

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
        {activeLabel}
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
            <button
              key={key}
              type="button"
              onClick={() => { onChange(key); setOpen(false); }}
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             '0.5rem',
                width:           '100%',
                padding:         '0.6rem 0.875rem',
                cursor:          'pointer',
                fontSize:        '0.875rem',
                color:           value === key ? S.brand : S.text,
                fontWeight:      value === key ? 600 : 400,
                backgroundColor: 'transparent',
                border:          'none',
                userSelect:      'none',
                textAlign:       'left',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = S.hover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
