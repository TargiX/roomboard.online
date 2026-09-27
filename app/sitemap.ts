import type { MetadataRoute } from "next";

const baseUrl = "https://www.roomboard.online";
const adReadyRoutes = ["/for/landing-review", "/for/moodboard", "/for/blank-room", "/for/agent-review"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: "weekly",
      lastModified: new Date(),
      priority: 1,
      url: baseUrl,
    },
    ...adReadyRoutes.map((route) => ({
      changeFrequency: "weekly" as const,
      lastModified: new Date(),
      priority: 0.8,
      url: `${baseUrl}${route}`,
    })),
    {
      changeFrequency: "monthly",
      lastModified: new Date(),
      priority: 0.4,
      url: `${baseUrl}/privacy`,
    },
  ];
}
