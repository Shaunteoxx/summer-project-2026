import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The streak card while it loads: the count, today's bar and the week. */
export default function StreakSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="flex justify-between gap-2">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-9 w-9 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
