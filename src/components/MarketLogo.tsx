interface Props {
  className?: string;
  size?: number;
}

/**
 * Satoshi's Market logo mark.
 * A minimal market canopy silhouette with a Bitcoin-orange apex accent.
 * Scalable, no text — use alongside the wordmark.
 */
export function MarketLogo({ className = '', size = 28 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Market canopy sides */}
      <path
        d="M4 27 L18 9 L32 27"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Subtle platform underline */}
      <line
        x1="4"
        y1="30"
        x2="32"
        y2="30"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.28"
      />
      {/* Bitcoin orange apex */}
      <circle cx="18" cy="9" r="3.5" fill="#F7931A" />
      {/* Inner dot */}
      <circle cx="18" cy="9" r="1.5" fill="#000" opacity="0.3" />
    </svg>
  );
}
