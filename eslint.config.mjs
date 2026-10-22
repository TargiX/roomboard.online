import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "realtime/**"],
  },
  {
    // Scope must match the eslint-config-next object that registers the
    // react-hooks plugin ("**/*.{js,jsx,mjs,ts,tsx,mts,cts}" — no .cjs).
    // Unscoped rules would crash `eslint .` on any file type the plugin
    // object does not cover (e.g. stray root *.cjs scripts):
    // "A configuration object specifies rule "react-hooks/refs", but could
    // not find plugin "react-hooks"."
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // React-compiler-era rules flag intentional patterns throughout the
      // canvas (refs read in effects, mount-time localStorage hydration).
      // Kept visible as warnings rather than failing CI on day one.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

export default config;
