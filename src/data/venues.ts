/**
 * Mock data for Venue & Partner Management. Shapes mirror the future API
 * contract (`GET /admin/venues`, `/admin/venues/:id`,
 * `PATCH /admin/venues/:id/commission`, etc.) so swapping these for real
 * fetches later is a one-file change.
 */

export type VenueStatus = "pending" | "active" | "inactive";
export type Sport =
  | "Box Cricket"
  | "Football"
  | "Badminton"
  | "Tennis"
  | "Turf"
  | "Futsal"
  | "Pickleball"
  | "Basketball";

export type CommissionChange = {
  id: string;
  date: string;
  previousRate: number;
  newRate: number;
  changedBy: string;
  note?: string;
};

export type Venue = {
  id: string;
  name: string;
  partnerId: string;
  city: string;
  area: string;
  address: string;
  status: VenueStatus;
  sports: Sport[];
  pricePerHour: number;
  description: string;
  images: string[];
  submittedDate: string;
  onboardedDate: string | null;
  commissionRate: number;
  commissionHistory: CommissionChange[];
  rejectionReason?: string;
  deactivationReason?: string;
};

export const DEFAULT_COMMISSION_RATE = 12;

function img(seed: string) {
  return `https://picsum.photos/seed/${seed}/640/400`;
}

