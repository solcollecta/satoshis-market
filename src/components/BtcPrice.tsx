'use client';

import { useEffect, useState } from 'react';

export function BtcPrice() {
  const [price, setPrice] = useState<number | null>(null);

  const fetch$ = async () => {
    try {
      const res  = await fetch('/api/btcprice');
      const data = await res.json() as { price: number | null };
      if (data.price) setPrice(data.price);
    } catch { /* silently ignore */ }
  };

  useEffect(() => {
    void fetch$();
    const id = setInterval(() => void fetch$(), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-1.5 select-none">
      <span className="btc-symbol-neon text-brand font-bold text-base leading-none">
        ₿
      </span>
      <span className="btc-price-neon text-sm font-mono font-semibold text-slate-200">
        {price ? `$${price.toLocaleString('en-US')}` : '…'}
      </span>
    </div>
  );
}
