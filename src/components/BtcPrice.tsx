'use client';

import { useEffect, useState } from 'react';

export function BtcPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchPrice = async () => {
    try {
      const res = await fetch('/api/btcprice');
      const data = await res.json() as { price: number | null };
      if (typeof data.price === 'number' && data.price > 0) {
        setPrice(data.price);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  };

  useEffect(() => {
    void fetchPrice();
    const id = setInterval(() => void fetchPrice(), 30_000);
    return () => clearInterval(id);
  }, []);

  const label = price !== null
    ? `$${price.toLocaleString('en-US')}`
    : failed ? '—' : '…';

  return (
    <div className="flex items-center gap-1.5 select-none">
      <span className="btc-symbol-neon text-brand font-bold text-sm leading-none">
        ₿
      </span>
      <span className="btc-price-neon text-sm font-semibold text-slate-200 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {label}
      </span>
    </div>
  );
}
