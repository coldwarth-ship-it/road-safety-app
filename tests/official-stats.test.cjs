const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,ratio}=require('../site/official-stats.js');
const sample=require('../data/trams-doh.json');
const baseline=require('./fixtures/trams-20261012.json');
test('historical official baseline retains exact verified counts',()=>{
 assert.equal(validate(baseline),baseline);
 assert.equal(baseline.totals.records,16318);assert.equal(baseline.totals.deaths,1836);
 assert.equal(baseline.totals.seriousInjuries,1943);assert.equal(baseline.totals.injuries,13477);
});
test('nationwide snapshot reconciles all provinces and cause counts',()=>{
 assert.equal(validate(sample),sample);assert.equal(sample.provinces.length,77);
 assert.ok(sample.totals.records>0);
 assert.ok(sample.totals.injuries>=sample.totals.seriousInjuries);
 assert.ok(sample.provinces.some(row=>row.province==='กรุงเทพมหานคร'));
 assert.ok(sample.provinces.some(row=>row.province==='บึงกาฬ'));
});
test('motorcycle percentage uses incident counts rather than average percentages',()=>{
 assert.equal(ratio({records:100,motorcycleRecords:25}),25);assert.equal(ratio({records:0,motorcycleRecords:0}),null);
});
test('reject inconsistent province totals, causes, dates and severity',()=>{
 for(const edit of [d=>d.totals.records++,d=>d.provinces.pop(),d=>d.causes={},d=>d.provinces[0].seriousInjuries=999999,d=>d.selectedEventRange.to='invalid']){
  const copy=structuredClone(sample);edit(copy);assert.throws(()=>validate(copy));
 }
});
