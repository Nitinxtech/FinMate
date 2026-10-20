import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  message,
  retryLabel = "Try again",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn("rounded-md border border-destructive/40 bg-destructive/10 p-4", className)}
      role="alert"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 text-destructive" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-destructive">{title}</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
