/// <reference types="vite/client" />

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*?url" {
  const src: string;
  export default src;
}

/** Injected by vite.config.ts from package.json "version". */
declare const __APP_VERSION__: string;
