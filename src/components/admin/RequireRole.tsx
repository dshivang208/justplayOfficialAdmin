import type { ReactNode } from "react";
import { useAdminAuth } from "@/lib/admin-auth";
import { canAccessPath } from "@/lib/permissions";
import { AdminShell } from "@/components/admin/AdminShell";
import { AccessRestricted } from "@/components/admin/AccessRestricted";

/**
 * Wraps a page component with a role check for `path`. Renders the page
 * only if the current admin's role can access it — otherwise shows the
 * restricted placeholder inside the normal shell (sidebar still visible,
 * so the person can see where else they can go).
 *
 * This runs in addition to hiding the link in the sidebar/tabs — direct
 * navigation to the URL is blocked here regardless of how they got there.
 */
export function RequireRole({
  path,
  note,
  children,
}: {
  path: string;
  note: string;
  children: ReactNode;
}) {
  const { admin } = useAdminAuth();
  const allowed = admin ? canAccessPath(admin.role, path) : false;

  if (!allowed) {
    return (
      <AdminShell>
        <AccessRestricted note={note} />
      </AdminShell>
    );
  }

  return <>{children}</>;
}
