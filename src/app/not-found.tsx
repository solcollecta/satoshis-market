import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <p className="text-6xl font-bold text-slate-700">404</p>
      <p className="text-slate-400">Page not found.</p>
      <Link href="/" className="btn-primary">
        Go home
      </Link>
    </div>
  );
}
