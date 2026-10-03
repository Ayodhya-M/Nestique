import test from 'node:test';
import assert from 'node:assert/strict';
import { products, collections } from '../src/data/catalogue.js';
import { companionCategories, recommendProducts, isRoomRelevant } from '../src/utils/recommendations.js';
import { ROOM_TYPES, normalizeItems, normalizeOrders } from '../src/utils/storage.js';
import { createDemoOrder } from '../src/utils/orders.js';

const originalPrices = {'ribbed-vase':3490,'linen-cushion':2490,'rattan-basket':4990,'table-lamp':7990,'soy-candle':2290,'arch-mirror':12990,'woven-throw':4290,'olive-planter':3890,'abstract-art':6990,'linen-curtains':8490,'festive-candle':2790,'brass-star':3690,'avurudu-runner':4590,'celebration-vase':3190};
const categories = [...new Set(products.map(p=>p.category))];

test('expanded catalogue is complete, balanced and uniquely identified',()=>{
 assert.equal(products.length,32);
 assert.equal(new Set(products.map(p=>p.id)).size,products.length);
 assert.equal(new Set(products.map(p=>p.name)).size,products.length);
 for(const p of products){
  for(const field of ['id','name','category','style','image','desc','material','dimensions']) assert.ok(typeof p[field]==='string' && p[field].trim(),p.id+' '+field);
  assert.ok(Number.isSafeInteger(p.price)&&p.price>0);
  assert.equal(new URL(p.image).hostname,'images.unsplash.com');
  assert.ok(p.colors.length && p.colors.every(c=>typeof c==='string'&&c.length));
  assert.ok(p.rooms.length && p.rooms.every(r=>ROOM_TYPES.includes(r)));
  assert.ok(collections.some(c=>c.name===p.style));
 }
 for(const category of categories) assert.ok(products.filter(p=>p.category===category).length>=2,category);
 for(const collection of collections) assert.ok(products.filter(p=>p.style===collection.name).length>=6,collection.name);
 const added=products.filter(p=>!Object.hasOwn(originalPrices,p.id));
 assert.equal(new Set(added.map(p=>p.image)).size,added.length);
 assert.ok(added.every(p=>new URL(p.imageSource).hostname==='unsplash.com'));
});

test('original IDs and prices still hydrate carts, wishlists and historical snapshots',()=>{
 const legacy=Object.entries(originalPrices).map(([id,price])=>({id,price,qty:1}));
 for(const p of legacy) assert.equal(products.find(item=>item.id===p.id)?.price,p.price,p.id);
 assert.equal(normalizeItems(legacy,products,true).length,14);
 assert.equal(normalizeItems(legacy,products).length,14);
 const order=createDemoOrder(legacy.map(p=>({...products.find(item=>item.id===p.id),qty:1})));
 order.items.forEach(p=>delete p.image);
 assert.equal(normalizeOrders([order])[0].items.length,14);
});

test('all catalogue categories have selective real companion categories',()=>{
 for(const category of categories){
  const related=companionCategories[category];
  assert.ok(related.length>=2 && related.length<=4,category);
  assert.ok(related.every(c=>categories.includes(c)&&c!==category),category);
 }
 assert.deepEqual(companionCategories['Decorative Trays'],['Candles','Vases','Decorative Objects']);
});

test('room tags constrain guided suggestions without constraining manual catalogue access',()=>{
 assert.ok(isRoomRelevant({},'Workspace'));
 assert.ok(isRoomRelevant(products[0],'Multiple Spaces'));
 const options={room:'Workspace',limit:40,requireRoom:true};
 const picks=recommendProducts(products,options);
 assert.ok(picks.length>0 && picks.every(p=>p.product.rooms.includes('Workspace')));
 assert.ok(!picks.some(p=>p.product.category==='Throws'));
 assert.equal(recommendProducts(products,{room:'Workspace',limit:40}).length,32);
});

test('every style can recommend new products deterministically and respect purchases/budget',()=>{
 for(const {name:style} of collections){
  const purchased=products.filter(p=>p.style===style).slice(-1)[0];
  const options={profile:{style,colour:'Soft Neutrals',budget:'LKR 10,000–25,000'},orders:[createDemoOrder([{...purchased,qty:1}])],mode:'refresh',limit:4};
  const picks=recommendProducts(products,options);
  assert.ok(picks.length);
  assert.ok(picks.every(p=>p.product.id!==purchased.id));
  assert.ok(picks.reduce((sum,p)=>sum+p.product.price,0)<=25000);
  assert.deepEqual(picks,recommendProducts(products,options));
 }
});

test('seasonal edits retain real products without a Wedding fallback',()=>{
 for(const season of ['Christmas','Avurudu','New Home']) assert.ok(products.some(p=>p.season===season));
 assert.equal(products.filter(p=>p.season==='Wedding').length,0);
 assert.equal(products.filter(p=>p.season).length,4);
});
