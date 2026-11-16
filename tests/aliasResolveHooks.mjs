import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Resolve hook for tests of app modules that use the Next.js "@/*" path alias
 * (native ESM cannot resolve it): rewrite "@/<path>" to the repo-root file,
 * appending ".ts" when the specifier carries no explicit extension.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const hasExtension = /\.[cm]?[jt]sx?$/.test(relative);
    const target = hasExtension ? relative : `${relative}.ts`;
    return { url: pathToFileURL(path.join(repoRoot, target)).href, shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith("./") && !/\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
