import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { products } from './data/catalogue.js';
import { readStorage, writeStorage, loadProfile, normalizeProfile, normalizeItems, normalizePlans, normalizeOrders, selectRoom, updateRoomItems, ROOM_TYPES } from './utils/storage.js';
import { saveDemoOrder } from './utils/orders.js';

const Store = createContext();
export const useStore = () => useContext(Store);

export function Provider({ children }) {
  const [profile, setProfile] = useState(() => loadProfile());
  const [cart, setCart] = useState(() => normalizeItems(readStorage('nest-cart', []), products, true));
  const [wish, setWish] = useState(() => normalizeItems(readStorage('nest-wish', []), products));
  const [roomState, setRoomState] = useState(() => normalizePlans(readStorage('nest-room-plans', null), readStorage('nest-room-plan', null), products, profile));
  const [orders, setOrders] = useState(() => normalizeOrders(readStorage('nest-orders', [])));
  const [subscription, setSubscription] = useState(() => {
    const value = readStorage('nest-subscription', 'start');
    return ['start', 'seasonal', 'circle'].includes(value) ? value : 'start';
  });
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const timer = useRef();
  const checkoutLock = useRef(false);
  const persist = (key, value) => {
    const saved = writeStorage(key, value);
    if (!saved) setStorageError(true);
    return saved;
  };
  useEffect(() => { persist('nest-profile', profile); }, [profile]);
  useEffect(() => { persist('nest-cart', cart); if (cart.length) checkoutLock.current = false; }, [cart]);
  useEffect(() => { persist('nest-wish', wish); }, [wish]);
  useEffect(() => { persist('nest-room-plans', roomState); }, [roomState]);
  useEffect(() => { persist('nest-subscription', subscription); }, [subscription]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const notify = message => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(''), 3200);
  };
  const roomPlan = { room: roomState.activeRoom, items: roomState.plans[roomState.activeRoom]?.items || [] };
  const chooseRoom = room => setRoomState(state => selectRoom(state, room));
  const saveProfile = value => {
    const next = normalizeProfile(value);
    setProfile(next);
    if (ROOM_TYPES.includes(next.room)) chooseRoom(next.room);
  };
  const add = (product, quantity = 1, room = null) => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return;
    setCart(items => {
      const match = items.find(p => p.id === product.id && p.room === room);
      return match ? items.map(p => p === match ? { ...p, qty: p.qty + quantity } : p) : [...items, { ...product, qty: quantity, room }];
    });
    notify('Added to your cart');
  };
  const toggle = product => {
    setWish(items => items.some(p => p.id === product.id) ? items.filter(p => p.id !== product.id) : [...items, product]);
    notify(wish.some(p => p.id === product.id) ? 'Removed from wishlist' : 'Saved to your wishlist');
  };
  const addToRoom = product => {
    setRoomState(state => updateRoomItems(state, state.activeRoom, items => items.some(p => p.id === product.id) ? items : [...items, product]));
    notify(`${product.name} saved to ${roomState.activeRoom}`);
  };
  const removeFromRoom = id => setRoomState(state => updateRoomItems(state, state.activeRoom, items => items.filter(p => p.id !== id)));
  const completeCheckout = () => {
    if (checkoutLock.current || !cart.length) return false;
    checkoutLock.current = true;
    const saved = saveDemoOrder(orders, cart, persist);
    if (!saved) {
      checkoutLock.current = false;
      notify('Could not save the demo order. Your cart has been kept.');
      return false;
    }
    setOrders(saved.orders);
    setCart([]);
    notify('Demo order saved to this browser.');
    return true;
  };
  return <Store.Provider value={{ profile, saveProfile, cart, setCart, wish, orders, roomPlan, roomPlans: roomState.plans, chooseRoom, subscription, setSubscription, add, toggle, addToRoom, removeFromRoom, completeCheckout, notify }}>
    {storageError && <p className="storage-warning" role="alert">Browser storage is unavailable or full. Changes may not survive a reload; checkout requires a successful local save.</p>}
    {children}
    <div className={toast ? 'toast' : 'sr-only'} role="status" aria-live="polite" aria-atomic="true">{toast && <><Check size={16} aria-hidden="true"/>{toast}</>}</div>
  </Store.Provider>;
}
