import type { Metadata } from "next";
import { RoomsDashboard } from "@/components/RoomsDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rooms | Roomboard",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function RoomsPage() {
  return <RoomsDashboard />;
}
