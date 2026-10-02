export function cartTotals(cart) {
  const subtotal = cart.reduce((sum, p) => sum + p.price * p.qty, 0);
  const delivery = subtotal > 0 && subtotal < 10000 ? 600 : 0;
  return { subtotal, delivery, total: subtotal + delivery };
}

export function createDemoOrder(cart, { id = globalThis.crypto.randomUUID(), createdAt = new Date().toISOString() } = {}) {
  if (!cart.length) throw new Error('Your cart is empty.');
  const rooms = [...new Set(cart.map(p => p.room).filter(Boolean))];
  return {
    id: `demo-${id}`, createdAt, demo: true,
    room: rooms.length === 1 && cart.every(p => p.room === rooms[0]) ? rooms[0] : null,
    items: cart.map(({ id, name, category, style, price, qty, room, image }) => ({ id, name, category, style, price, qty, room: room || null, ...(typeof image === 'string' && image.trim() ? { image: image.trim() } : {}) })),
    ...cartTotals(cart),
  };
}

export function saveDemoOrder(orders, cart, persist, metadata) {
  const order = createDemoOrder(cart, metadata);
  const next = [order, ...orders];
  if (!persist('nest-orders', next)) return null;
  return { order, orders: next };
}
