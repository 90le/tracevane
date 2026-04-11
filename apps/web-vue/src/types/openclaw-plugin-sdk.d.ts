declare module 'openclaw/plugin-sdk' {
  export interface OpenClawPluginApi {
    resolvePath(input: string): string;
    config?: {
      gateway?: {
        port?: number;
      };
      [key: string]: unknown;
    };
  }
}
