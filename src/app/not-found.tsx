import Link from "next/link";
export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-brand-600">404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">We couldn&apos;t find that page</h1>
        <Link href="/" className="btn-primary mt-6">Go home</Link>
      </div>
    </div>
  );
}
