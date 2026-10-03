import test from 'node:test';
import assert from 'node:assert/strict';
import { products } from '../src/data/catalogue.js';
import { readStorage, writeStorage, loadProfile, normalizeProfile, normalizeItems, normalizePlans, normalizeOrders, selectRoom, updateRoomItems } from '../src/utils/storage.js';
import { profileFromAnswers, parseBudget, budgetStatus, recommendProducts } from '../src/utils/recommendations.js';
import { cartTotals, createDemoOrder, saveDemoOrder } from '../src/utils/orders.js';

const product = id => products.find(p => p.id === id);
const answers = { 0: 'Natural & Earthy', 1: 'Earth & Clay', 2: 'Living Room', 3: 'LKR 10,000–25,000', 4: 'Wooden coffee table' };
const profile = profileFromAnswers(answers);

test('all quiz answers survive a storage round trip', () => {
  const saved = normalizeProfile(JSON.parse(JSON.stringify(profile)));
  assert.deepEqual(saved, { version: 2, style: 'Natural Living', atmosphere: answers[0], room: answers[2], colour: answers[1], budget: answers[3], ownedItems: [answers[4]], quizCompleted: true });
  assert.equal(profileFromAnswers({ ...answers, 0: 'Modern & Bold' }).style, 'Modern Earth');
});

test('retaking quiz preserves known owned items without duplicates', () => {
  assert.deepEqual(profileFromAnswers(answers, profile).ownedItems, ['Wooden coffee table']);
  assert.deepEqual(profileFromAnswers({ ...answers, 4: 'White curtains' }, profile).ownedItems, ['Wooden coffee table', 'White curtains']);
});

test('legacy profile migration keeps known fields and does not invent missing preferences', () => {
  const migrated = normalizeProfile({ name: 'Natural Living', room: 'Dining', items: ['Rattan basket'] });
  assert.equal(migrated.style, 'Natural Living');
  assert.equal(migrated.room, 'Dining Room');
  assert.deepEqual(migrated.ownedItems, ['Rattan basket']);
  assert.equal(migrated.colour, '');
  assert.equal(migrated.budget, '');
  assert.equal(migrated.quizCompleted, false);
});

test('corrupt or inaccessible storage is safe', () => {
  assert.deepEqual(readStorage('x', [], { getItem: () => '{bad' }), []);
  assert.equal(readStorage('x', null, { getItem() { throw Error('Denied'); } }), null);
  assert.equal(writeStorage('x', [], { setItem() { throw Error('Full'); } }), false);
  for (const value of [null, false, 42, [], 'bad', { ownedItems: [null, {}, 'Sofa'] }]) {
    assert.ok(Array.isArray(normalizeProfile(value).ownedItems));
  }
});

test('cart and wishlist hydration reject bad entries and use catalogue data', () => {
  const result = normalizeItems([null, { id: 'missing' }, { id: 'linen-cushion', price: -10, qty: -4 }, { id: 'linen-cushion', qty: 2 }], products, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].price, 2490);
  assert.equal(result[0].qty, 3);
  assert.deepEqual(normalizeItems({}, products), []);
});

test('legacy plan migrates and room switches retain independent items', () => {
  let state = normalizePlans(null, { room: 'Dining', items: [product('ribbed-vase')] }, products, profile);
  state = selectRoom(state, 'Bedroom');
  state = updateRoomItems(state, 'Bedroom', () => [product('table-lamp')]);
  assert.deepEqual(state.plans['Dining Room'].items.map(p => p.id), ['ribbed-vase']);
  assert.deepEqual(state.plans.Bedroom.items.map(p => p.id), ['table-lamp']);
  state = selectRoom(state, 'Dining Room');
  assert.equal(state.activeRoom, 'Dining Room');
  assert.deepEqual(normalizePlans(JSON.parse(JSON.stringify(state)), null, products, profile), state);
});

test('new plans take precedence over stale legacy data', () => {
  const state = normalizePlans({ activeRoom: 'Bedroom', plans: { Bedroom: { items: [] } } }, { room: 'Living Room', items: [product('ribbed-vase')] }, products, profile);
  assert.equal(state.activeRoom, 'Bedroom');
  assert.equal(state.plans['Living Room'], undefined);
});

test('budget boundaries and unknown budgets are handled explicitly', () => {
  assert.equal(parseBudget('not a budget'), null);
  assert.equal(parseBudget('LKR 5,000-10,000').max, 10000);
  assert.equal(budgetStatus('Under LKR 5,000', 5000), 'Above your preferred budget');
  assert.equal(budgetStatus('LKR 5,000–10,000', 10000), 'Within your preferred budget');
  assert.match(budgetStatus('LKR 25,000+', 26000), /Within/);
  assert.match(budgetStatus('LKR 10,000–25,000', 2490), /Below/);
});

test('home recommendations favor saved style and supported product colours', () => {
  const picks = recommendProducts(products, { profile });
  assert.equal(picks[0].product.style, 'Natural Living');
  assert.ok(picks.some(p => p.reason.includes('Earth & Clay')));
  assert.deepEqual(picks, recommendProducts(products, { profile }));
});

