/**
 * Mock data for the platform-wide Bookings view and Dispute/No-Show queue.
 * Shapes mirror the future API contract (`GET /admin/bookings`,
 * `/admin/bookings/:id`, `PATCH /admin/bookings/:id`) so swapping these
 * for real fetches later is a one-file change.
 */
import { getVenueById } from "@/data/venues";
import { getUserById } from "@/data/users";

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show" | "disputed";
export type PaymentStatus = "paid" | "refunded" | "failed" | "pending";
export type DisputeType = "no_show" | "dispute";
export type DisputeResolution = "unresolved" | "resolved" | "credit_issued" | "no_action";

export type BookingDispute = {
  type: DisputeType;
  raisedBy: "partner" | "consumer";
  reason: string;
  resolution: DisputeResolution;
  resolutionNote?: string;
  creditAmount?: number;
};

export type Booking = {
  id: string;
  customerId: string;
  venueId: string;
  sport: string;
  date: string;
  time: string;
  amount: number;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  cancellationReason?: string;
  dispute?: BookingDispute;
};

export const bookings: Booking[] = [
  {
    id: "BKG-1001",
    customerId: "usr-001",
    venueId: "ven-001",
    sport: "Box Cricket",
    date: "2026-08-31",
    time: "6:00 PM – 7:00 PM",
    amount: 1600,
    paymentStatus: "paid",
    bookingStatus: "completed",
  },
  {
    id: "BKG-1002",
    customerId: "usr-002",
    venueId: "ven-003",
    sport: "Football",
    date: "2026-08-30",
    time: "5:00 PM – 6:00 PM",
    amount: 1400,
    paymentStatus: "refunded",
    bookingStatus: "cancelled",
    cancellationReason: "Cancelled by customer within the free-cancellation window.",
  },
  {
    id: "BKG-1003",
    customerId: "usr-003",
    venueId: "ven-004",
    sport: "Badminton",
    date: "2026-08-30",
    time: "7:00 AM – 8:00 AM",
    amount: 800,
    paymentStatus: "paid",
    bookingStatus: "completed",
  },
  {
    id: "BKG-1004",
    customerId: "usr-004",
    venueId: "ven-005",
    sport: "Tennis",
    date: "2026-09-02",
    time: "6:00 AM – 7:00 AM",
    amount: 1200,
    paymentStatus: "paid",
    bookingStatus: "confirmed",
  },
  {
    id: "BKG-1005",
    customerId: "usr-005",
    venueId: "ven-001",
    sport: "Box Cricket",
    date: "2026-08-29",
    time: "8:00 PM – 9:00 PM",
    amount: 1600,
    paymentStatus: "paid",
    bookingStatus: "completed",
  },
  {
    id: "BKG-1006",
    customerId: "usr-006",
    venueId: "ven-007",
    sport: "Futsal",
    date: "2026-08-29",
    time: "6:00 PM – 7:00 PM",
    amount: 1400,
    paymentStatus: "paid",
    bookingStatus: "cancelled",
    cancellationReason: "Cancelled outside the refund window — amount not refunded.",
  },
  {
    id: "BKG-1007",
    customerId: "usr-001",
    venueId: "ven-006",
    sport: "Futsal",
    date: "2026-08-28",
    time: "7:00 PM – 8:00 PM",
    amount: 1100,
    paymentStatus: "paid",
    bookingStatus: "no_show",
    dispute: {
      type: "no_show",
      raisedBy: "partner",
      reason: "Customer did not show up. Ground was held for an hour past the slot start.",
      resolution: "unresolved",
    },
  },
  {
    id: "BKG-1008",
    customerId: "usr-007",
    venueId: "ven-003",
    sport: "Football",
    date: "2026-08-27",
    time: "6:00 PM – 7:00 PM",
    amount: 1400,
    paymentStatus: "paid",
    bookingStatus: "disputed",
    dispute: {
      type: "dispute",
      raisedBy: "partner",
      reason:
        "Partner reports the group damaged the goal netting and is requesting a deduction from any refund.",
      resolution: "unresolved",
    },
  },
  {
    id: "BKG-1009",
    customerId: "usr-008",
    venueId: "ven-004",
    sport: "Badminton",
    date: "2026-08-27",
    time: "9:00 AM – 10:00 AM",
    amount: 800,
    paymentStatus: "paid",
    bookingStatus: "completed",
  },
  {
    id: "BKG-1010",
    customerId: "usr-002",
    venueId: "ven-005",
    sport: "Tennis",
    date: "2026-08-26",
    time: "6:00 PM – 7:00 PM",
    amount: 1200,
    paymentStatus: "failed",
    bookingStatus: "cancelled",
    cancellationReason: "Payment failed at checkout — slot released automatically.",
  },
  {
    id: "BKG-1011",
    customerId: "usr-009",
    venueId: "ven-001",
    sport: "Box Cricket",
    date: "2026-08-25",
    time: "7:00 PM – 8:00 PM",
    amount: 1600,
    paymentStatus: "paid",
    bookingStatus: "disputed",
    dispute: {
      type: "dispute",
      raisedBy: "consumer",
      reason: "Customer says the nets were damaged and the ground was in poor condition on arrival.",
      resolution: "credit_issued",
      resolutionNote: "Verified with partner photos — issued a goodwill credit for the inconvenience.",
      creditAmount: 400,
    },
  },
  {
    id: "BKG-1012",
    customerId: "usr-010",
    venueId: "ven-008",
    sport: "Pickleball",
    date: "2026-08-24",
    time: "5:00 PM – 6:00 PM",
    amount: 600,
    paymentStatus: "paid",
    bookingStatus: "no_show",
    dispute: {
      type: "no_show",
      raisedBy: "partner",
      reason: "First reported no-show for this customer.",
      resolution: "no_action",
      resolutionNote: "First-time occurrence — warning noted on account, no penalty applied.",
    },
  },
  {
    id: "BKG-1013",
    customerId: "usr-003",
    venueId: "ven-004",
    sport: "Badminton",
    date: "2026-08-23",
    time: "8:00 AM – 9:00 AM",
    amount: 800,
    paymentStatus: "paid",
    bookingStatus: "completed",
  },
  {
    id: "BKG-1014",
    customerId: "usr-005",
    venueId: "ven-006",
    sport: "Futsal",
    date: "2026-08-22",
    time: "6:00 PM – 7:00 PM",
    amount: 1100,
    paymentStatus: "paid",
    bookingStatus: "completed",
  },
];

export function getBookingById(id: string) {
  return bookings.find((b) => b.id === id);
}

export function getBookingsForUser(userId: string) {
  return bookings.filter((b) => b.customerId === userId);
}

/** Enriched view with venue/customer names resolved, for table display. */
export function enrichBooking(booking: Booking) {
  const venue = getVenueById(booking.venueId);
  const customer = getUserById(booking.customerId);
  return {
    ...booking,
    venueName: venue?.name ?? "Unknown venue",
    city: venue?.city ?? "—",
    customerName: customer?.name ?? "Unknown customer",
  };
}

export const allVenueNames = Array.from(
  new Set(bookings.map((b) => getVenueById(b.venueId)?.name).filter(Boolean)),
) as string[];
