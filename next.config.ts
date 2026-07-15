import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const config: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default withSerwist({
  swSrc: "sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
})(config);
