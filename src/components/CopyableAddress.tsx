'use client';

import { useState } from 'react';

interface Props {
  /** Full address that gets copied to clipboard */
  full: string;
  /** Optional pre-truncated string to display */
  display?: string;
  className?: string;
  /**
   * If true: address is white by default → turns orange on hover.
   * If false (default): address inherits color → turns white on hover.
   */
  orange?: boolean;
}

export function CopyableAddress({ full, display, className = '', orange = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const hoverStyle = (): React.CSSProperties => {
    if (copied) return { color: 'rgb(74,222,128)' };            // green-400
    if (hovered) return { color: orange ? '#f7931a' : '#f1f5f9' }; // brand or near-white
    return {};
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={copied ? 'Copied!' : 'Click to copy'}
      style={hoverStyle()}
      className={`font-mono break-all text-left cursor-pointer transition-colors duration-150 ${className}`}
    >
      {copied ? 'Copied!' : (display ?? full)}
    </button>
  );
}
