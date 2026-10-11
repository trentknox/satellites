import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  COLLECTION_ENABLED, OPT_OUT_KEY, PUBLIC_ORIGIN, beforePublicPageview,
  canCollectPublicPage, publicPageUrl,
} from '../src/public-analytics.mjs';

function browserFixture(path = '/') {
  const values = new Map();
  const scripts = [];
  const calls = { storageReads: [], writes: 0, network: 0, scriptCreates: 0 };
  const browser = {
    location: { href: `${PUBLIC_ORIGIN}${path}` },
    navigator: { globalPrivacyControl: false, doNotTrack: '0', sendBeacon() { calls.network++; throw Error('Network forbidden'); } },
    fetch() { calls.network++; throw Error('Network forbidden'); },
    localStorage: {
      getItem(key) { calls.storageReads.push(key); return values.get(key) ?? null; },
      setItem() { calls.writes++; throw Error('Storage writes forbidden'); },
      removeItem() { calls.writes++; throw Error('Storage writes forbidden'); },
      clear() { calls.writes++; throw Error('Storage writes forbidden'); },
    },
    sessionStorage: { getItem(key) { calls.storageReads.push(key); return null; } },
  };
  browser.document = {
    referrer: '', querySelectorAll() { return scripts; },
    createElement(tag) {
      assert.equal(tag, 'script'); calls.scriptCreates++;
      const script = { dataset: {} };
      let src;
      Object.defineProperty(script, 'src', {
        set(value) { src = new URL(value, browser.location.href).href; },
        get() { return src; },
      });
      return script;
    },
    head: {
      querySelector() { return scripts[0] ?? null; },
      appendChild(script) { scripts.push(script); },
    },
  };
  return { browser, values, scripts, calls };
}

async function loadActualSdkEntry(browser) {
  const context = vm.createContext({ window: browser, document: browser.document, URL, console });
  const sdk = new vm.SourceTextModule(await readFile(new URL('../node_modules/@vercel/analytics/dist/index.mjs', import.meta.url), 'utf8'), { context });
  const policy = new vm.SourceTextModule(await readFile(new URL('../src/public-analytics.mjs', import.meta.url), 'utf8'), { context });
  const entry = new vm.SourceTextModule(await readFile(new URL('../src/analytics-entry.mjs', import.meta.url), 'utf8'), { context });
  await entry.link(specifier => {
    if (specifier === '@vercel/analytics') return sdk;
    if (specifier === './public-analytics.mjs') return policy;
    throw Error(`Unexpected dependency: ${specifier}`);
  });
  await entry.evaluate();
  return entry.namespace;
}

test('OFF default neither touches a browser nor mounts the actual SDK module', async () => {
  assert.equal(COLLECTION_ENABLED, false);
  const forbidden = new Proxy({}, { get() { throw Error('OFF must not inspect browser'); } });
  assert.equal(canCollectPublicPage(false, forbidden), false);
  const f = browserFixture();
  const entry = await loadActualSdkEntry(f.browser);
  assert.equal(entry.startPublicAnalytics(f.browser), false);
  assert.equal(f.calls.scriptCreates, 0);
  assert.equal(f.calls.network, 0);
  assert.equal(f.calls.writes, 0);
  assert.deepEqual(f.calls.storageReads, []);
  assert.equal('va' in f.browser, false);
  assert.equal('vam' in f.browser, false);
});

test('only explicit boolean true can enter a future collection gate', () => {
  for (const enabled of [undefined, null, false, 0, 1, 'true']) assert.equal(canCollectPublicPage(enabled, browserFixture().browser), false);
});

for (const path of ['/', '/hov', '/ccm']) test(`bound public route ${path} is canonical`, () => {
  const f = browserFixture(path);
  assert.equal(canCollectPublicPage(true, f.browser), true);
  assert.equal(publicPageUrl(f.browser.location.href), `${PUBLIC_ORIGIN}${path}`);
});

test('unbound hosts, preview domains and private or dirty routes are rejected', () => {
  const urls = [
    'http://satellites-silk.vercel.app/', 'https://satellites-silk.vercel.app:444/',
    'https://user:secret@satellites-silk.vercel.app/', 'https://localhost/',
    'https://satellites-git-main-cybercitymedia.vercel.app/', 'https://cybercitymedia.com/',
    `${PUBLIC_ORIGIN}/login`, `${PUBLIC_ORIGIN}/portal`, `${PUBLIC_ORIGIN}/api/customer`,
    `${PUBLIC_ORIGIN}/hov/`, `${PUBLIC_ORIGIN}/HOV`, `${PUBLIC_ORIGIN}/%68ov`,
    `${PUBLIC_ORIGIN}/?token=synthetic`, `${PUBLIC_ORIGIN}/hov#synthetic`,
    `${PUBLIC_ORIGIN}/ccm/index.html`, 'not a URL',
  ];
  for (const url of urls) {
    const f = browserFixture(); f.browser.location.href = url;
    assert.equal(publicPageUrl(url), null, url);
    assert.equal(canCollectPublicPage(true, f.browser), false, url);
  }
});

