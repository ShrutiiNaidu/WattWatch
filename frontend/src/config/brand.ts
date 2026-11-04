/**
 * WattWatch brand configuration.
 * All user-visible product name, tagline and financial defaults live here.
 * Change APP_NAME here and it propagates to the entire app.
 */

export const BRAND = {
  /** Product name shown in the UI, <title>, reports, etc. */
  APP_NAME: 'WattWatch',
  /** Short tagline shown in footers and meta descriptions. */
  APP_TAGLINE: 'Simple electricity insights · Built for everyday users',
  /** Text displayed inside the logo mark. */
  LOGO_TEXT: 'WattWatch',
  /** ISO 4217 currency symbol shown next to cost estimates. */
  CURRENCY_SYMBOL: '₹',
  /** Default electricity tariff in currency units per kWh. */
  DEFAULT_TARIFF_PER_KWH: 8,
  /** LocalStorage key for persisted tariff preference. */
  TARIFF_STORAGE_KEY: 'wattwatch_tariff',
  /** LocalStorage key prefix for anomaly tags: `{key}:{analysisId}:{recordId}` */
  TAG_STORAGE_PREFIX: 'wattwatch_tag',
} as const;

export type BrandConfig = typeof BRAND;
