import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.VERCEL='1';process.env.CALL_CENTER_ACCESS_PASSWORD='test-only-access-password';
const {handler}=await import('../server.js');
test('HTTP auth boundary: hybrid requires login; invalid audio never calls provider',async()=>{
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,data,token)=>fetch(base+'/api/'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 try{
  assert.equal((await post('hybrid/session',{})).status,401);
  const auth=await(await post('login',{password:process.env.CALL_CENTER_ACCESS_PASSWORD})).json();
  const auth2=await(await post('login',{password:process.env.CALL_CENTER_ACCESS_PASSWORD})).json();
  const s=await(await post('hybrid/session',{},auth.token)).json();assert.equal(s.mode,'hybrid');
  assert.equal((await post('hybrid/usage',{id:s.id},auth2.token)).status,400);
  const bad=await post('hybrid/turn',{id:s.id,turnId:'a'.repeat(36),wav:'bad'},auth.token);assert.equal(bad.status,400);
  assert.equal((await post('hybrid/end',{id:s.id},auth.token)).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
