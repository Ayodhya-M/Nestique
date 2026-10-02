import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Leaf, House, Palette, Wallet, Armchair, Check, Compass, Layers, Heart, RefreshCw, Plus } from 'lucide-react';
import { useStore } from '../store.jsx';
import { products, collections, rooms } from '../data/catalogue.js';
import { ROOM_TYPES, normalizeRoom } from '../utils/storage.js';
import { recommendProducts, palettes } from '../utils/recommendations.js';
import PurchaseHistory from './PurchaseHistory.jsx';
import '../my-nest.css';

const money = value => `LKR ${value.toLocaleString('en-LK')}`;
const heroImage = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=90';
const refreshImage = 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1000&q=85';
const descriptions = {
  'Warm Minimal': 'Soft neutrals, tactile layers and simple forms. A little warmth in every considered detail.',
  'Natural Living': 'Natural textures, warm earthy tones and calm, coordinated details.',
  'Soft Scandinavian': 'Light tones, gentle textures and uncluttered shapes. A little more room to breathe.',
  'Cozy Luxe': 'Rich textures, warm metallic accents and quietly elegant details.',
  'Modern Earth': 'Organic forms, grounded colours and expressive accents with a natural feel.',
};
// Visual representations of the same colour names used by the matching rules.
const swatchColours = { Oat: '#d9cdb8', Ivory: '#f2eee4', Cream: '#e9dfcb', Sand: '#c7b294', Stone: '#aaa59a', Clay: '#b8866d', Terracotta: '#ab6e50', Olive: '#798165', Earth: '#8d705a', Natural: '#ba9e76', Saffron: '#c6a15c', Sage: '#a5b19b', Brass: '#ac915b', Charcoal: '#494943', Amber: '#b47b43' };
const memorySteps = [
  [Compass, 'Discover', 'Tell us your style.'],
  [Layers, 'Curate', 'Build your room.'],
  [Heart, 'Remember', 'We remember your choices.'],
  [RefreshCw, 'Refresh', 'Discover what complements them next.'],
];

function StyleMood({ profile }) {
  const collection = collections.find(item => item.name === profile.style);
  const description = Object.hasOwn(descriptions, profile.style) ? descriptions[profile.style] : null;
  const swatches = Object.hasOwn(palettes, profile.colour) ? palettes[profile.colour] : [];
  if (!description) return <aside className="nest-mood nest-mood-empty">
    <Leaf size={30} strokeWidth={1.3} aria-hidden="true"/>
    <p className="eyebrow">YOUR STYLE MOOD</p><h3>Let’s discover your home style.</h3>
    <p>A few thoughtful choices are all it takes to find a starting point that feels like you.</p>
    <Link className="btn" to="/style-quiz">Take the Style Quiz <ArrowRight size={16}/></Link>
  </aside>;
  return <aside className="nest-mood">
    <div className="nest-mood-image"><img src={collection?.image || collections.find(item => item.id === 'natural-living')?.image || heroImage} alt={`${profile.style} interior inspiration with warm, natural textures`} loading="lazy"/><span>Style inspiration</span></div>
    <div className="nest-mood-copy"><p className="eyebrow">YOUR STYLE MOOD</p><h3>{profile.style}</h3><p>{description}</p>
      {swatches.length > 0 && <div className="nest-swatches" aria-label={`${profile.colour} colour inspiration`}>{swatches.map(colour => <span key={colour} title={colour} role="img" aria-label={colour} style={{ backgroundColor: swatchColours[colour] }}/>)}</div>}
      {profile.colour && <small>{profile.colour} · palette inspiration</small>}
    </div>
  </aside>;
}

