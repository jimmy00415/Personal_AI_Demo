// Constructed preflight metadata for offline integration guard tests only.
// This never edits historical archives and is not actual geometry/evidence.
import {actionTraceStartRequest} from './measure-demo-performance.mjs';
export const constructedTraceTimestampContract={version:'explicit-stage-implicit-scope-start-v1',platform:'win32',tracingStartRequest:{...actionTraceStartRequest}};
export function withConstructedCoordinateProof(original) {
  const p=structuredClone(original),c=p.clickPoint;
  const base={clientPoint:{...c},scroll:{x:0,y:0},rect:{x:c.x-10,y:c.y-10,width:20,height:20},viewport:{width:390,height:844,clientWidth:390,clientHeight:844,dpr:1},visual:{width:390,height:844,offsetLeft:0,offsetTop:0,scale:1},topFrame:true,defaultRoot:true,supportedStyles:true,connected:true,sameElement:true,nativeHit:true,integerHit:true,timeOrigin:10000,documentToken:'constructed-test-document',url:p.frame.url,trigger:p.prepared.trigger,frameId:p.frame.id,loaderId:p.frame.loaderId};
  const doc={x:Math.round(c.x),y:Math.round(c.y)};
  p.hitNode={backendNodeId:p.inputNode.backendNodeId,frameId:p.frame.id};
  p.inputCoordinateProof={version:'document-hit-client-input-v1',documentPoint:doc,inverseClientPoint:{...doc},checkpoints:['before-screenshot','after-screenshot','after-DOM-reads','after-CDP-hit','before-dispatch'].map((stage,i)=>({...structuredClone(base),stage,at:100+i}))};
  // R42 synthetic prospective request proof; never retrospective raw evidence.
  p.traceTimestampContract=structuredClone(constructedTraceTimestampContract);
  return p;
}
