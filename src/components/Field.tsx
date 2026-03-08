interface FieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}

export function Field({ label, value, mono = false, className = '' }: FieldProps) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-slate-200 break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
