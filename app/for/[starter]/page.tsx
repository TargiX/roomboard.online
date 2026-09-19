import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingPage, type StarterId } from "@/components/LandingPage";

export const dynamic = "force-dynamic";

type ForStarterPageProps = {
  params: Promise<{
    starter: string;
  }>;
};

type StarterLandingConfig = {
  description: string;
  metaTitle: string;
  path: string;
  starterId: StarterId;
};

const starterLandingConfigs: Record<string, StarterLandingConfig> = {
  "landing-review": {
    description:
      "Open a private launch approval room with a clean workflow for the decision, real material, approval criteria, reviewer calls, and the final record.",
    metaTitle: "Approve what ships before launch",
    path: "/for/landing-review",
    starterId: "landing-review",
  },
  moodboard: {
    description:
      "Open a private moodboard decision room for references, criteria, comments, and a clear visual direction without losing the call in a thread.",
    metaTitle: "Choose a visual direction without a messy thread",
    path: "/for/moodboard",
    starterId: "moodboard",
  },
  "blank-room": {
    description:
      "Open a private visual decision room for prepared screenshots, product states, or references, with invite links and owner backup access.",
    metaTitle: "Start a private visual decision room",
    path: "/for/blank-room",
    starterId: "blank",
  },
};

const starterAliases: Record<string, keyof typeof starterLandingConfigs> = {
  blank: "blank-room",
  empty: "blank-room",
  landing: "landing-review",
  "landing-page": "landing-review",
  review: "landing-review",
  mood: "moodboard",
  references: "moodboard",
  brand: "moodboard",
};

function readStarterLanding(slug: string) {
  const normalized = slug.toLowerCase().replace(/_/g, "-").trim();
  const canonical = normalized in starterLandingConfigs ? normalized : starterAliases[normalized];

  return canonical ? starterLandingConfigs[canonical] : null;
}

export function generateStaticParams() {
  return Object.keys(starterLandingConfigs).map((starter) => ({ starter }));
}

export async function generateMetadata({ params }: ForStarterPageProps): Promise<Metadata> {
  const { starter } = await params;
  const config = readStarterLanding(starter);

  if (!config) return {};

  return {
    alternates: {
      canonical: config.path,
    },
    description: config.description,
    openGraph: {
      description: config.description,
      images: [
        {
          alt: `${config.metaTitle} preview`,
          height: 630,
          url: `${config.path}/opengraph-image`,
          width: 1200,
        },
      ],
      title: `${config.metaTitle} · Roomboard`,
      type: "website",
      url: config.path,
    },
    title: config.metaTitle,
    twitter: {
      card: "summary_large_image",
      description: config.description,
      images: [`${config.path}/opengraph-image`],
      title: `${config.metaTitle} · Roomboard`,
    },
  };
}

export default async function ForStarterPage({ params }: ForStarterPageProps) {
  const { starter } = await params;
  const config = readStarterLanding(starter);

  if (!config) {
    notFound();
  }

  return <LandingPage entryIntent={config.starterId} initialStarter={config.starterId} />;
}
