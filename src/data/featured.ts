/**
 * Mock data for Featured Content Control. Shapes mirror the future API
 * contract (`GET /admin/featured`, `PATCH /admin/featured/reorder`) so
 * swapping this for a real fetch later is a one-file change.
 */

/** Ordered list of featured venue IDs, as shown on the consumer homepage. */
export const featuredVenueIds: string[] = ["ven-001", "ven-005", "ven-003"];

export type CommunityContentType = "hosted_game" | "group" | "event";

export type CommunityContentItem = {
  id: string;
  type: CommunityContentType;
  title: string;
  subtitle: string;
};

export const communityContent: CommunityContentItem[] = [
  {
    id: "com-001",
    type: "hosted_game",
    title: "Sunday Morning Box Cricket",
    subtitle: "Greenfield Box Cricket Arena · Hosted by Rohan M.",
  },
  {
    id: "com-002",
    type: "group",
    title: "Kanpur Weekend Footballers",
    subtitle: "142 members · Football",
  },
  {
    id: "com-003",
    type: "event",
    title: "JustPlay Kanpur Badminton Open",
    subtitle: "Panki Sports Complex · 12 Sep 2026",
  },
  {
    id: "com-004",
    type: "hosted_game",
    title: "Weekday Evening Futsal",
    subtitle: "Greenfield Futsal Ground · Hosted by Simran K.",
  },
  {
    id: "com-005",
    type: "group",
    title: "Civil Lines Tennis Circle",
    subtitle: "38 members · Tennis",
  },
];

/** Ordered list of featured community content IDs. */
export const featuredCommunityIds: string[] = ["com-002", "com-003"];
