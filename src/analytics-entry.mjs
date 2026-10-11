import { inject, pageview } from '@vercel/analytics';
import {
  COLLECTION_ENABLED, beforePublicPageview, canCollectPublicPage,
  captureAnalyticsOwnership, publicPageUrl,
} from './public-analytics.mjs';

export function startPublicAnalytics(browser, enabled = COLLECTION_ENABLED) {
  if (!canCollectPublicPage(enabled, browser)) return false;
  if (typeof window === 'undefined' || typeof document === 'undefined' || browser !== window || browser.document !== document) return false;
  let ownership = null;
  inject({
    mode: 'production', debug: false, disableAutoTrack: true,
    beforeSend: event => beforePublicPageview(event, enabled, browser, ownership),
  });
  ownership = captureAnalyticsOwnership(browser);
  if (!canCollectPublicPage(enabled, browser, ownership)) return false;
  const path = publicPageUrl(browser.location.href);
  pageview({ route: new URL(path).pathname, path });
  return true;
}

// Do not even inspect the browser while the compile-time gate is OFF.
if (COLLECTION_ENABLED && typeof window !== 'undefined') startPublicAnalytics(window);
