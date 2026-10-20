import { LoadingState } from "@/components/ui/loading-state";

export default function DashboardLoading() {
  return (
    <main className="py-8">
      <LoadingState message="Loading secure workspace..." />
    </main>
  );
}
