/// <reference types="vite/client" />

declare module "*.mp3" {
  const url: string;
  export default url;
}
