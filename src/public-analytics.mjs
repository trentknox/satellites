// Source preparation only. Enabling collection requires a separate review.
export const COLLECTION_ENABLED = false;
export const PUBLIC_ORIGIN = 'https://satellites-silk.vercel.app';
export const OPT_OUT_KEY = 'satellites_public_analytics_opt_out_v1';
export const SCRIPT_SRC = '/_vercel/insights/script.js';

const publicPaths = new Set(['/', '/hov', '/ccm']);
const attributionGlobals = ['va', 'vaq', 'vai', 'vam', 'webAnalyticsBeforeSend'];
const analyticsScripts = 'script[src*="/_vercel/insights/"], script[src*="vercel-scripts.com"], script[data-sdkn="@vercel/analytics"]';

export function publicPageUrl(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.origin !== PUBLIC_ORIGIN || url.protocol !== 'https:' || url.username || url.password) return null;
    if (!publicPaths.has(url.pathname) || url.search || url.hash) return null;
    return `${PUBLIC_ORIGIN}${url.pathname}`;
  } catch {
    return null;
  }
}

function privacyRequested(browser) {
  const nav = browser.navigator;
  return nav.globalPrivacyControl === true
    || [nav.doNotTrack, nav.msDoNotTrack, browser.doNotTrack].some(value => ['1', 'yes'].includes(String(value || '').toLowerCase()));
}

function readOptOut(browser) {
  // The collector can merge this after beforeSend. Preserve every existing
  // value, including an empty or malformed value, and suppress collection.
  if (browser.localStorage.getItem('__va_attribution') !== null) return null;
  // Probe only the dedicated preference key; do not enumerate session data.
  browser.sessionStorage.getItem(OPT_OUT_KEY);
  const value = browser.localStorage.getItem(OPT_OUT_KEY);
  if (value === null || value === '0') return false;
  if (value === '1') return true;
  return null;
}

export function canCollectPublicPage(enabled, browser, ownership = null) {
  if (enabled !== true || !browser) return false;
  try {
    if (privacyRequested(browser) || readOptOut(browser) !== false) return false;
    if (!publicPageUrl(browser.location.href)) return false;
    const referrer = browser.document.referrer;
    if (referrer && !publicPageUrl(referrer)) return false;
    const scripts = Array.from(browser.document.querySelectorAll(analyticsScripts));
    if (!ownership) return scripts.length === 0 && attributionGlobals.every(key => !(key in browser));
    return scripts.length === 1 && scripts[0] === ownership.script
      && ownership.script.src === `${PUBLIC_ORIGIN}${SCRIPT_SRC}`
      && typeof browser.va === 'function' && browser.vam === 'production'
      && !('webAnalyticsBeforeSend' in browser);
  } catch {
    return false;
  }
}

export function captureAnalyticsOwnership(browser) {
  try {
    const scripts = Array.from(browser.document.querySelectorAll(analyticsScripts));
    if (scripts.length !== 1 || scripts[0].src !== `${PUBLIC_ORIGIN}${SCRIPT_SRC}`) return null;
    return { script: scripts[0] };
  } catch {
    return null;
  }
}

export function beforePublicPageview(event, enabled, browser, ownership = null) {
  if (enabled !== true) return null;
  try {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    const typeField = Object.getOwnPropertyDescriptor(event, 'type');
    const urlField = Object.getOwnPropertyDescriptor(event, 'url');
    if (!typeField || !('value' in typeField) || typeField.value !== 'pageview'
      || !urlField || !('value' in urlField) || typeof urlField.value !== 'string') return null;
    const url = publicPageUrl(urlField.value);
    if (!url || !canCollectPublicPage(enabled, browser, ownership)) return null;
    if (!url || url !== publicPageUrl(browser.location.href)) return null;
    if (!canCollectPublicPage(enabled, browser, ownership)) return null;
    // Return a fresh allowlist object. Do not forward arbitrary event fields.
    return { type: 'pageview', url };
  } catch {
    return null;
  }
}
