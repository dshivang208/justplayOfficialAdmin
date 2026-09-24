import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

export function AccessRestricted({ note }: { note: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold text-foreground">
          Restricted to Super Admin
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{note}</p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block text-sm font-semibold text-primary hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
