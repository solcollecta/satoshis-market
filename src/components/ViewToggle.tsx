'use client';

type ViewMode = 'grid' | 'list';

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

const modes: { key: ViewMode; label: string; icon: JSX.Element }[] = [
  {
    key: 'grid',
    label: 'Grid',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
{
    key: 'list',
    label: 'List',
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
        <rect x="1" y="1.5" width="14" height="3" rx="1" />
        <rect x="1" y="6.5" width="14" height="3" rx="1" />
        <rect x="1" y="11.5" width="14" height="3" rx="1" />
      </svg>
    ),
  },
];

export function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center bg-surface border border-surface-border rounded-lg p-1 shrink-0">
      {modes.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          title={label}
          className={`p-1.5 rounded-md transition-all duration-150 ${
            value === key
              ? 'bg-brand text-black'
              : 'text-slate-500 hover:text-white'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
