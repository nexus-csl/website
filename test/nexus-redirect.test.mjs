import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';

test('dedicated Nexus redirects without forwarding private query values and retires preview APIs',async()=>{
 const previous=process.env.NEXUS_CHAT_URL;
 process.env.NEXUS_CHAT_URL='https://chat.csl-mfg.com';
 const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const method of ['GET','HEAD']){
   const response=await fetch(base+'/nexus?code=must-not-be-forwarded',{method,redirect:'manual'});
   assert.equal(response.status,302);
   assert.equal(response.headers.get('location'),'https://chat.csl-mfg.com/');
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
  }
  const retired=await fetch(base+'/api/nexus/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(retired.status,410);
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  if(previous===undefined)delete process.env.NEXUS_CHAT_URL;else process.env.NEXUS_CHAT_URL=previous;
 }
});

test('dedicated Nexus rejects unsafe redirect configuration',()=>{
 const previous=process.env.NEXUS_CHAT_URL;
 try{
  for(const target of ['http://chat.csl-mfg.com','https://name:secret@chat.csl-mfg.com','https://chat.csl-mfg.com/?key=secret']){
   process.env.NEXUS_CHAT_URL=target;
   assert.throws(()=>createServer(),/NEXUS_CHAT_URL/);
  }
 }finally{if(previous===undefined)delete process.env.NEXUS_CHAT_URL;else process.env.NEXUS_CHAT_URL=previous;}
});