test('GPC and all supported DNT signals suppress collection', () => {
  for (const mutate of [
    f => { f.browser.navigator.globalPrivacyControl = true; },
    f => { f.browser.navigator.doNotTrack = '1'; },
    f => { f.browser.navigator.doNotTrack = 'YES'; },
    f => { f.browser.navigator.msDoNotTrack = '1'; },
    f => { f.browser.navigator.msDoNotTrack = 'YES'; },
    f => { f.browser.doNotTrack = '1'; },
  ]) {
    const f = browserFixture(); mutate(f);
    assert.equal(canCollectPublicPage(true, f.browser), false);
  }
});

test('unavailable storage, explicit opt-out and malformed preferences fail closed', () => {
  for (const mutate of [
    f => { f.values.set(OPT_OUT_KEY, '1'); },
    f => { f.values.set(OPT_OUT_KEY, 'unexpected'); },
    f => { f.browser.localStorage.getItem = () => { throw Error('Denied'); }; },
    f => { f.browser.sessionStorage.getItem = () => { throw Error('Denied'); }; },
  ]) {
    const f = browserFixture(); mutate(f);
    assert.equal(canCollectPublicPage(true, f.browser), false);
    assert.equal(f.calls.writes, 0);
  }
});

test('every nonnull saved attribution value suppresses collection and remains untouched', () => {
  for (const value of ['', '0', '{}', '{malformed', '{"account":"synthetic"}']) {
    const f = browserFixture(); f.values.set('__va_attribution', value);
    assert.equal(canCollectPublicPage(true, f.browser), false);
    assert.equal(f.values.get('__va_attribution'), value);
    assert.equal(f.calls.writes, 0);
  }
});

test('only empty or clean bound public referrers can pass the future gate', () => {
  for (const referrer of ['', `${PUBLIC_ORIGIN}/`, `${PUBLIC_ORIGIN}/hov`, `${PUBLIC_ORIGIN}/ccm`]) {
    const f = browserFixture(); f.browser.document.referrer = referrer;
    assert.equal(canCollectPublicPage(true, f.browser), true);
  }
  for (const referrer of ['https://example.test/', `${PUBLIC_ORIGIN}/account`, `${PUBLIC_ORIGIN}/?token=synthetic`, `${PUBLIC_ORIGIN}/hov#synthetic`, 'malformed']) {
    const f = browserFixture(); f.browser.document.referrer = referrer;
    assert.equal(canCollectPublicPage(true, f.browser), false);
  }
});

test('existing analytics globals or scripts are preserved and never adopted', () => {
  for (const key of ['va', 'vaq', 'vai', 'vam', 'webAnalyticsBeforeSend']) {
    const f = browserFixture(); f.browser[key] = undefined;
    assert.equal(canCollectPublicPage(true, f.browser), false);
    assert.equal(key in f.browser, true);
  }
  const f = browserFixture(); const old = { src: 'https://example.test/collector.js' }; f.scripts.push(old);
  assert.equal(canCollectPublicPage(true, f.browser), false);
  assert.equal(f.scripts[0], old);
});

test('actual SDK synthetic mount disables automatic tracking and queues only a canonical pageview', async () => {
  const f = browserFixture('/hov');
  const entry = await loadActualSdkEntry(f.browser);
  assert.equal(entry.startPublicAnalytics(f.browser, true), true);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, `${PUBLIC_ORIGIN}/_vercel/insights/script.js`);
  assert.equal(f.scripts[0].dataset.sdkv, '2.0.1');
  assert.equal(f.scripts[0].dataset.disableAutoTrack, '1');
  const queued = f.browser.vaq.filter(([type]) => type === 'pageview');
  assert.equal(queued.length, 1);
  assert.equal(queued[0][1].route, '/hov');
  assert.equal(queued[0][1].path, `${PUBLIC_ORIGIN}/hov`);
  const callback = f.browser.vaq.find(([type]) => type === 'beforeSend')[1];
  const original = { type: 'pageview', url: `${PUBLIC_ORIGIN}/hov`, account: 'synthetic', referrer: 'synthetic' };
  assert.deepEqual(Object.keys(callback(original)).sort(), ['type', 'url']);
  assert.equal(original.account, 'synthetic');
  assert.equal(callback({ type: 'event', name: 'synthetic' }), null);
  for (const url of [`${PUBLIC_ORIGIN}/hov?token=synthetic`, `${PUBLIC_ORIGIN}/ccm`, 'https://example.test/']) assert.equal(callback({ type: 'pageview', url }), null);
  assert.equal(f.calls.network, 0);
  assert.equal(f.calls.writes, 0);
});