export const venues: Venue[] = [
  {
    id: "ven-001",
    name: "Greenfield Box Cricket Arena",
    partnerId: "prt-001",
    city: "Kanpur",
    area: "Greenfield Colony",
    address: "12/4 Greenfield Colony, Near Ratanlal Nagar, Kanpur, UP 208022",
    status: "active",
    sports: ["Box Cricket"],
    pricePerHour: 1600,
    description:
      "Two full-size box cricket nets with synthetic turf, floodlights, and a small seating gallery. Popular for evening corporate matches.",
    images: [img("greenfield-1"), img("greenfield-2"), img("greenfield-3")],
    submittedDate: "2025-10-20",
    onboardedDate: "2025-10-28",
    commissionRate: 12,
    commissionHistory: [],
  },
  {
    id: "ven-002",
    name: "Kidwai Nagar Badminton Court",
    partnerId: "prt-002",
    city: "Kanpur",
    area: "Kidwai Nagar",
    address: "Block C, Kidwai Nagar, Kanpur, UP 208011",
    status: "pending",
    sports: ["Badminton"],
    pricePerHour: 500,
    description:
      "4 wooden-flooring indoor badminton courts with AC. Newly built facility, first-time JustPlay partner.",
    images: [img("kidwai-1"), img("kidwai-2")],
    submittedDate: "2026-08-19",
    onboardedDate: null,
    commissionRate: DEFAULT_COMMISSION_RATE,
    commissionHistory: [],
  },
  {
    id: "ven-003",
    name: "Swaroop Nagar Turf",
    partnerId: "prt-003",
    city: "Kanpur",
    area: "Swaroop Nagar",
    address: "Turf Lane, Swaroop Nagar, Kanpur, UP 208002",
    status: "active",
    sports: ["Football", "Turf"],
    pricePerHour: 1400,
    description:
      "5-a-side and 7-a-side synthetic turf football ground with floodlights. Weekend tournaments hosted regularly.",
    images: [img("swaroop-1"), img("swaroop-2"), img("swaroop-3")],
    submittedDate: "2025-09-05",
    onboardedDate: "2025-09-14",
    commissionRate: 15,
    commissionHistory: [
      {
        id: "ch-001",
        date: "2026-06-01",
        previousRate: 12,
        newRate: 15,
        changedBy: "Ananya Sharma",
        note: "Raised after repeated late-cancellation disputes to offset refund overhead.",
      },
    ],
  },
  {
    id: "ven-004",
    name: "Panki Sports Complex",
    partnerId: "prt-004",
    city: "Kanpur",
    area: "Panki",
    address: "Panki Industrial Area Phase II, Kanpur, UP 208020",
    status: "active",
    sports: ["Badminton", "Basketball"],
    pricePerHour: 800,
    description:
      "Multi-sport indoor complex with 2 badminton courts and 1 basketball half-court. Run by a local sports foundation.",
    images: [img("panki-1"), img("panki-2")],
    submittedDate: "2025-07-20",
    onboardedDate: "2025-07-28",
    commissionRate: 12,
    commissionHistory: [],
  },
  {
    id: "ven-005",
    name: "Civil Lines Tennis Club",
    partnerId: "prt-005",
    city: "Kanpur",
    area: "Civil Lines",
    address: "The Mall, Civil Lines, Kanpur, UP 208001",
    status: "active",
    sports: ["Tennis"],
    pricePerHour: 1200,
    description:
      "Premium clay and hard courts with resident coaches available for hourly hire. Kanpur's oldest tennis club.",
    images: [img("civil-1"), img("civil-2"), img("civil-3")],
    submittedDate: "2025-05-02",
    onboardedDate: "2025-05-10",
    commissionRate: 10,
    commissionHistory: [
      {
        id: "ch-002",
        date: "2025-11-15",
        previousRate: 12,
        newRate: 10,
        changedBy: "Ananya Sharma",
        note: "Loyalty discount — one of the platform's earliest and highest-volume partners.",
      },
    ],
  },
  {
    id: "ven-006",
    name: "Greenfield Futsal Ground",
    partnerId: "prt-001",
    city: "Kanpur",
    area: "Greenfield Colony",
    address: "12/6 Greenfield Colony, Near Ratanlal Nagar, Kanpur, UP 208022",
    status: "active",
    sports: ["Futsal"],
    pricePerHour: 1100,
    description: "Second venue from the Greenfield Sports group — an indoor futsal court with rubber flooring.",
    images: [img("greenfield-futsal-1"), img("greenfield-futsal-2")],
    submittedDate: "2026-02-10",
    onboardedDate: "2026-02-16",
    commissionRate: 12,
    commissionHistory: [],
  },
  {
    id: "ven-007",
    name: "Kalyanpur Futsal Ground",
    partnerId: "prt-006",
    city: "Kanpur",
    area: "Kalyanpur",
    address: "Near IIT Gate, Kalyanpur, Kanpur, UP 208017",
    status: "inactive",
    sports: ["Futsal"],
    pricePerHour: 900,
    description: "Outdoor futsal ground pulled from discovery after repeated no-shows and unresolved user complaints.",
    images: [img("kalyanpur-1"), img("kalyanpur-2")],
    submittedDate: "2026-06-01",
    onboardedDate: "2026-06-08",
    commissionRate: 12,
    commissionHistory: [],
    deactivationReason: "Multiple user complaints about ground condition and unresponsive partner staff.",
  },
  {
    id: "ven-008",
    name: "Yashoda Nagar Pickleball Court",
    partnerId: "prt-007",
    city: "Kanpur",
    area: "Yashoda Nagar",
    address: "Sector 5, Yashoda Nagar, Kanpur, UP 208011",
    status: "pending",
    sports: ["Pickleball"],
    pricePerHour: 600,
    description: "Newly converted pickleball court, part of the growing pickleball wave in Kanpur.",
    images: [img("yashoda-1"), img("yashoda-2")],
    submittedDate: "2026-08-27",
    onboardedDate: null,
    commissionRate: DEFAULT_COMMISSION_RATE,
    commissionHistory: [],
  },
  {
    id: "ven-009",
    name: "Kakadeo Sports Arena",
    partnerId: "prt-008",
    city: "Kanpur",
    area: "Kakadeo",
    address: "Kakadeo Market Road, Kanpur, UP 208025",
    status: "pending",
    sports: ["Box Cricket", "Football"],
    pricePerHour: 1300,
    description: "Multi-sport arena offering both box cricket and 5-a-side football on the same turf.",
    images: [img("kakadeo-1"), img("kakadeo-2")],
    submittedDate: "2026-08-29",
    onboardedDate: null,
    commissionRate: DEFAULT_COMMISSION_RATE,
    commissionHistory: [],
  },
];

export function getVenueById(id: string) {
  return venues.find((v) => v.id === id);
}

export const allCities = Array.from(new Set(venues.map((v) => v.city)));
export const allSports = Array.from(new Set(venues.flatMap((v) => v.sports))) as Sport[];
