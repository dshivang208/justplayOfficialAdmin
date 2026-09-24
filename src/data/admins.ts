/**
 * Mock data for Admin Roles & Access. Shapes mirror the future API
 * contract (`GET /admin/team`, `POST /admin/team`,
 * `PATCH /admin/team/:id`) so swapping this for a real fetch later is a
 * one-file change.
 */
import type { AdminRole } from "@/lib/admin-auth";

export type AdminTeamMember = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: "active" | "invited";
  addedDate: string;
};

export const adminTeam: AdminTeamMember[] = [
  {
    id: "adm_001",
    name: "Ananya Sharma",
    email: "admin@justplay.in",
    role: "Super Admin",
    status: "active",
    addedDate: "2025-06-01",
  },
  {
    id: "adm_002",
    name: "Rahul Kapoor",
    email: "rahul.kapoor@justplay.in",
    role: "Super Admin",
    status: "active",
    addedDate: "2025-06-01",
  },
  {
    id: "adm_003",
    name: "Divya Menon",
    email: "divya.menon@justplay.in",
    role: "Ops/Support",
    status: "active",
    addedDate: "2025-09-14",
  },
  {
    id: "adm_004",
    name: "Sameer Joshi",
    email: "sameer.joshi@justplay.in",
    role: "Ops/Support",
    status: "active",
    addedDate: "2026-01-20",
  },
  {
    id: "adm_005",
    name: "Kavya Reddy",
    email: "kavya.reddy@justplay.in",
    role: "Ops/Support",
    status: "invited",
    addedDate: "2026-08-25",
  },
];
