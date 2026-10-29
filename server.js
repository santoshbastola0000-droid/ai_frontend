import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
const port=Number(process.env.PORT||3005);
const sessions=new Map();
const authTokens=new Map(), attempts=new Map();
const originAllowed='https://aifrontend-topaz.vercel.app';
const password=process.env.CALL_CENTER_ACCESS_PASSWORD||'';
const maxSessionNpr=Number(process.env.MAX_SESSION_NPR||10);
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
function authenticated(req){const token=(req.headers.authorization||'').match(/^Bearer ([a-f0-9-]{36})$/)?.[1];return token&&authTokens.get(token)>Date.now()?token:null}
function limit(req){const ip=req.socket.remoteAddress||'unknown',now=Date.now(),a=attempts.get(ip)||{n:0,until:now+60_000};if(now>a.until){a.n=0;a.until=now+60_000}a.n++;attempts.set(ip,a);return a.n<=10}

// Serialize turns per session to avoid overlapping billable API calls.
const busy=new Set();
setInterval(()=>{for(const [id,s] of sessions){if(Date.now()-s.started>30*60_000&&!busy.has(id))sessions.delete(id)}for(const [t,expiry] of authTokens)if(expiry<Date.now())authTokens.delete(t);for(const [ip,a] of attempts)if(a.until<Date.now())attempts.delete(ip)},60_000).unref();
const num=(k,d)=>{const n=Number(process.env[k]??d);return Number.isFinite(n)&&n>=0?n:d};
const target=num('AI_TARGET_NPR_PER_MIN',3),fx=num('USD_TO_NPR',145);
const prices={stt:num('STT_USD_PER_MIN',0.003),input:num('LLM_INPUT_USD_PER_1M',0.15),output:num('LLM_OUTPUT_USD_PER_1M',0.60),tts:num('TTS_USD_PER_1M_CHARS',15)};
const reply=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))};
const body=async(req)=>{const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>5_000_000)throw Error('Audio too large');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString())};
function usage(s){const minutes=Math.max((Date.now()-s.started)/60000,1/60);return {totalNpr:+s.npr.toFixed(3),elapsedMinutes:+minutes.toFixed(2),nprPerMinute:+(s.npr/minutes).toFixed(2),targetNprPerMinute:target,overTarget:s.npr/minutes>target}}
function session(id,token){const s=sessions.get(id);if(!s||s.owner!==token)throw Error('Invalid session');return s}
async function openai(path,opts){const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY not configured');const r=await fetch('https://api.openai.com/v1/'+path,{...opts,headers:{authorization:'Bearer '+key,...opts.headers}});if(!r.ok)throw Error('OpenAI '+r.status+': '+(await r.text()).slice(0,250));return r}
const system='You are a polite Nepali RoomKhoj phone assistant. Speak in short, clear Nepali or the caller language. Ask one question at a time. Never invent room availability, pricing, or contact details. Keep replies under 35 words.';
const page=await readFile(new URL('./index.html',import.meta.url));
export async function handler(req,res){try{
const url=new URL(req.url,'http://localhost');
const origin=req.headers.origin;
if(origin&&origin!==originAllowed)return reply(res,403,{error:'Origin not allowed'});
if(origin===originAllowed){res.setHeader('access-control-allow-origin',originAllowed);res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','authorization, content-type');res.setHeader('access-control-allow-methods','GET, POST, OPTIONS')}
if(req.method==='OPTIONS')return res.writeHead(204).end();
if(url.pathname==='/api/login'&&req.method==='POST'){
 if(!password||password.length<16)return reply(res,503,{error:'Set CALL_CENTER_ACCESS_PASSWORD (16+ characters) on VPS'});
 if(!limit(req))return reply(res,429,{error:'Too many login attempts'});
 const b=await body(req);
 if(!equal(b.password,password))return reply(res,401,{error:'Incorrect access password'});
 const token=randomUUID();authTokens.set(token,Date.now()+60*60_000);return reply(res,200,{token});
}
if(url.pathname.startsWith('/api/')&&!['/api/health','/api/login'].includes(url.pathname)){
 const token=authenticated(req);if(!token)return reply(res,401,{error:'Login required'});
 req.callToken=token;
}
if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(page)}
if(req.method==='GET'&&url.pathname==='/api/health')return reply(res,200,{ok:true,apiKeyConfigured:Boolean(process.env.OPENAI_API_KEY),targetNprPerMinute:target});
if(req.method==='POST'&&url.pathname==='/api/session'){const id=randomUUID();if([...sessions.values()].filter(s=>s.owner===req.callToken).length>=2)return reply(res,429,{error:'Maximum two active calls'});sessions.set(id,{owner:req.callToken,turns:0,started:Date.now(),npr:0,messages:[{role:'system',content:system}]});return reply(res,200,{id,targetNprPerMinute:target})}
if(req.method==='POST'&&url.pathname==='/api/turn'){
const b=await body(req),s=session(b.id,req.callToken);
if(s.turns>=15||Date.now()-s.started>15*60_000||s.npr>=maxSessionNpr)return reply(res,429,{error:'Session limit reached'});
if(busy.has(b.id))return reply(res,409,{error:'Previous voice turn is still processing'});
busy.add(b.id);s.turns++;
try {
if(!Array.isArray(b.audio)||b.audio.length>3_000_000||b.audio.some(x=>!Number.isInteger(x)||x<0||x>255))return reply(res,400,{error:'Invalid audio'});
const elapsedMin=Math.max((Date.now()-s.started)/60000,1);
if(s.npr>=maxSessionNpr||s.npr>=target*elapsedMin*0.85)return reply(res,429,{error:'AI budget guard reached; pause or end call',usage:usage(s)});
const blob=new Blob([Uint8Array.from(b.audio)],{type:'audio/webm'}),form=new FormData();form.append('file',blob,'caller.webm');form.append('model','gpt-4o-mini-transcribe');
const transcription=await (await openai('audio/transcriptions',{method:'POST',body:form})).json();
const text=String(transcription.text||'').trim();s.npr+=num('STT_USD_PER_MIN',0.003)*fx*(Number(b.audioSeconds)||5)/60;
if(!text)return reply(res,200,{heard:'',reply:'',usage:usage(s)});
s.messages.push({role:'user',content:text});
const result=await (await openai('chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:s.messages.slice(-12),max_tokens:110})})).json();
const answer=String(result.choices?.[0]?.message?.content||'माफ गर्नुहोस्, फेरि भन्नुहोस्।').slice(0,450);
s.npr+=fx*((result.usage?.prompt_tokens||0)*prices.input+(result.usage?.completion_tokens||0)*prices.output)/1e6;
s.messages.push({role:'assistant',content:answer});
const estimatedTts=answer.length*prices.tts*fx/1e6;
if(s.npr+estimatedTts>maxSessionNpr||s.npr+estimatedTts>target*elapsedMin*0.95)return reply(res,429,{error:'TTS would exceed the configured AI budget',heard:text,reply:answer,usage:usage(s)});
const speech=await openai('audio/speech',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'alloy',input:answer,response_format:'mp3'})});
const audio=Array.from(new Uint8Array(await speech.arrayBuffer()));
s.npr+=estimatedTts;
return reply(res,200,{heard:text,reply:answer,audio,usage:usage(s),note:'Cost is estimated from configured rates; verify against provider invoice.'});
} finally {busy.delete(b.id)}
}
if(req.method==='POST'&&url.pathname==='/api/end'){const b=await body(req),s=session(b.id,req.callToken);sessions.delete(b.id);return reply(res,200,{usage:usage(s)})}
reply(res,404,{error:'Not found'});
}catch(e){reply(res,400,{error:String(e.message||e)})}
}
if(!process.env.VERCEL)http.createServer(handler).listen(port,process.env.HOST||'127.0.0.1',()=>console.log('AI Call Center listening on http://localhost:'+port));
