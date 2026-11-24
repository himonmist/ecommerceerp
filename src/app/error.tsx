"use client";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">The problem has been logged. Please try again.</p>
        <button onClick={reset} className="btn-primary mt-6">Try again</button>
      </div>
    </div>
  );
}
