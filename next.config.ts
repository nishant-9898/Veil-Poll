import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@midnight-ntwrk/dapp-connector-api",
    "@midnight-ntwrk/midnight-js-protocol",
  ],
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };
    config.output.environment = {
      ...config.output.environment,
      asyncFunction: true,
    };
    config.resolve.alias["isomorphic-ws"] = path.resolve(
      process.cwd(),
      "lib/midnight/isomorphic-ws-shim.ts",
    );
    // Generated contract source lives under contract/, which has its own
    // node_modules for CLI deployment. WASM-backed Midnight classes require
    // strict instance identity, so browser bundles must always use root copies.
    const singletonEntries = {
      "@midnight-ntwrk/compact-js$":
        "node_modules/@midnight-ntwrk/compact-js/dist/esm/index.js",
      "@midnight-ntwrk/compact-runtime$":
        "node_modules/@midnight-ntwrk/compact-runtime/dist/index.js",
      "@midnight-ntwrk/onchain-runtime-v3$":
        "node_modules/@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js",
      "@midnight-ntwrk/ledger-v8$":
        "node_modules/@midnight-ntwrk/ledger-v8/midnight_ledger_wasm.js",
    };
    for (const [request, entry] of Object.entries(singletonEntries)) {
      config.resolve.alias[request] = path.resolve(process.cwd(), entry);
    }
    return config;
  },
};

export default nextConfig;
