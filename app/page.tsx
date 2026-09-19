import { LandingPage } from "@/components/LandingPage";

export const dynamic = "force-dynamic";

type StarterId = "landing-review" | "moodboard" | "blank";

type HomeSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStarterId(value: string | undefined): StarterId | null {
  const normalized = value?.toLowerCase().replace(/_/g, "-").trim();

  if (!normalized) return null;
  if (["landing", "landing-page", "landing-review", "review"].includes(normalized)) return "landing-review";
  if (["mood", "moodboard", "references", "brand"].includes(normalized)) return "moodboard";
  if (["blank", "empty", "scratch"].includes(normalized)) return "blank";
  return null;
}

function readInitialStarter(params: Awaited<HomeSearchParams>): StarterId {
  return (
    normalizeStarterId(firstParam(params.starter)) ??
    normalizeStarterId(firstParam(params.template)) ??
    normalizeStarterId(firstParam(params.use_case)) ??
    normalizeStarterId(firstParam(params.campaign)) ??
    "landing-review"
  );
}

function readEntryIntent(params: Awaited<HomeSearchParams>): StarterId | undefined {
  return (
    normalizeStarterId(firstParam(params.starter)) ??
    normalizeStarterId(firstParam(params.template)) ??
    normalizeStarterId(firstParam(params.use_case)) ??
    normalizeStarterId(firstParam(params.campaign)) ??
    undefined
  );
}

export default async function HomePage({ searchParams }: { searchParams: HomeSearchParams }) {
  const params = await searchParams;

  return <LandingPage entryIntent={readEntryIntent(params)} initialStarter={readInitialStarter(params)} />;
}
