export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
      <div className="h-4 w-20 bg-surface-card rounded" />
      <div className="h-8 w-48 bg-surface-card rounded" />
      <div className="card h-64 bg-surface-card/50" />
    </div>
  );
}
