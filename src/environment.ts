/** Build-time identity; production retains every legacy storage key. */
declare const __HEIBON_ENV__: 'production' | 'development';
export type AppEnvironment = 'production' | 'development';
export const APP_ENVIRONMENT: AppEnvironment = typeof __HEIBON_ENV__ === 'undefined' ? 'production' : __HEIBON_ENV__;
export function environmentStorageKey(key: string, environment: AppEnvironment = APP_ENVIRONMENT): string {
  return environment === 'development' ? `heibon-mahjong-dev:${key}` : key;
}
