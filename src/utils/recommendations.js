import { normalizeProfile } from './storage.js';
const lookup = (table, key) => Object.hasOwn(table, key) ? table[key] : undefined;

export const companionCategories = {
  Lighting: ['Cushions', 'Decorative Objects', 'Wall Art'],
  Curtains: ['Cushions', 'Lighting', 'Throws'],
  Cushions: ['Lighting', 'Throws', 'Wall Art'],
  Vases: ['Decorative Trays', 'Candles', 'Wall Art'],
  Mirrors: ['Lighting', 'Planters', 'Decorative Objects'],
  Baskets: ['Throws', 'Cushions', 'Planters'],
  Planters: ['Baskets', 'Vases', 'Lighting'],
  Throws: ['Cushions', 'Lighting', 'Baskets'],
  'Wall Art': ['Lighting', 'Cushions', 'Decorative Objects'],
  'Table Décor': ['Vases', 'Candles', 'Decorative Trays'],
  'Decorative Trays': ['Candles', 'Vases', 'Decorative Objects'],
  'Decorative Objects': ['Wall Art', 'Decorative Trays', 'Lighting'],
  Candles: ['Decorative Trays', 'Vases', 'Table Décor'],
  Sofa: ['Cushions', 'Throws', 'Lighting'],
  Table: ['Vases', 'Candles', 'Table Décor'],
  Rug: ['Cushions', 'Lighting', 'Throws'],
  default: ['Lighting', 'Cushions', 'Vases', 'Candles'],
};

// Editorial room tags, not measurements or physical-fit analysis.
// Untagged legacy entries remain eligible; browsing is never restricted.
export const isRoomRelevant = (product, room) => !room || room === 'Multiple Spaces'
  || !Array.isArray(product.rooms) || !product.rooms.length || product.rooms.includes(room);
export const toneStyles = { Neutrals: ['Warm Minimal', 'Soft Scandinavian'], Earthy: ['Natural Living', 'Modern Earth'], Elegant: ['Cozy Luxe'], Light: ['Soft Scandinavian'] };
export const colourToTone = colour => ({ 'Soft Neutrals': 'Neutrals', 'Earth & Clay': 'Earthy', 'Light & Airy': 'Light', 'Rich Neutrals': 'Elegant' }[colour] || 'Neutrals');
export const toneToColour = tone => ({ Neutrals: 'Soft Neutrals', Earthy: 'Earth & Clay', Light: 'Light & Airy', Elegant: 'Rich Neutrals' }[tone] || '');

export const palettes = {
  'Soft Neutrals': ['Oat', 'Ivory', 'Cream', 'Sand', 'Stone'],
  'Earth & Clay': ['Clay', 'Terracotta', 'Olive', 'Earth', 'Natural', 'Saffron', 'Sage'],
  'Light & Airy': ['Ivory', 'Cream', 'Sand', 'Sage'],
  'Rich Neutrals': ['Brass', 'Charcoal', 'Amber', 'Oat'],
};

export function profileFromAnswers(answers, previous) {
  const style = { 'Natural & Earthy': 'Natural Living', 'Elegant & Luxe': 'Cozy Luxe', 'Clean & Minimal': 'Soft Scandinavian', 'Modern & Bold': 'Modern Earth', 'Warm & Cozy': 'Warm Minimal' }[answers[0]] || 'Warm Minimal';
  return normalizeProfile({ style, atmosphere: answers[0], colour: answers[1], room: answers[2], budget: answers[3], ownedItems: [...(previous?.ownedItems || []), answers[4]].filter(Boolean), quizCompleted: true });
}

export function parseBudget(label) {
  const ranges = {
    'Under LKR 5,000': { min: 0, max: 5000, exclusive: true },
    'LKR 5,000–10,000': { min: 5000, max: 10000 },
    'LKR 10,000–25,000': { min: 10000, max: 25000 },
    'LKR 25,000+': { min: 25000, max: null },
  };
  return lookup(ranges, typeof label === 'string' ? label.trim().replace(/\s*[-–—]\s*/g, '–') : '') || null;
}

