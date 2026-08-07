export function RouteLoading() {
  return (
    <div className="max-w-2xl animate-pulse space-y-4" aria-busy="true">
      <div className="h-7 w-40 rounded bg-neutral-200" />
      <div className="h-4 w-full rounded bg-neutral-100" />
      <div className="h-4 w-2/3 rounded bg-neutral-100" />
    </div>
  );
}
