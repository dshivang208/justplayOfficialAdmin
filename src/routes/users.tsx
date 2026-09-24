import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { UserStatusBadge } from "@/components/admin/StatusBadge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { listUsers, type AdminUser } from "@/lib/admin-data/users";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function UsersListPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load users."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            User Directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading\u2026" : `${users.length} registered consumer accounts`}
          </p>
        </div>

        {loadError && <p className="mb-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="surface-card overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Total bookings</TableHead>
                  <TableHead>Total spend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="group">
                    <TableCell>
                      <Link
                        to="/users/$userId"
                        params={{ userId: user.id }}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.phone}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.joinDate)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.totalBookings}</TableCell>
                    <TableCell className="text-sm text-foreground">
                      \u20b9{user.totalSpend.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <UserStatusBadge status={user.status} />
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/users/$userId"
                        params={{ userId: user.id }}
                        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}