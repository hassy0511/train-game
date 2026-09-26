/// <reference types="vite/client" />

/** Names of the .glb files under public/models at build time (see vite.config.ts). */
declare const __MODEL_MANIFEST__: string[];

/** Short commit id and build time (see vite.config.ts). */
declare const __BUILD_ID__: string;

/** Record ids with a picture-book picture under public/zukan at build time (see vite.config.ts). */
declare const __ZUKAN_PICTURES__: string[];
