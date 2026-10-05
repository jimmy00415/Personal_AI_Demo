import assert from 'node:assert/strict';
import test from 'node:test';
import {strictCls, assessGroup} from './measure-demo-performance.mjs';

test('actual metric gate rejects invalid samples and over-budget medians and retains outliers', () => {
  assert.ok(Math.abs(strictCls([{startTime:0,value:.03,hadRecentInput:false},{startTime:500,value:.04,hadRecentInput:false},{startTime:900,value:.4,hadRecentInput:true},{startTime:2000,value:.05,hadRecentInput:false}])-.07)<1e-10);
  const good=Array.from({length:5},(_,i)=>({id:String(i),auditLcpMs:2000,observerLcpMs:2004,auditCls:.01,observerCls:.02,score:95}));
  assert.deepEqual(assessGroup(good).errors,[]);
  assert.notDeepEqual(assessGroup(good.slice(1)).errors,[]);
  assert.ok(assessGroup(good.map(s=>({...s,observerLcpMs:2600}))).errors.includes('observerLcpMs median 2600 > 2500ms'));
  assert.ok(assessGroup(good.map(s=>({...s,auditCls:.11}))).errors.includes('auditCls median 0.11 > 0.1'));
  assert.ok(assessGroup(good.map(s=>({...s,score:89}))).errors.includes('Lighthouse score median 89 < 90'));
  assert.deepEqual(assessGroup([{...good[0],auditLcpMs:4100},...good.slice(1)]).outliers,['0']);
});
