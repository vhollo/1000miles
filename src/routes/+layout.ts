// Single-page app: render everything on the client so the game works fully
// offline as a PWA. `prerender` emits a static shell for each route.
export const ssr = false;
export const prerender = true;
