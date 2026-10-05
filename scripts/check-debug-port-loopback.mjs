import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import {freeDebugPort} from './measure-demo-performance.mjs';

const path=process.argv[2];
if(!path)throw Error('Explicit diagnostic output path required');
const record={kind:'ONE isolated NONproduct allocation/occupancy/HTTP Fetch smoke; no browser/app/navigation/timing acceptance',at:new Date().toISOString(),pid:process.pid,node:process.version};
const servers=[];
const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
try {
  const occupied=net.createServer();servers.push(occupied);await listen(occupied,49152);
  const before=process._getActiveHandles().filter(h=>h instanceof net.Server&&h.listening);
  const chosen=await freeDebugPort();
  assert.ok(Number.isSafeInteger(chosen)&&chosen>49152&&chosen<=49215);
  const after=process._getActiveHandles().filter(h=>h instanceof net.Server&&h.listening);
  assert.deepEqual(after,before,'Neither failed-bind nor successful probe leaves an owned listener');
  const endpoint=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({diagnostic:true}));});servers.push(endpoint);
  await listen(endpoint,chosen); // A successful immediate bind proves close-before-return.
  const url=`http://127.0.0.1:${chosen}/json/version`;
  const response=await fetch(url,{signal:AbortSignal.timeout(3000)});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{diagnostic:true});
  Object.assign(record,{occupiedPort:49152,chosenPort:chosen,fetchUrl:url,status:response.status,probeListeningHandlesBefore:before.length,probeListeningHandlesAfter:after.length,actualExit:0});
}catch(error){record.actualExit=1;record.error={message:error.message,code:error.code,stack:error.stack};process.exitCode=1;}
finally {
  for(const server of servers){server.closeAllConnections?.();if(server.listening)await new Promise(resolve=>server.close(resolve));}
  record.allOwnedServersClosed=servers.every(s=>!s.listening);record.closedAt=new Date().toISOString();
  await fs.writeFile(path,JSON.stringify(record,null,2));console.log(JSON.stringify(record));
}
