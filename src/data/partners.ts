/**
 * Mock data for the Partner Directory. Shapes mirror the future API
 * contract (`GET /admin/partners`, `/admin/partners/:id`) so swapping
 * these for real fetches later is a one-file change.
 */

export type KycStatus = "verified" | "pending" | "rejected";
export type PayoutAccountStatus = "verified" | "pending" | "not_linked";

export type StaffMember = {
  id: string;
  name: string;
  role: string;
  phone: string;
};

export type Partner = {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  city: string;
  kycStatus: KycStatus;
  payoutAccountStatus: PayoutAccountStatus;
  venueIds: string[];
  staff: StaffMember[];
  joinedDate: string;
  flagged: boolean;
  flagReason?: string;
};

export const partners: Partner[] = [
  {
    id: "prt-001",
    businessName: "Greenfield Sports Pvt Ltd",
    ownerName: "Vikram Chaudhary",
    phone: "+91 98390 11223",
    email: "vikram@greenfieldsports.in",
    city: "Kanpur",
    kycStatus: "verified",
    payoutAccountStatus: "verified",
    venueIds: ["ven-001", "ven-006"],
    staff: [
      { id: "stf-001", name: "Rakesh Yadav", role: "Ground Manager", phone: "+91 98765 00011" },
      { id: "stf-002", name: "Sunita Devi", role: "Front Desk", phone: "+91 98765 00012" },
    ],
    joinedDate: "2025-11-02",
    flagged: false,
  },
  {
    id: "prt-002",
    businessName: "Kidwai Nagar Sports Complex",
    ownerName: "Farhan Ali Khan",
    phone: "+91 90261 44556",
    email: "farhan@knsportscomplex.in",
    city: "Kanpur",
    kycStatus: "pending",
    payoutAccountStatus: "pending",
    venueIds: ["ven-002"],
    staff: [{ id: "stf-003", name: "Farhan Ali Khan", role: "Owner", phone: "+91 90261 44556" }],
    joinedDate: "2026-08-19",
    flagged: false,
  },
  {
    id: "prt-003",
    businessName: "Swaroop Nagar Turf Co.",
    ownerName: "Deepak Mishra",
    phone: "+91 99565 77889",
    email: "deepak@sntufco.in",
    city: "Kanpur",
    kycStatus: "verified",
    payoutAccountStatus: "not_linked",
    venueIds: ["ven-003"],
    staff: [],
    joinedDate: "2025-09-14",
    flagged: true,
    flagReason: "3 unresolved refund complaints in the last 30 days.",
  },
  {
    id: "prt-004",
    businessName: "Panki Sports Foundation",
    ownerName: "Meenal Tripathi",
    phone: "+91 97940 22334",
    email: "meenal@pankisports.org",
    city: "Kanpur",
    kycStatus: "verified",
    payoutAccountStatus: "verified",
    venueIds: ["ven-004"],
    staff: [
      { id: "stf-004", name: "Arjun Nair", role: "Ground Manager", phone: "+91 98765 00044" },
    ],
    joinedDate: "2025-07-28",
    flagged: false,
  },
  {
    id: "prt-005",
    businessName: "Civil Lines Racquet Club",
    ownerName: "Alok Srivastava",
    phone: "+91 98123 66778",
    email: "alok@clracquetclub.in",
    city: "Kanpur",
    kycStatus: "verified",
    payoutAccountStatus: "verified",
    venueIds: ["ven-005"],
    staff: [
      { id: "stf-005", name: "Pooja Rawat", role: "Front Desk", phone: "+91 98765 00055" },
      { id: "stf-006", name: "Manoj Tiwari", role: "Coach", phone: "+91 98765 00056" },
    ],
    joinedDate: "2025-05-10",
    flagged: false,
  },
  {
    id: "prt-006",
    businessName: "Kalyanpur Futsal Arena",
    ownerName: "Rehan Siddiqui",
    phone: "+91 96219 99001",
    email: "rehan@kalyanpurfutsal.in",
    city: "Kanpur",
    kycStatus: "rejected",
    payoutAccountStatus: "not_linked",
    venueIds: ["ven-007"],
    staff: [],
    joinedDate: "2026-08-25",
    flagged: false,
  },
  {
    id: "prt-007",
    businessName: "Yashoda Nagar Paddle Club",
    ownerName: "Ritu Bajpai",
    phone: "+91 91234 55009",
    email: "ritu@ynpaddleclub.in",
    city: "Kanpur",
    kycStatus: "pending",
    payoutAccountStatus: "pending",
    venueIds: ["ven-008"],
    staff: [],
    joinedDate: "2026-08-27",
    flagged: false,
  },
  {
    id: "prt-008",
    businessName: "Kakadeo Sports Arena LLP",
    ownerName: "Nikhil Awasthi",
    phone: "+91 95608 33221",
    email: "nikhil@kakadeoarena.in",
    city: "Kanpur",
    kycStatus: "pending",
    payoutAccountStatus: "pending",
    venueIds: ["ven-009"],
    staff: [],
    joinedDate: "2026-08-29",
    flagged: false,
  },
];

export function getPartnerById(id: string) {
  return partners.find((p) => p.id === id);
}
