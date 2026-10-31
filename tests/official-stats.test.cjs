const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,ratio}=require('../site/official-stats.js');
const sample=require('../data/trams-doh.json');
test('nationwide snapshot reconciles all provinces and cause counts',()=>{
 assert.equal(validate(sample),sample);assert.equal(sample.provinces.length,77);
 assert.equal(sample.totals.records,16318);assert.equal(sample.totals.deaths,1836);
 assert.equal(sample.totals.seriousInjuries,1943);assert.equal(sample.totals.injuries,13477);
});
test('motorcycle percentage uses incident counts rather than average percentages',()=>{
 assert.equal(ratio({records:100,motorcycleRecords:25}),25);assert.equal(ratio({records:0,motorcycleRecords:0}),null);
});
test('reject inconsistent province totals, causes, dates and severity',()=>{
 for(const edit of [d=>d.totals.records++,d=>d.provinces.pop(),d=>d.causes={},d=>d.provinces[0].seriousInjuries=999999,d=>d.selectedEventRange.to='invalid']){
  const copy=structuredClone(sample);edit(copy);assert.throws(()=>validate(copy));
 }
});