export function budgetStatus(label, total) {
  const range = parseBudget(label);
  if (!range) return '';
  if (range.max !== null && (range.exclusive ? total >= range.max : total > range.max)) return 'Above your preferred budget';
  if (total < range.min) return 'Below your preferred budget range — room to add more';
  return 'Within your preferred budget';
}

export function ownedContext(ownedItems, catalogue) {
  const ids = new Set();
  const categories = [];
  for (const label of ownedItems || []) {
    const text = label.toLowerCase();
    const exact = catalogue.find(p => p.name.toLowerCase() === text || p.id === text);
    if (exact) { ids.add(exact.id); categories.push(exact.category); continue; }
    // Explicit prototype aliases; other descriptions seed categories without excluding a product.
    const alias = lookup({ 'rattan basket': 'rattan-basket', 'gold mirror': 'arch-mirror' }, text);
    if (alias) ids.add(alias);
    const category = [[/sofa/, 'Sofa'], [/table/, 'Table'], [/curtain/, 'Curtains'], [/basket/, 'Baskets'], [/mirror/, 'Mirrors'], [/rug/, 'Rug'], [/cushion/, 'Cushions'], [/lamp/, 'Lighting'], [/vase/, 'Vases']].find(([pattern]) => pattern.test(text))?.[1];
    if (category) categories.push(category);
  }
  return { ids, categories };
}

export function recommendProducts(catalogue, { profile = {}, planItems = [], orders = [], room = profile.room, limit = 4, mode = 'home', excludeIds = [], requireRoom = false } = {}) {
  const owned = ownedContext(profile.ownedItems, catalogue);
  const purchases = orders.flatMap(order => order.items.map(item => ({ ...item, room: item.room || order.room })));
  const relevantPurchases = purchases.filter(p => !p.room || !room || room === 'Multiple Spaces' || p.room === room);
  const excluded = new Set([...owned.ids, ...planItems.map(p => p.id), ...purchases.map(p => p.id), ...excludeIds]);
  const categories = [...owned.categories, ...planItems.map(p => p.category), ...relevantPurchases.map(p => p.category)];
  const complements = new Set(categories.flatMap(c => lookup(companionCategories, c) || companionCategories.default));
  const palette = lookup(palettes, profile.colour) || [];
  const budget = parseBudget(profile.budget);
  // Treat the saved range as a room-plan budget, not a minimum/maximum price for each item.
  // Saved purchases already present in a plan count only once through the plan.
  const committed = planItems.reduce((sum, p) => sum + p.price, 0);
  const candidates = catalogue.filter(p => !excluded.has(p.id) && (!requireRoom || isRoomRelevant(p, room))).map((product, index) => {
    const styleMatch = !!profile.style && product.style === profile.style;
    const complement = complements.has(product.category);
    const colourMatch = product.colors.some(c => palette.includes(c));
    const fits = budget?.max != null && (budget.exclusive ? committed + product.price < budget.max : committed + product.price <= budget.max);
    const reasons = [];
    if (styleMatch) reasons.push(`Matches your ${profile.style} style`);
    if (complement) reasons.push('Complements items already selected or owned for your home');
    if (colourMatch) reasons.push(`Available colours align with ${profile.colour}`);
    if (fits) reasons.push('Fits the remaining room-plan budget');
    const score = (styleMatch ? 100 : 0) + (complement ? 45 : 0) + (colourMatch ? 15 : 0) + (fits ? 10 : 0);
    return { product, reason: reasons.join(' · ') || 'Explore another piece from the catalogue', score, fits, complement, index };
  });
  // Refresh prioritizes complementary categories when known; then applies the same style ranking.
  candidates.sort((a, b) => (mode === 'refresh' ? Number(b.complement) - Number(a.complement) : 0) || b.score - a.score || a.index - b.index);
  // Build a combined edit within remaining budget where possible; never block manual shopping.
  let remaining = budget?.max == null ? Infinity : Math.max(0, budget.max - committed);
  const selected = [];
  for (const item of candidates) {
    if (selected.length >= limit) break;
    if (Number.isFinite(remaining) && (budget.exclusive ? item.product.price >= remaining : item.product.price > remaining)) continue;
    selected.push(item);
    remaining -= item.product.price;
  }
  return selected;
}
