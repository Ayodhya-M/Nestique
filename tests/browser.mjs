// Dependency-free browser integration checks using Chrome's DevTools protocol.
// Uses an isolated temporary browser profile; never touches the user's browser data.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { products } from '../src/data/catalogue.js';
import { createDemoOrder } from '../src/utils/orders.js';
import { recommendProducts, palettes } from '../src/utils/recommendations.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const portReservation = createServer();
await new Promise(resolve => portReservation.listen(0, '127.0.0.1', resolve));
const serverPort = portReservation.address().port;
await new Promise(resolve => portReservation.close(resolve));
const origin = 'http://127.0.0.1:' + serverPort;
const browserProfile = await mkdtemp(path.join(tmpdir(), 'nestique-browser-test-'));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(serverPort), '--strictPort'], { windowsHide: true, stdio: 'pipe' });
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + browserProfile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
let completed = 0;
const runtimeErrors = [];
const warnings = [];
async function until(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch {}
    await wait(80);
  }
  throw Error('Timed out: ' + message);
}

try {
  await until(async () => (await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok, 'Vite server');
  const port = await until(async () => (await readFile(path.join(browserProfile, 'DevToolsActivePort'), 'utf8')).split('\n')[0], 'Chrome debugging port');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { const timer=setTimeout(()=>reject(Error('Chrome connection timed out')),15000);socket.onopen=()=>{clearTimeout(timer);resolve()};socket.onerror=event=>{clearTimeout(timer);reject(event)}; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    // Deterministic image responses test rendering without depending on Unsplash availability.
    if (message.method === 'Fetch.requestPaused') {
      command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII=' }).catch(error => runtimeErrors.push(error.message));
    }
    if (message.id) {
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      clearTimeout(call.timer);
      if (message.error) call.reject(Error(message.error.message)); else call.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) warnings.push(message.params.args.map(a => a.value || a.description).join(' '));
  };
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('DevTools timeout: '+method)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const text = () => evaluate('document.body.innerText');
  const expectText = value => until(async () => (await text()).includes(value), value);
  const route = async (hash, heading) => { await evaluate('location.hash=' + JSON.stringify(hash)); await expectText(heading); await wait(100); };
  const click = async label => {
    await evaluate(`(()=>{const el=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()===${JSON.stringify(label)});if(!el)throw Error('Control missing: '+${JSON.stringify(label)});el.click();})()`);
    await wait(120);
  };
  const chooseCard = async (name, action) => {
    await evaluate(`(()=>{const card=[...document.querySelectorAll('article')].find(el=>el.querySelector('h3')?.textContent===${JSON.stringify(name)});const button=[...(card?.querySelectorAll('button')||[])].find(el=>el.textContent.trim()===${JSON.stringify(action)});if(!button)throw Error('Missing card action');button.click();})()`);
    await wait(120);
  };
  const check = async (name, fn) => { await fn(); completed++; console.log('PASS ' + name); };
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Fetch.enable', { patterns: [{ urlPattern: 'https://images.unsplash.com/*', resourceType: 'Image' }] });
  await command('Page.navigate', { url: origin + '/#/my-nest' });
  await expectText('MY HOME PROFILE');

  await check('empty profile has no invented rooms or preferences', async () => {
    assert.ok((await text()).includes('Not set yet'));
    assert.ok(!(await text()).includes('Beige sofa'));
    assert.ok((await text()).includes('Let’s discover your home style.'));
    assert.ok((await text()).includes('Your first room is waiting.'));
    assert.equal(await evaluate("document.querySelectorAll('.nest-room-card').length"), 0);
    assert.equal(await evaluate("document.querySelectorAll('.nest-swatches').length"), 0);
    assert.equal(await evaluate("document.querySelector('.nest-mood-empty a').getAttribute('href')"), '#/style-quiz');
    assert.equal(await evaluate("document.querySelector('.nest-empty-room a').getAttribute('href')"), '#/design-room');
  });
  await check('quiz saves every answer and displays the home profile', async () => {
    await route('/style-quiz', 'What kind of atmosphere');
    for (const answer of ['Natural & Earthy', 'Earth & Clay', 'Living Room', 'LKR 10,000–25,000', 'Wooden coffee table']) await click(answer);
    await expectText('MY HOME PROFILE');
    const profile = await evaluate("JSON.parse(localStorage.getItem('nest-profile'))");
    assert.equal(profile.colour, 'Earth & Clay');
    assert.equal(profile.budget, 'LKR 10,000–25,000');
    assert.equal(profile.quizCompleted, true);
    assert.ok((await text()).includes('Wooden coffee table'));
  });
  await check('My Nest uses the requested visual story and saved style mood on desktop', async () => {
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.my-nest>section')].map(el=>el.id||el.className)"), ['nest-hero', 'home-profile', 'home-recommendations', 'my-rooms', 'purchase-history', 'nestique-refresh', 'nest-memory-strip']);
    assert.equal(await evaluate("document.querySelector('.nest-mood-copy h3').textContent"), 'Natural Living');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.nest-swatches>span')].map(el=>el.getAttribute('aria-label'))"), palettes['Earth & Clay']);
    assert.ok((await text()).includes('Welcome back to your Natural Living home.'));
    assert.ok(await evaluate("document.querySelector('.nest-hero-image').getBoundingClientRect().left>=document.querySelector('.nest-hero-copy').getBoundingClientRect().right-1"));
    assert.ok(await evaluate("document.querySelector('.nest-refresh-copy').getBoundingClientRect().left>=document.querySelector('.nest-refresh-image').getBoundingClientRect().right-1"));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
  });
  await check('My Nest recommendation wishlist, cart and detail actions remain functional', async () => {
    const href = await evaluate("document.querySelector('#home-recommendations .product-img').getAttribute('href')");
    await evaluate("document.querySelector('#home-recommendations .heart').click()");
    await until(() => evaluate("JSON.parse(localStorage.getItem('nest-wish')).length===1"), 'recommendation saved');
    await evaluate("document.querySelector('#home-recommendations .heart').click()");
    await until(() => evaluate("JSON.parse(localStorage.getItem('nest-wish')).length===0"), 'recommendation unsaved');
    await evaluate("document.querySelector('#home-recommendations .add-mini').click()");
    await route('/cart', 'Demo order summary');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-cart')).length"), 1);
    await click('Remove');
    await expectText('Your cart is ready when you are.');
    await route('/my-nest', 'MY HOME PROFILE');
    await evaluate("document.querySelector('#home-recommendations .product-img').click()");
    await expectText('Back to shop');
    assert.equal(await evaluate('location.hash'), href);
    await route('/my-nest', 'MY HOME PROFILE');
  });
  await check('builder initializes from profile and saves independent room plans', async () => {
    await route('/design-room', 'Which room are you designing?');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.preference-row select')].map(el=>el.value)"), ['Natural Living', 'Earthy']);
    await chooseCard('Linen Cushion Cover', 'Add to room');
    await click('Bedroom');
    assert.ok((await evaluate("document.querySelector('.room-plan').innerText")).includes('Your plan is empty'));
    await click('Let me browseExplore everything yourself, with useful filters when you want them.');
    await chooseCard('Minimal Table Lamp', 'Add to room');
    await click('Living Room');
    const plan = await evaluate("document.querySelector('.room-plan').innerText");
    assert.ok(plan.includes('Linen Cushion Cover'));
    assert.ok(!plan.includes('Minimal Table Lamp'));
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-profile')).room"), 'Living Room');
  });
  await check('cart receives room context; modal Escape cancels', async () => {
    await click('Add plan to cart');
    await route('/cart', 'Demo order summary');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-cart'))[0].room"), 'Living Room');
    await click('Demo checkout');
    assert.equal(await evaluate("document.activeElement.textContent"), 'Save demo purchase');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await until(() => evaluate("!document.querySelector('[role=dialog]')"), 'closed modal');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-cart')).length"), 1);
  });
  await check('demo checkout persists order before clearing cart and excludes purchase from refresh', async () => {
    await click('Demo checkout');
    await click('Save demo purchase');
    await expectText('Demo Purchase History');
    const order = await evaluate("JSON.parse(localStorage.getItem('nest-orders'))[0]");
    assert.equal(order.total, 3090);
    assert.equal(order.room, 'Living Room');
    assert.equal(order.items[0].id, 'linen-cushion');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-cart')).length"), 0);
    assert.ok(!(await evaluate("[...document.querySelectorAll('.products h3')].map(el=>el.textContent)")).includes('Linen Cushion Cover'));
    await command('Page.reload');
    await expectText('Demo Order #');
    await until(() => evaluate("!!document.querySelector('.history-order li')"), 'history items after reload');
    const historyLine = await evaluate("document.querySelector('.history-order li').textContent");
    assert.ok(historyLine.includes('Linen Cushion Cover') && historyLine.includes('Qty: 1'), historyLine);
    await until(() => evaluate("document.querySelector('.history-image img')?.naturalWidth>0"), 'single-product image loaded');
    assert.equal(await evaluate("document.querySelector('.history-image img').getAttribute('src')"), order.items[0].image);
  });
  await check('home room cards open the corresponding room', async () => {
    await route('/', 'Made for your space');
    await evaluate("document.querySelectorAll('.room-grid a')[1].click()");
    await expectText('Which room are you designing?');
    await until(() => evaluate("document.querySelector('.room-plan h2').textContent==='Bedroom'"), 'Bedroom plan');
    assert.ok((await evaluate("document.querySelector('.room-plan').innerText")).includes('Minimal Table Lamp'));
  });
  await check('My Rooms displays only saved plans and View Room restores the selected room', async () => {
    await route('/my-nest', 'My Rooms');
    assert.equal(await evaluate("document.querySelectorAll('.nest-room-card').length"), 2);
    const roomText = await evaluate("document.querySelector('.nest-room-card[data-room=\"Living Room\"]').innerText");
    assert.ok(roomText.includes('1 saved piece') && roomText.includes('LKR 2,490'));
    await evaluate("document.querySelector('[aria-label=\"View Room: Bedroom\"]').click()");
    await expectText('Which room are you designing?');
    await until(() => evaluate("document.querySelector('.room-plan h2').textContent==='Bedroom'"), 'saved Bedroom selection');
    assert.ok((await evaluate("document.querySelector('.room-plan').innerText")).includes('Minimal Table Lamp'));
  });
  await check('product quantity resets; wishlist and accessible images remain functional', async () => {
    await route('/product/ribbed-vase', 'Ceramic Ribbed Vase');
    await evaluate("document.querySelector('[aria-label=\"Increase quantity\"]').click()");
    await route('/product/table-lamp', 'Minimal Table Lamp');
    assert.equal(await evaluate("document.querySelector('.quantity b').textContent"), '1');
    await evaluate("document.querySelector('.icon-btn').click()");
    await route('/wishlist', 'Your wishlist');
    assert.ok((await text()).includes('Minimal Table Lamp'));
    assert.equal(await evaluate("document.querySelectorAll('img:not([alt])').length"), 0);
  });
  await check('collection counts and filtered shop links reflect real products', async () => {
    await route('/collections/natural-living', 'THE NATURAL LIVING EDIT');
    assert.ok((await text()).includes('3 curated pieces'));
    await click('Shop this collection');
    await expectText('3 pieces to love');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Product style\"]').value"), 'Natural Living');
  });
  await check('empty search results can be reset', async () => {
    await evaluate(`(()=>{const input=document.querySelector('[aria-label="Search décor"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'zzzz-unmatched');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await expectText('No pieces found.');
    await click('Reset filters');
    await expectText('14 pieces to love');
  });
  await check('missing routes and identifiers show not-found states', async () => {
    await route('/product/missing', 'Product not found');
    await route('/collections/missing', 'Collection not found');
    await route('/missing', 'Page not found');
  });
  await check('seasonal Wedding edit is unavailable; subscriptions are demo selections', async () => {
    await route('/seasonal', 'Wedding Edit');
    assert.equal(await evaluate("[...document.querySelectorAll('.seasonal-launches article')].find(el=>el.textContent.includes('Wedding Edit')).querySelector('button')"), null);
    await route('/subscriptions', 'Prototype plan selection only');
    await click('Select demo plan');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-subscription'))"), 'seasonal');
  });
  await check('failed local order save leaves cart and history intact', async () => {
    await route('/product/ribbed-vase', 'Ceramic Ribbed Vase');
    await click('Add to Cart');
    await route('/cart', 'Demo order summary');
    await evaluate("window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='nest-orders')throw Error('Test quota exceeded');return window.originalSetItem.call(this,key,value)}");
    await click('Demo checkout');
    await click('Save demo purchase');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-cart')).length"), 1);
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-orders')).length"), 1);
    await evaluate('Storage.prototype.setItem=window.originalSetItem');
    await click('Cancel');
  });
  await check('history cards show every product, snapshot images, legacy fallbacks and newest orders first', async () => {
    const cushion = products.find(p => p.id === 'linen-cushion');
    const lamp = products.find(p => p.id === 'table-lamp');
    const vase = products.find(p => p.id === 'ribbed-vase');
    const legacy = createDemoOrder([{ ...cushion, qty: 2, room: 'Living Room' }], { id: 'legacy-image', createdAt: '2026-01-01T12:00:00Z' });
    delete legacy.items[0].image;
    const newest = createDemoOrder([{ ...lamp, image: lamp.image.replace('w=900', 'w=700'), qty: 1, room: 'Bedroom' }, { ...cushion, qty: 1, room: 'Bedroom' }], { id: 'newest-images', createdAt: '2026-03-01T12:00:00Z' });
    const middle = createDemoOrder([{ ...vase, image: 'javascript:invalid', qty: 1 }, { ...vase, id: 'archived-piece', name: 'Archived décor piece', image: null, qty: 1 }], { id: 'missing-images', createdAt: '2026-02-01T12:00:00Z' });
    middle.items[1].image = { invalid: true };
    await evaluate(`localStorage.setItem('nest-orders',${JSON.stringify(JSON.stringify([legacy, newest, middle]))});location.hash='/my-nest'`);
    await command('Page.reload');
    await expectText('demo-newest-images');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.history-order')].map(el=>el.dataset.orderId)"), ['demo-newest-images', 'demo-missing-images', 'demo-legacy-image']);
    assert.equal(await evaluate("document.querySelectorAll('.history-product').length"), 5);
    await until(() => evaluate("[...document.querySelectorAll('.history-image img')].length===4 && [...document.querySelectorAll('.history-image img')].every(img=>img.naturalWidth>0)"), 'all available history images');
    assert.equal(await evaluate("document.querySelector('[data-order-id=\"demo-newest-images\"] img').getAttribute('src')"), newest.items[0].image);
    assert.equal(await evaluate("document.querySelector('[data-order-id=\"demo-legacy-image\"] img').getAttribute('src')"), cushion.image);
    assert.equal(await evaluate("document.querySelector('[data-order-id=\"demo-missing-images\"] img').getAttribute('src')"), vase.image);
    assert.equal(await evaluate("document.querySelectorAll('.history-image-placeholder').length"), 1);
    assert.ok(await evaluate("!document.querySelector('.history-image-placeholder').closest('a')"));
    assert.ok(!(await evaluate("[...document.querySelectorAll('.products h3')].map(el=>el.textContent)")).some(name => [cushion.name, lamp.name, vase.name].includes(name)));
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-orders'))[0].items[0].image"), undefined);
  });
  await check('failed snapshot retries catalogue image then displays a stable placeholder', async () => {
    const selector = '[data-order-id="demo-newest-images"] .history-image';
    await evaluate(`document.querySelector(${JSON.stringify(selector + ' img')}).dispatchEvent(new Event('error'))`);
    const lamp = products.find(p => p.id === 'table-lamp');
    await until(async () => await evaluate(`document.querySelector(${JSON.stringify(selector + ' img')})?.getAttribute('src')`) === lamp.image, 'catalogue retry');
    await evaluate(`document.querySelector(${JSON.stringify(selector + ' img')}).dispatchEvent(new Event('error'))`);
    await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector + ' .history-image-placeholder')})`), 'failed image placeholder');
  });
  await check('history image and name links open the correct existing product', async () => {
    await evaluate("document.querySelector('[data-order-id=\"demo-legacy-image\"] .history-image').click()");
    await expectText('Back to shop');
    assert.equal(await evaluate('location.hash'), '#/product/linen-cushion');
    await route('/my-nest', 'Demo Purchase History');
    await evaluate("document.querySelector('[data-order-id=\"demo-newest-images\"] h4 a').click()");
    await expectText('Back to shop');
    assert.equal(await evaluate('location.hash'), '#/product/table-lamp');
  });
  await check('populated order cards remain readable on narrow mobile screens', async () => {
    await route('/my-nest', 'Demo Purchase History');
    for (const width of [390, 320]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      await wait(100);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
      assert.ok(await evaluate("[...document.querySelectorAll('.history-product-info')].every(el=>el.clientWidth>120 && el.scrollWidth<=el.clientWidth)"));
      assert.ok(await evaluate("[...document.querySelectorAll('.history-image')].every(el=>el.getBoundingClientRect().width===68)"));
      assert.ok(await evaluate("document.querySelector('.nest-hero-image').getBoundingClientRect().top>=document.querySelector('.nest-hero-copy').getBoundingClientRect().bottom-1"));
      assert.ok(await evaluate("document.querySelector('.nest-refresh-copy').getBoundingClientRect().top>=document.querySelector('.nest-refresh-image').getBoundingClientRect().bottom-1"));
      assert.ok(await evaluate("[...document.querySelectorAll('.my-nest .product-copy')].every(el=>el.scrollWidth<=el.clientWidth)"));
    }
    await command('Emulation.clearDeviceMetricsOverride');
  });
  await check('redesigned Refresh preserves recommendation results after purchases and reload', async () => {
    const stored = await evaluate("({profile:JSON.parse(localStorage.getItem('nest-profile')),plans:JSON.parse(localStorage.getItem('nest-room-plans')),orders:JSON.parse(localStorage.getItem('nest-orders'))})");
    const planItems = stored.plans.plans[stored.profile.room]?.items || [];
    const expected = recommendProducts(products, { profile: stored.profile, planItems, orders: stored.orders, mode: 'refresh' }).map(item => '#/product/' + item.product.id);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('#nestique-refresh .product-img')].map(el=>el.getAttribute('href'))"), expected);
    await command('Page.reload');
    await expectText('demo-newest-images');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('#nestique-refresh .product-img')].map(el=>el.getAttribute('href'))"), expected);
    if (expected.length) {
      await evaluate("document.querySelector('#nestique-refresh .product-img').click()");
      await expectText('Back to shop');
      assert.equal(await evaluate('location.hash'), expected[0]);
      await route('/my-nest', 'Demo Purchase History');
    }
  });
  await check('legacy profile and room plan migrate without deletion', async () => {
    await evaluate(`localStorage.clear();localStorage.setItem('nest-style',JSON.stringify({name:'Cozy Luxe',room:'Dining',items:['Gold mirror']}));localStorage.setItem('nest-room-plan',JSON.stringify({room:'Dining',items:[{id:'ribbed-vase'}]}));location.hash='/my-nest'`);
    await command('Page.reload');
    await expectText('MY HOME PROFILE');
    await expectText('Cozy Luxe');
    assert.ok((await text()).includes('No demo purchases yet.'));
    assert.equal(await evaluate("document.querySelector('.history-empty a').getAttribute('href')"), '#/shop');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('nest-room-plans')).plans['Dining Room'].items[0].id"), 'ribbed-vase');
    assert.ok(await evaluate("localStorage.getItem('nest-style')!==null"));
  });
  await check('malformed localStorage cannot crash initial rendering', async () => {
    await evaluate("localStorage.clear();for(const key of ['nest-profile','nest-style','nest-room-plans','nest-room-plan','nest-cart','nest-wish','nest-orders','nest-subscription'])localStorage.setItem(key,'{broken')");
    await command('Page.reload');
    await expectText('MY HOME PROFILE');
    assert.ok((await text()).includes('Not set yet'));
  });
  await check('mobile dashboard has no horizontal overflow and navigation is usable', async () => {
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await wait(100);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
    await evaluate("document.querySelector('[aria-label=\"Toggle navigation\"]').click()");
    await until(() => evaluate("!!document.querySelector('.mobile-nav')"), 'mobile menu');
    await evaluate("document.querySelector('.mobile-nav a[href=\"#/about\"]').click()");
    await expectText('A home is a feeling.');
    assert.ok(await evaluate("!document.querySelector('.mobile-nav')"));
  });
  assert.deepEqual(runtimeErrors, [], 'Browser runtime exceptions');
  assert.deepEqual(warnings, [], 'React console warnings/errors');
  if (process.env.NESTIQUE_VISUAL_CHECK === '1') {
    // Optional real-photography captures for visual review, isolated from deterministic tests.
    await command('Fetch.disable');
    await command('Network.enable');
    await command('Network.setCacheDisabled', { cacheDisabled: true });
    const visualProfile = { style: 'Natural Living', atmosphere: 'Natural & Earthy', room: 'Living Room', colour: 'Earth & Clay', budget: 'LKR 10,000–25,000', ownedItems: ['Wooden coffee table'], quizCompleted: true };
    const selected = products.filter(p => ['linen-cushion', 'table-lamp'].includes(p.id));
    const visualOrder = createDemoOrder([{ ...selected[0], qty: 1, room: 'Living Room' }], { id: 'visual-review', createdAt: '2026-10-02T12:00:00Z' });
    await evaluate(`localStorage.setItem('nest-profile',${JSON.stringify(JSON.stringify(visualProfile))});localStorage.setItem('nest-room-plans',${JSON.stringify(JSON.stringify({activeRoom:'Living Room',plans:{'Living Room':{items:selected}}}))});localStorage.setItem('nest-orders',${JSON.stringify(JSON.stringify([visualOrder]))});location.hash='/my-nest'`);
    await command('Page.reload');
    await expectText('Welcome back to your Natural Living home.');
    await evaluate("document.querySelectorAll('img[loading=lazy]').forEach(img=>img.loading='eager')");
    await evaluate("Promise.race([Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))).then(()=>document.fonts.ready),new Promise(resolve=>setTimeout(resolve,12000))])");
    for (const width of [1440, 390]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      await evaluate('window.scrollTo(0,0)');
      await wait(150);
      const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const filename = path.join(browserProfile, `my-nest-${width}.png`);
      await writeFile(filename, Buffer.from(screenshot.data, 'base64'));
      console.log('Visual review screenshot: ' + filename);
    }
    console.log('Live photography loaded: '+await evaluate("[...document.images].filter(img=>img.naturalWidth>0).length+'/'+document.images.length"));
  }
  console.log(`PASS ${completed} browser scenarios; no runtime exceptions or React console warnings/errors.`);
} finally {
  socket?.close();
  chrome.kill();
  server.kill();
}