export default function MyNest({ RecommendationGrid }) {
  const { profile, roomPlans, roomPlan, orders } = useStore();
  // Preserve the existing recommendation inputs and rules exactly.
  const planItems = profile.room === 'Multiple Spaces' ? Object.values(roomPlans).flatMap(plan => plan.items) : (roomPlans[profile.room || roomPlan.room]?.items || []);
  const picks = recommendProducts(products, { profile, planItems, orders });
  const refresh = recommendProducts(products, { profile, planItems, orders, mode: 'refresh' });
  const selectedPlans = Object.entries(roomPlans).filter(([, plan]) => plan.items.length);
  const builderLink = '/design-room' + (ROOM_TYPES.includes(profile.room) ? '?room=' + encodeURIComponent(profile.room) : '');
  const preferences = [[Leaf, 'Preferred Style', profile.style], [House, 'Room', profile.room], [Palette, 'Colour Preference', profile.colour], [Wallet, 'Budget', profile.budget]];

  return <main className="page my-nest">
    <section className="nest-hero" aria-labelledby="nest-welcome-title">
      <div className="nest-hero-copy"><p className="eyebrow">MY NEST</p><h1 id="nest-welcome-title">Your home,<br/><em>remembered.</em></h1>
        <p className="nest-hero-intro">Your style, spaces and favourite pieces — all in one place.</p>
        {profile.quizCompleted && profile.style && <p className="nest-welcome-back">Welcome back to your {profile.style} home.</p>}
        <div className="nest-hero-actions"><Link className="btn" to={builderLink}>Design My Room <ArrowRight size={16}/></Link><Link className="text-btn" to="/style-quiz">{profile.quizCompleted ? 'Retake Style Quiz' : 'Take the Style Quiz'}</Link></div>
      </div>
      <div className="nest-hero-image"><img src={heroImage} alt="A warm neutral living room with natural light and softly layered furnishings" fetchPriority="high"/><div className="nest-image-note"><Leaf size={19} strokeWidth={1.4} aria-hidden="true"/><span>A little more you.<br/><strong>In every corner.</strong></span></div></div>
    </section>

    <section className="nest-section" id="home-profile" aria-labelledby="nest-profile-title">
      <div className="nest-section-heading"><div><p className="eyebrow">MY HOME PROFILE</p><h2 id="nest-profile-title">My Home Profile</h2><p>The preferences Nestique remembers when helping you style your space.</p></div><Link className="nest-inline-link" to="/style-quiz">{profile.quizCompleted ? 'Update preferences' : 'Discover your style'} <ArrowRight size={15}/></Link></div>
      <div className="nest-profile-layout"><div className="nest-profile-cards">
        {preferences.map(([Icon, label, value]) => <div className="nest-profile-card" key={label}><Icon size={21} strokeWidth={1.4} aria-hidden="true"/><dl><dt>{label}</dt><dd>{value || 'Not set yet'}</dd></dl>{label === 'Preferred Style' && profile.atmosphere && <small>{profile.atmosphere}</small>}</div>)}
        <div className="nest-profile-card nest-owned-card"><Armchair size={22} strokeWidth={1.4} aria-hidden="true"/><dl><dt>Already Own</dt><dd>{profile.ownedItems.length ? <ul>{profile.ownedItems.map(item => <li key={item}><Check size={13} aria-hidden="true"/>{item}</li>)}</ul> : <span>No existing items saved yet.</span>}</dd></dl></div>
      </div><StyleMood profile={profile}/></div>
    </section>

    <section className="nest-section nest-recommendations" id="home-recommendations" aria-labelledby="nest-recommendations-title">
      <div className="nest-section-heading"><div><p className="eyebrow">A CONSIDERED EDIT</p><h2 id="nest-recommendations-title">Recommended for Your Home</h2><p>{profile.style ? 'Pieces selected using your saved style, room plan and preferences.' : 'A few pieces to begin with. Take the quiz to make this edit your own.'}</p></div><Link className="nest-inline-link" to="/shop">Explore the shop <ArrowRight size={15}/></Link></div>
      <RecommendationGrid items={picks} compact/>
      <details className="nest-matching-note"><summary>How these pieces are selected</summary><p>Rule-based matching uses your saved style, available product colours and complementary categories. Your saved room selects the plan used for matching, not physical room suitability. A saved budget guides the combined edit, excluding delivery.</p></details>
    </section>

    <section className="nest-section" id="my-rooms" aria-labelledby="nest-rooms-title">
      <div className="nest-section-heading"><div><p className="eyebrow">SPACE TO MAKE YOUR OWN</p><h2 id="nest-rooms-title">My Rooms</h2><p>Your saved pieces, brought together one room at a time.</p></div></div>
      {selectedPlans.length ? <div className="nest-room-cards">{selectedPlans.map(([room, plan]) => {
        const image = rooms.find(([name]) => normalizeRoom(name) === room)?.[1];
        return <article className="nest-room-card" key={room} data-room={room}>
          {image && <img src={image} alt={`${room} interior inspiration`} loading="lazy"/>}
          <div><p className="eyebrow">YOUR SAVED ROOM</p><h3>{room}</h3><p>{plan.items.length} saved {plan.items.length === 1 ? 'piece' : 'pieces'} <span aria-hidden="true">·</span> <strong>{money(plan.items.reduce((sum, product) => sum + product.price, 0))}</strong></p><Link className="nest-inline-link" to={'/design-room?room=' + encodeURIComponent(room)} aria-label={`View Room: ${room}`}>View Room <ArrowRight size={15}/></Link></div>
        </article>;
      })}<div className="nest-another-room"><Plus size={29} strokeWidth={1.2} aria-hidden="true"/><h3>Room for a new chapter.</h3><p>Bring the same thoughtful feeling to another corner of your home.</p><Link className="text-btn" to="/design-room">Style another room</Link></div></div> : <div className="nest-empty-room"><House size={32} strokeWidth={1.3} aria-hidden="true"/><div><h3>Your first room is waiting.</h3><p>Start with one piece you love. We’ll remember the rest as you go.</p></div><Link className="btn" to={builderLink}>Design My Room <ArrowRight size={16}/></Link></div>}
    </section>

    <PurchaseHistory orders={orders}/>

    <section className="nest-section nest-refresh-feature" id="nestique-refresh" aria-labelledby="nest-refresh-title">
      <div className="nest-refresh-editorial"><div className="nest-refresh-image"><img src={refreshImage} alt="A softly lit neutral living room with layered natural textures" loading="lazy"/></div><div className="nest-refresh-copy"><p className="eyebrow">NESTIQUE REFRESH</p><h2 id="nest-refresh-title">Refresh your space,<br/><em>not your whole style.</em></h2><p>Discover new pieces that complement what Nestique already remembers about your home.</p><Link className="nest-inline-link" to="/seasonal">Explore seasonal picks <ArrowRight size={15}/></Link></div></div>
      <div className="nest-refresh-products"><div className="nest-refresh-caption"><span>Little changes. A familiar feeling.</span><span>Rule-based matching</span></div><RecommendationGrid items={refresh} compact/></div>
    </section>

    <section className="nest-memory-strip" aria-labelledby="nest-memory-title"><p className="eyebrow">THOUGHTFUL BY DESIGN</p><h2 id="nest-memory-title">How Nestique Remembers Your Home</h2><ol>{memorySteps.map(([Icon, title, description], index) => <li key={title}><div><Icon size={24} strokeWidth={1.3} aria-hidden="true"/><span>0{index + 1}</span></div><h3>{title}</h3><p>{description}</p></li>)}</ol><p className="nest-browser-note">Prototype preferences and demo purchases are currently saved in this browser.</p></section>
    <p className="nest-future-note">Future: AI-assisted recommendations and room-image analysis. Current matching uses catalogue rules.</p>
  </main>;
}
