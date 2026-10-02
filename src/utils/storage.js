export const ROOM_TYPES = ['Living Room', 'Bedroom', 'Dining Room', 'Workspace', 'Balcony'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' ? value.trim() : '';
export const normalizeRoom = value => string(value) === 'Dining' ? 'Dining Room' : string(value);

export function readStorage(key, fallback, storage) {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function normalizeProfile(value) {
  const source = isObject(value) ? value : {};
  const items = source.ownedItems ?? source.items;
  return {
    version: 2,
    style: string(source.style) || string(source.name),
    atmosphere: string(source.atmosphere),
    room: normalizeRoom(source.room),
    colour: string(source.colour),
    budget: string(source.budget),
    ownedItems: [...new Set((Array.isArray(items) ? items : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()))],
    quizCompleted: source.quizCompleted === true,
  };
}

export function loadProfile(storage) {
  const saved = readStorage('nest-profile', null, storage);
  return normalizeProfile(isObject(saved) ? saved : readStorage('nest-style', null, storage));
}

// Resolve saved IDs against the current catalogue; never trust stored prices or shapes.
export function normalizeItems(value, catalogue, quantities = false) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    const product = catalogue.find(p => p.id === item?.id);
    if (!product) continue;
    const room = normalizeRoom(item.room) || null;
    const qty = Number.isSafeInteger(item.qty) && item.qty > 0 ? item.qty : 1;
    const existing = result.find(p => p.id === product.id && (!quantities || p.room === room));
    if (existing) {
      if (quantities && Number.isSafeInteger(existing.qty + qty)) existing.qty += qty;
    } else {
      result.push(quantities ? { ...product, qty, room: room || null } : { ...product });
    }
  }
  return result;
}

export function normalizePlans(value, legacy, catalogue, profile) {
  const result = {};
  const source = isObject(value?.plans) ? value.plans : {};
  for (const room of ROOM_TYPES) {
    const plan = source[room] ?? (room === 'Dining Room' ? source.Dining : null);
    if (isObject(plan)) result[room] = { items: normalizeItems(plan.items, catalogue) };
  }
  // Only migrate legacy data when no valid new-format plan is available.
  const legacyRoom = normalizeRoom(legacy?.room);
  if (!Object.keys(result).length && ROOM_TYPES.includes(legacyRoom)) {
    result[legacyRoom] = { items: normalizeItems(legacy.items, catalogue) };
  }
  const preferred = normalizeRoom(profile?.room);
  const activeRoom = [normalizeRoom(value?.activeRoom), legacyRoom, preferred].find(r => ROOM_TYPES.includes(r)) || 'Living Room';
  return { version: 2, activeRoom, plans: result };
}

export function selectRoom(state, room) {
  if (!ROOM_TYPES.includes(room)) return state;
  return { ...state, activeRoom: room, plans: { ...state.plans, [room]: state.plans[room] || { items: [] } } };
}

export function updateRoomItems(state, room, update) {
  if (!ROOM_TYPES.includes(room)) return state;
  return { ...state, plans: { ...state.plans, [room]: { items: update(state.plans[room]?.items || []) } } };
}

// Keep historical product/price snapshots, rather than rewriting old orders at reload.
export function normalizeOrders(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.filter(order => {
    if (!isObject(order) || !string(order.id) || ids.has(order.id) || typeof order.createdAt !== 'string' || !Number.isFinite(Date.parse(order.createdAt))) return false;
    if (!Array.isArray(order.items) || !order.items.length || !order.items.every(p =>
      isObject(p) && string(p.id) && string(p.name) && string(p.category) && Number.isFinite(p.price) && p.price >= 0 && Number.isSafeInteger(p.qty) && p.qty > 0)) return false;
    if (!Number.isFinite(order.total) || order.total < 0) return false;
    ids.add(order.id);
    return true;
  }).map(order => ({
    id: order.id, createdAt: order.createdAt, demo: true,
    room: normalizeRoom(order.room) || null,
    items: order.items.map(p => ({ id: p.id, name: p.name, category: p.category, style: string(p.style), price: p.price, qty: p.qty, room: normalizeRoom(p.room) || null, ...(string(p.image) ? { image: string(p.image) } : {}) })),
    subtotal: Number.isFinite(order.subtotal) ? order.subtotal : order.items.reduce((sum, p) => sum + p.price * p.qty, 0),
    delivery: Number.isFinite(order.delivery) ? order.delivery : 0,
    total: order.total,
  }));
}
