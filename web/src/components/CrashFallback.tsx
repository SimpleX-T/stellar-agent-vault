import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

// Rendered by the Sentry ErrorBoundary when the app throws. A branded screen
// beats a white page, and the reset lets the user recover without a hard reload.
export function CrashFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-4 p-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary/60">
            <AlertTriangle className="size-6 text-[var(--neon-cyan)]" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Something broke</h2>
            <p className="text-sm text-muted-foreground">
              The app hit an unexpected error. It's been reported — try again.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button onClick={onReset}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
