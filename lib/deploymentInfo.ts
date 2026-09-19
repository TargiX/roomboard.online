export type DeploymentInfo = {
  env: string | null;
  gitCommitRef: string | null;
  gitCommitSha: string | null;
  url: string | null;
};

type DeploymentEnv = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  VERCEL_URL?: string;
};

function normalizeVercelUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
}

export function buildDeploymentInfo(env: DeploymentEnv = process.env): DeploymentInfo {
  return {
    env: env.VERCEL_ENV ?? env.NODE_ENV ?? null,
    gitCommitRef: env.VERCEL_GIT_COMMIT_REF ?? null,
    gitCommitSha: env.VERCEL_GIT_COMMIT_SHA ?? null,
    url: normalizeVercelUrl(env.VERCEL_URL),
  };
}
