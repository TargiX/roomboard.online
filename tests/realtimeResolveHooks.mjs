const phoenixMockUrl = new URL("./mocks/phoenixMock.ts", import.meta.url).href;

/**
 * Resolve hook for roomboard realtime session tests:
 * - redirect "phoenix" imports to the deterministic mock module;
 * - append ".ts" to extensionless relative imports (the app source relies on
 *   bundler-style resolution that native ESM does not perform).
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "phoenix") {
    return { url: phoenixMockUrl, shortCircuit: true };
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
