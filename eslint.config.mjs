import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "realtime/**"],
  },
  {
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
