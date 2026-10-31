const {test}=require('node:test');const assert=require('node:assert/strict');
const {createLocator}=require('../site/mobile-usability.js');
function setup(){
 const states=[],layers=[],calls=[],map={setView:(...args)=>calls.push(['view',...args]),fitBounds:(...args)=>calls.push(['bounds',...args])};
 let success,failure,options,requests=0;
 const geolocation={getCurrentPosition(ok,bad,opts){requests++;success=ok;failure=bad;options=opts;}};
 const leaflet={};for(const kind of ['circle','circleMarker'])leaflet[kind]=(point,style)=>{const layer={kind,point,style,removed:false,addTo(m){assert.equal(m,map);return this;},bindPopup(){return this;},remove(){this.removed=true;},getBounds(){return 'accuracy-bounds';}};layers.push(layer);return layer;};
 const locate=createLocator({geolocation,getMap:()=>map,leaflet,setState:(...v)=>states.push(v)});
 return {locate,states,layers,calls,get requests(){return requests;},get options(){return options;},ok:coords=>success({coords}),fail:code=>failure({code})};
}
test('location is requested only on click, repeated clicks do not duplicate requests',()=>{
 const s=setup();assert.equal(s.requests,0);s.locate();s.locate();assert.equal(s.requests,1);assert.equal(s.options.timeout,15000);s.ok({latitude:13.1,longitude:100.9,accuracy:20});assert.deepEqual(s.calls[0],['view',[13.1,100.9],16]);assert.equal(s.states.at(-1)[0],false);
 s.locate();s.ok({latitude:13.2,longitude:101,accuracy:30});assert.ok(s.layers[0].removed&&s.layers[1].removed);assert.equal(s.layers.length,4);
});
test('approximate position shows accuracy bounds instead of an overly precise zoom',()=>{
 const s=setup();s.locate();s.ok({latitude:13,longitude:101,accuracy:6000});assert.equal(s.calls[0][0],'bounds');assert.equal(s.layers[0].style.radius,6000);
});
test('permission denial and timeout recover so the user can retry',()=>{
 const s=setup();s.locate();s.fail(1);assert.match(s.states.at(-1)[1],/อนุญาต/);s.locate();assert.equal(s.requests,2);s.fail(3);assert.match(s.states.at(-1)[1],/นานเกินไป/);assert.equal(s.states.at(-1)[0],false);
});
test('unavailable geolocation and insecure pages report an actionable error',()=>{
 const states=[];createLocator({setState:(...x)=>states.push(x),secure:false})();assert.match(states[0][1],/HTTPS/);
 createLocator({setState:(...x)=>states.push(x)})();assert.match(states[1][1],/ไม่รองรับ/);
});
