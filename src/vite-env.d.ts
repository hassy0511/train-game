/// <reference types="vite/client" />

/** Names of the .glb files under public/models at build time (see vite.config.ts). */
declare const __MODEL_MANIFEST__: string[];

/**
 * v1.13 (みための くらべっこ): the other looks under public/looks at build time (look → model names) and the stages
 * using one of those models (see vite.config.ts).
 */
declare const __LOOK_MANIFEST__: { looks: Record<string, string[]>; stages: string[] };

/** Short commit id and build time (see vite.config.ts). */
declare const __BUILD_ID__: string;

/** Record ids with a picture-book picture under public/zukan at build time (see vite.config.ts). */
declare const __ZUKAN_PICTURES__: string[];