test('recommendations exclude identifiable owned, planned and purchased products', () => {
  const orders = [createDemoOrder([{ ...product('linen-cushion'), qty: 1, room: 'Living Room' }])];
  const picks = recommendProducts(products, { profile: { ...profile, ownedItems: ['Rattan basket'] }, orders, planItems: [product('ribbed-vase')], limit: 14 });
  for (const id of ['rattan-basket', 'linen-cushion', 'ribbed-vase']) assert.ok(!picks.some(p => p.product.id === id));
});

test('refresh complements a cushion purchase and includes a lamp', () => {
  const orders = [createDemoOrder([{ ...product('linen-cushion'), qty: 1, room: 'Living Room' }])];
  const picks = recommendProducts(products, { profile: { ...profile, budget: '', ownedItems: [] }, orders, room: 'Living Room', mode: 'refresh' });
  assert.ok(picks.some(p => p.product.category === 'Lighting'));
  assert.ok(picks.every(p => p.complement));
});

test('combined edit plus selected plan stays under the budget ceiling', () => {
  const planItems = [product('linen-cushion')];
  const picks = recommendProducts(products, { profile: { ...profile, budget: 'LKR 5,000–10,000' }, planItems, limit: 14 });
  assert.ok(picks.reduce((sum, p) => sum + p.product.price, 2490) <= 10000);
  assert.deepEqual(recommendProducts(products, { profile: { ...profile, budget: 'Under LKR 5,000' }, planItems: [product('table-lamp')] }), []);
});

test('room context uses matching purchase room, without claiming room suitability', () => {
  const orders = [createDemoOrder([{ ...product('linen-cushion'), qty: 1, room: 'Bedroom' }])];
  const picks = recommendProducts(products, { profile: {}, room: 'Workspace', orders });
  assert.ok(picks.every(p => !p.complement));
  assert.ok(picks.every(p => p.product.id !== 'linen-cushion'));
});

test('demo order stores quantities, time, room and illustrative totals', () => {
  const cart = [{ ...product('linen-cushion'), qty: 2, room: 'Living Room' }];
  const order = createDemoOrder(cart, { id: 'test', createdAt: '2026-10-02T12:00:00.000Z' });
  assert.equal(order.id, 'demo-test');
  assert.equal(order.total, 5580);
  assert.equal(order.room, 'Living Room');
  assert.equal(order.items[0].qty, 2);
  assert.equal(cartTotals([{ ...product('table-lamp'), qty: 2 }]).delivery, 0);
  assert.deepEqual(normalizeOrders([order]), [order]);
});

test('failed order persistence retains the input cart and history', () => {
  const cart = [{ ...product('linen-cushion'), qty: 1 }], orders = [];
  assert.equal(saveDemoOrder(orders, cart, () => false), null);
  assert.equal(cart.length, 1);
  assert.equal(orders.length, 0);
  let stored;
  const saved = saveDemoOrder(orders, cart, (key, value) => { stored = { key, value }; return true; });
  assert.equal(stored.key, 'nest-orders');
  assert.equal(saved.orders.length, 1);
  assert.equal(stored.value[0].id, saved.order.id);
});

test('malformed history is rejected and historical prices are preserved', () => {
  assert.deepEqual(normalizeOrders([null, {}, { id: 'bad', createdAt: 'no' }]), []);
  const order = createDemoOrder([{ ...product('linen-cushion'), price: 1000, qty: 1 }]);
  assert.equal(normalizeOrders([order])[0].items[0].price, 1000);
  assert.equal(normalizeOrders([order, order]).length, 1);
});

test('unexpected saved palette/budget strings cannot resolve inherited object properties', () => {
  for (const key of ['__proto__', 'constructor', 'toString']) {
    assert.equal(parseBudget(key), null);
    assert.ok(Array.isArray(recommendProducts(products, { profile: { colour: key, budget: key, ownedItems: [key] } })));
  }
});

test('invalid new profile shape falls back to valid legacy profile', () => {
  const storage = { getItem: key => key === 'nest-profile' ? '[1,2]' : JSON.stringify({ name: 'Natural Living', items: ['Rattan basket'] }) };
  assert.equal(loadProfile(storage).style, 'Natural Living');
  assert.deepEqual(loadProfile(storage).ownedItems, ['Rattan basket']);
});

test('future order snapshots retain product images through storage hydration', () => {
  const order = createDemoOrder([{ ...product('linen-cushion'), qty: 1 }]);
  assert.equal(order.items[0].image, product('linen-cushion').image);
  assert.equal(normalizeOrders(JSON.parse(JSON.stringify([order])))[0].items[0].image, product('linen-cushion').image);
});

test('legacy and malformed image fields do not discard otherwise valid order history', () => {
  const order = createDemoOrder([{ ...product('linen-cushion'), qty: 2 }]);
  for (const image of [undefined, null, 42, {}, '', 'https://images.unsplash.com/saved-photo']) {
    const input = { ...order, items: [{ ...order.items[0], image }] };
    const result = normalizeOrders([input]);
    assert.equal(result.length, 1);
    assert.equal(result[0].items[0].qty, 2);
    assert.equal(result[0].total, order.total);
    assert.equal(result[0].items[0].image, typeof image === 'string' && image ? image : undefined);
  }
});