test('the actual SDK callback rechecks privacy, storage, referrer and route after mounting', async () => {
  for (const mutate of [
    f => { f.browser.navigator.globalPrivacyControl = true; },
    f => { f.values.set(OPT_OUT_KEY, '1'); },
    f => { f.values.set('__va_attribution', ''); },
    f => { f.browser.localStorage.getItem = () => { throw Error('Denied'); }; },
    f => { f.browser.location.href = `${PUBLIC_ORIGIN}/login`; },
    f => { f.browser.document.referrer = 'https://example.test/private'; },
    f => { f.browser.webAnalyticsBeforeSend = () => {}; },
  ]) {
    const f = browserFixture(); const entry = await loadActualSdkEntry(f.browser);
    assert.equal(entry.startPublicAnalytics(f.browser, true), true);
    const callback = f.browser.vaq.find(([type]) => type === 'beforeSend')[1];
    mutate(f);
    assert.equal(callback({ type: 'pageview', url: `${PUBLIC_ORIGIN}/` }), null);
    assert.equal(f.calls.network, 0);
  }
});

test('a different browser object cannot mount the SDK into the actual private-page window', async () => {
  const actual = browserFixture('/login');
  const other = browserFixture('/');
  const entry = await loadActualSdkEntry(actual.browser);
  assert.equal(entry.startPublicAnalytics(other.browser, true), false);
  assert.equal(actual.calls.scriptCreates, 0);
  assert.equal('va' in actual.browser, false);
});

test('malformed SDK events fail closed when the future gate otherwise passes', () => {
  const f = browserFixture();
  const badType = Object.defineProperty({}, 'type', { get() { throw Error('Malformed type'); } });
  const badUrl = Object.defineProperty({ type: 'pageview' }, 'url', { get() { throw Error('Malformed URL'); } });
  for (const event of [badType, badUrl]) assert.equal(beforePublicPageview(event, true, f.browser), null);
});

test('malformed events and custom events are rejected while collection remains OFF', () => {
  for (const event of [null, undefined, {}, { type: 'event' }, { type: 'pageview', url: '' }]) assert.equal(beforePublicPageview(event, false, browserFixture().browser), null);
});

test('non-string URL values are rejected without coercion', () => {
  const f = browserFixture();
  let coercions = 0;
  const coercible = { toString() { coercions++; return `${PUBLIC_ORIGIN}/`; } };
  for (const url of [new URL(`${PUBLIC_ORIGIN}/`), [`${PUBLIC_ORIGIN}/`], coercible, new String(`${PUBLIC_ORIGIN}/`)]) {
    assert.equal(beforePublicPageview({ type: 'pageview', url }, true, f.browser), null);
    assert.equal(publicPageUrl(url), null);
  }
  assert.equal(coercions, 0);
});

test('event accessors and inherited values are rejected without executing getters', () => {
  const f = browserFixture();
  let reads = 0;
  const accessor = Object.defineProperty({ type: 'pageview' }, 'url', {
    get() { reads++; f.browser.navigator.globalPrivacyControl = true; return `${PUBLIC_ORIGIN}/`; },
  });
  const typeAccessor = Object.defineProperty({ url: `${PUBLIC_ORIGIN}/` }, 'type', {
    get() { reads++; return 'pageview'; },
  });
  for (const event of [accessor, typeAccessor, Object.create({ type: 'pageview', url: `${PUBLIC_ORIGIN}/` })]) {
    assert.equal(beforePublicPageview(event, true, f.browser), null);
  }
  assert.equal(reads, 0);
});

test('privacy is checked after extracting event descriptors', () => {
  const f = browserFixture();
  const event = new Proxy({ type: 'pageview', url: `${PUBLIC_ORIGIN}/` }, {
    getOwnPropertyDescriptor(target, key) {
      f.browser.navigator.globalPrivacyControl = true;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.equal(beforePublicPageview(event, true, f.browser), null);
  assert.equal(f.calls.network, 0);
  assert.equal(f.calls.writes, 0);
});
