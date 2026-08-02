/// <reference types="vite/client" />

declare module "*.css?url" {
  const url: string;
  export default url;
}

declare module "*.css?raw" {
  const css: string;
  export default css;
}
