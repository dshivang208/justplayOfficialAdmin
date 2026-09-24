/**
 * Mock data for the consumer User Directory. Shapes mirror the future API
 * contract (`GET /admin/users`, `/admin/users/:id`) so swapping these for
 * real fetches later is a one-file change.
 */

export type UserStatus = "active" | "suspended";

export type ConsumerUser = {
  id: string;
  name: string;
  phone: string;
  city: string;
  joinDate: string;
  totalBookings: number;
  totalSpend: number;
  status: UserStatus;
  suspensionReason?: string;
};

export const users: ConsumerUser[] = [
  {
    id: "usr-001",
    name: "Rohan Malhotra",
    phone: "+91 98765 11122",
    city: "Kanpur",
    joinDate: "2025-12-01",
    totalBookings: 2,
    totalSpend: 2700,
    status: "active",
  },
  {
    id: "usr-002",
    name: "Priya Nair",
    phone: "+91 98765 22233",
    city: "Kanpur",
    joinDate: "2026-01-14",
    totalBookings: 2,
    totalSpend: 2600,
    status: "active",
  },
  {
    id: "usr-003",
    name: "Aditya Verma",
    phone: "+91 98765 33344",
    city: "Kanpur",
    joinDate: "2025-10-22",
    totalBookings: 2,
    totalSpend: 1600,
    status: "active",
  },
  {
    id: "usr-004",
    name: "Kabir Singh",
    phone: "+91 98765 44455",
    city: "Kanpur",
    joinDate: "2026-03-08",
    totalBookings: 1,
    totalSpend: 1200,
    status: "active",
  },
  {
    id: "usr-005",
    name: "Simran Kaur",
    phone: "+91 98765 55566",
    city: "Kanpur",
    joinDate: "2025-11-19",
    totalBookings: 2,
    totalSpend: 2700,
    status: "active",
  },
  {
    id: "usr-006",
    name: "Meera Iyer",
    phone: "+91 98765 66677",
    city: "Kanpur",
    joinDate: "2026-02-27",
    totalBookings: 1,
    totalSpend: 1400,
    status: "active",
  },
  {
    id: "usr-007",
    name: "Arjun Bhatia",
    phone: "+91 98765 77788",
    city: "Kanpur",
    joinDate: "2025-08-15",
    totalBookings: 1,
    totalSpend: 1400,
    status: "suspended",
    suspensionReason: "Repeated no-shows without cancelling and a disputed damage claim from a partner.",
  },
  {
    id: "usr-008",
    name: "Neha Gupta",
    phone: "+91 98765 88899",
    city: "Kanpur",
    joinDate: "2026-04-02",
    totalBookings: 1,
    totalSpend: 800,
    status: "active",
  },
  {
    id: "usr-009",
    name: "Saurabh Pandey",
    phone: "+91 98765 99900",
    city: "Kanpur",
    joinDate: "2025-09-30",
    totalBookings: 1,
    totalSpend: 1600,
    status: "active",
  },
  {
    id: "usr-010",
    name: "Isha Khanna",
    phone: "+91 98765 00011",
    city: "Kanpur",
    joinDate: "2026-06-11",
    totalBookings: 1,
    totalSpend: 600,
    status: "active",
  },
];

export function getUserById(id: string) {
  return users.find((u) => u.id === id);
}
