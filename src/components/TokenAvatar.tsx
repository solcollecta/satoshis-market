'use client';

/**
 * TokenAvatar — deterministic circular avatar for OP-20 tokens.
 *
 * When a token has no logo, this renders a coloured circle with the token
 * symbol's initials. The background colour is derived from the contract
 * address so it is always the same for the same token.
 *
 * Sizes:
 *   xs  24 × 24   1 char   — inline / compact lists
 *   sm  32 × 32   2 chars  — token picker rows
 *   md  40 × 40   3 chars  — standard cards
 *   lg  56 × 56   3 chars  — detail / hero area
 */

interface Props {
  /** Contract address — used to derive the background colour. */
  address: string;
  /** Token symbol — first N characters shown as the label. */
  symbol: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/** djb2-style hash → integer. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Map a contract address to an HSL colour.
 * Saturation and lightness are fixed so all avatars look cohesive and white
 * text is always readable. Only the hue varies.
 */
function addressToColor(address: string): string {
  const hue = hashStr(address.toLowerCase()) % 360;
  return `hsl(${hue}, 62%, 38%)`;
}

const SIZE: Record<
  NonNullable<Props['size']>,
  { wh: string; text: string; chars: number }
> = {
  xs: { wh: 'w-6 h-6',   text: 'text-[9px]',  chars: 1 },
  sm: { wh: 'w-8 h-8',   text: 'text-[11px]', chars: 2 },
  md: { wh: 'w-10 h-10', text: 'text-sm',      chars: 3 },
  lg: { wh: 'w-14 h-14', text: 'text-base',    chars: 3 },
};

export function TokenAvatar({ address, symbol, size = 'md', className = '' }: Props) {
  const { wh, text, chars } = SIZE[size];
  const label = symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, chars).toUpperCase() || '?';
  const bg    = addressToColor(address);

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 select-none ${wh} ${text} ${className}`}
      style={{ backgroundColor: bg, color: 'rgba(255,255,255,0.93)' }}
      aria-label={symbol}
    >
      {label}
    </div>
  );
}
