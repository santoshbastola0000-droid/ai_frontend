import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const port=Number(process.env.PORT||3005);
const sessions=new Map();
const num=(k,d)=>{const n=Number(process.env[k]??d);return Number.isFinite(n)&&n>=0?n:d};
const target=num('AI_TARGET_NPR_PER_MIN',3),fx=num('USD_TO_NPR',145);
const prices={stt:num('STT_USD_PER_MIN',0.003),input:num('LLM_INPUT_USD_PER_1M',0.15),output:num('LLM_OUTPUT_USD_PER_1M',0.60),tts:num('TTS_USD_PER_1M_CHARS',15)};
const reply=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))};
const body=async(req)=>{const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>5_000_000)throw Error('Audio too large');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString())};
function usage(s){const minutes=Math.max((Date.now()-s.started)/60000,1/60);return {totalNpr:+s.npr.toFixed(3),elapsedMinutes:+minutes.toFixed(2),nprPerMinute:+(s.npr/minutes).toFixed(2),targetNprPerMinute:target,overTarget:s.npr/minutes>target}}
function session(id){const s=sessions.get(id);if(!s)throw Error('Invalid session');return s}
async function openai(path,opts){const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY not configured');const r=await fetch('https://api.openai.com/v1/'+path,{...opts,headers:{authorization:'Bearer '+key,...opts.headers}});if(!r.ok)throw Error('OpenAI '+r.status+': '+(await r.text()).slice(0,250));return r}
const system='You are a polite Nepali RoomKhoj phone assistant. Speak in short, clear Nepali or the caller language. Ask one question at a time. Never invent room availability, pricing, or contact details. Keep replies under 35 words.';
const page=await readFile(new URL('./index.html',import.meta.url));
http.createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost');
if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(page)}
if(req.method==='POST'&&url.pathname==='/api/session'){const id=randomUUID();sessions.set(id,{started:Date.now(),npr:0,messages:[{role:'system',content:system}]});return reply(res,200,{id,targetNprPerMinute:target})}
if(req.method==='POST'&&url.pathname==='/api/turn'){
const b=await body(req),s=session(b.id);
if(!Array.isArray(b.audio)||b.audio.length>3_000_000||b.audio.some(x=>!Number.isInteger(x)||x<0||x>255))return reply(res,400,{error:'Invalid audio'});
const elapsedMin=Math.max((Date.now()-s.started)/60000,1);
if(s.npr>=target*elapsedMin*0.85)return reply(res,429,{error:'AI budget guard reached; pause or end call',usage:usage(s)});
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
if(s.npr+estimatedTts>target*elapsedMin*0.95)return reply(res,429,{error:'TTS would exceed the configured AI budget',heard:text,reply:answer,usage:usage(s)});
const speech=await openai('audio/speech',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'alloy',input:answer,response_format:'mp3'})});
const audio=Array.from(new Uint8Array(await speech.arrayBuffer()));
s.npr+=estimatedTts;
return reply(res,200,{heard:text,reply:answer,audio,usage:usage(s),note:'Cost is estimated from configured rates; verify against provider invoice.'});
}
if(req.method==='POST'&&url.pathname==='/api/end'){const b=await body(req),s=session(b.id);sessions.delete(b.id);return reply(res,200,{usage:usage(s)})}
reply(res,404,{error:'Not found'});
}catch(e){reply(res,400,{error:String(e.message||e)})}
}).listen(port,()=>console.log('AI Call Center listening on http://localhost:'+port));
