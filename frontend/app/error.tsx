'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-lg w-full border rounded p-4 bg-red-50 text-red-800">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="mt-2 text-sm break-all">{error?.message || 'Unexpected error'}</p>
            {error?.digest && <p className="mt-1 text-xs opacity-70">ref: {error.digest}</p>}
            <button className="mt-3 px-3 py-1.5 border rounded bg-white" onClick={() => reset()}>Try again</button>
          </div>
        </div>
      </body>
    </html>
  );
}


