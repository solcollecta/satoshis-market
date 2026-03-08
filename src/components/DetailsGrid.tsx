import React from 'react';

/**
 * DetailsGrid — 2-column CSS grid for key-value detail panels.
 *
 * Every pair of <DCell> children shares one grid row.
 * gap-x-6 separates columns; gap-y-5 separates rows.
 *
 * WHY THIS CANNOT MISALIGN:
 *  1. CSS grid places items 1+2 in row 1, items 3+4 in row 2, etc.
 *     Both cells in a row start at the same Y — enforced by the grid.
 *  2. Every DCell has identical internal structure:
 *       block <div> label  (same class → same rendered height)
 *       block <div> value  (starts at label-height + mb offset)
 *     So labels are at the same Y, and values are at the same Y.
 *  3. All elements are block-level <div>s — no inline baseline quirks.
 *  4. min-w-0 + break-words prevent overflow without shifting layout.
 *  5. No flex items-center anywhere — nothing shifts content vertically.
 */
export function DetailsGrid({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-5 ${className ?? ''}`}>
      {children}
    </div>
  );
}

/**
 * DCell — a single cell within a DetailsGrid.
 *
 * @param label     - uppercase label text
 * @param bordered  - adds a left border + padding (for right-column hero cells)
 * @param hero      - uses larger label-to-value spacing (mb-4 vs mb-1)
 */
export function DCell({ label, children, bordered, hero, className }: {
  label: string;
  children: React.ReactNode;
  bordered?: boolean;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0${bordered ? ' border-l border-surface-border pl-6' : ''}${className ? ` ${className}` : ''}`}>
      <div className={`section-label ${hero ? 'mb-4' : 'mb-1'}`}>{label}</div>
      <div className="text-sm text-slate-200 break-words">{children}</div>
    </div>
  );
}