import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="animate-rise">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="mb-4 flex gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="space-y-2 rounded-brand border border-hairline bg-surface p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
