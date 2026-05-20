import { Link } from 'react-router-dom';

export const NotFoundPage = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
    <div className="max-w-xl w-full rounded-3xl border border-slate-200 bg-white p-10 shadow-lg">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Page Not Found</p>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900">Oops, we couldn’t find that page.</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          The link may be broken or the page may have moved. Try going back to the home page.
        </p>
      </div>
      <div className="mt-8 flex justify-center">
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Go to Home
        </Link>
      </div>
    </div>
  </div>
);
