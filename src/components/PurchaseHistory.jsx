import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ImageOff } from 'lucide-react';
import { products } from '../data/catalogue.js';

const money = value => `LKR ${value.toLocaleString('en-LK')}`;
const imageUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
};

function PurchasedProduct({ item }) {
  const product = products.find(product => product.id === item.id);
  const [failedImages, setFailedImages] = useState([]);
  const image = [imageUrl(item.image), imageUrl(product?.image)].find(url => url && !failedImages.includes(url));
  const visual = image
    ? <img src={image} alt={item.name} width="88" height="88" onError={() => setFailedImages(failed => [...failed, image])}/>
    : <span className="history-image-placeholder" role="img" aria-label={`Image unavailable for ${item.name}`}><ImageOff size={24} aria-hidden="true"/><span>Image unavailable</span></span>;
  return <li className="history-product">
    {product ? <Link className="history-image" to={`/product/${product.id}`} aria-label={`View ${item.name}`}>{visual}</Link> : <div className="history-image">{visual}</div>}
    <div className="history-product-info"><h4>{product ? <Link to={`/product/${product.id}`}>{item.name}</Link> : item.name}</h4><p>Qty: {item.qty} <span>· {money(item.price)} each</span></p>{item.room && <p className="history-item-room">Room: {item.room}</p>}</div>
    <div className="history-line-total"><span>Line total</span><strong>{money(item.price * item.qty)}</strong></div>
  </li>;
}

export default function PurchaseHistory({ orders }) {
  const sortedOrders = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className="section purchase-history" id="purchase-history">
    <p className="eyebrow">PREVIOUSLY PURCHASED</p><h2>Demo Purchase History</h2>
    <p>Pieces Nestique remembers from your previous demo purchases.</p>
    <p className="history-disclaimer">Local prototype records only — no payment, delivery or real order fulfillment.</p>
    {sortedOrders.length ? sortedOrders.map(order => <article className="history-order" key={order.id} data-order-id={order.id}>
      <div className="history-order-heading"><div><h3>Demo Order #{order.id}</h3><p>Purchased: <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString()}</time></p><p>Room: {order.room || (order.items.some(item => item.room) ? 'See individual products' : 'Not specified')}</p></div><span className="history-badge">Prototype purchase</span></div>
      <ul className="history-products">{order.items.map((item, index) => <PurchasedProduct key={`${item.id}-${index}`} item={item}/>)}</ul>
      <div className="history-order-total"><p>Includes {money(order.delivery)} illustrative delivery</p><div><span>Order Total</span><strong>{money(order.total)}</strong></div></div>
    </article>) : <div className="history-empty"><ShoppingBag size={30} aria-hidden="true"/><h3>No demo purchases yet.</h3><p>Complete a prototype checkout to see the pieces Nestique remembers here.</p><Link className="btn" to="/shop">Explore the Shop</Link></div>}
  </section>;
}
