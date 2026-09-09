import { defaultCache } from "@serwist/next/worker";
import { Serwist, NetworkOnly } from "serwist";

const serwist = new Serwist({
  // @ts-expect-error - __SW_MANIFEST is injected by Serwist at build time
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
