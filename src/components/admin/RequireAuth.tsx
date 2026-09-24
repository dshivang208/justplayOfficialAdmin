import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAdminAuth } from "@/lib/admin-auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, hydrated } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      void navigate({ to: "/login" });
    }
  }, [hydrated, isAuthenticated, navigate]);

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
