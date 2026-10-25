import {renderNexusOnboarding} from './lib/nexus-onboarding.mjs';
import {discoveryText} from './lib/discovery.mjs';
import {heritageImages} from './lib/heritage.mjs';
import {verifyPassword,hasNexusSession,nexusCookie,openNexusSession,closeNexusSession,nexusAnswer} from './lib/nexus.mjs';
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,extname,sep} from 'node:path';
import {render,paths} from './lib/pages.mjs';
import {validateEnquiry,saveEnquiry,notifyEnquiry,HttpError} from './lib/intake.mjs';
import {assistantAnswer} from './lib/assistant.mjs';
const root=dirname(fileURLToPath(import.meta.url)),publicDir=resolve(root,'public');
const dataDir=resolve(process.env.DATA_DIR||resolve(root,'var'));
if(dataDir===publicDir||dataDir.startsWith(publicDir+sep))throw new Error('DATA_DIR must be outside public/.');
const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const requests=new Map(),nexusAttempts=new Map();let activeChat=0;
function nexusLoginLimit(key){const now=Date.now();for(const [k,v]of nexusAttempts)if(v.until<now)nexusAttempts.delete(k);let slot=nexusAttempts.get(key);if(!slot){if(nexusAttempts.size>=10000)throw new HttpError(503,'Please try again later.');slot={count:0,until:now+900000};nexusAttempts.set(key,slot);}if(++slot.count>5)throw new HttpError(429,'Too many access attempts. Please wait 15 minutes.');}
const cleanup=setInterval(()=>{const now=Date.now();for(const [key,value] of requests)if(value.until<now)requests.delete(key);},60000);cleanup.unref();
function limit(key,max){const now=Date.now();let slot=requests.get(key);if(!slot||slot.until<now){if(requests.size>10000)throw new HttpError(503,'Please try again shortly.');slot={count:0,until:now+60000};requests.set(key,slot);}if(++slot.count>max)throw new HttpError(429,'Too many requests. Please wait a minute and try again.');}
function ip(req){const peer=req.socket.remoteAddress||'unknown';if(process.env.TRUST_PROXY==='true'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)){const forwarded=req.headers['x-forwarded-for'];if(typeof forwarded==='string')return forwarded.split(',').at(-1).trim();}return peer;}
function securityHeaders(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://www.google-analytics.com https://www.googletagmanager.com; frame-src https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
async function readJson(req,max){if(!(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Please submit using the website form.');let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>max)throw new HttpError(413,'This upload is too large. Use up to three files of 5 MB each.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'Invalid request.');}}
function checkOrigin(req){if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Please submit from the CSL website.');const origin=req.headers.origin;if(origin){const expected=process.env.SITE_URL||`http://${req.headers.host}`;try{if(new URL(origin).origin!==new URL(expected).origin)throw new Error();}catch{throw new HttpError(403,'Please submit from the CSL website.');}}}
const redirects={'/gallery':'/design-gallery','/history':'/about','/factory':'/capabilities','/general-information':'/faqs','/contact-us':'/contact'};
export function createServer(){
 const configuredChat=process.env.NEXUS_CHAT_URL?.trim();
 let nexusChatUrl;
 if(configuredChat){
  const target=new URL(configuredChat);
  if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash)throw new Error('NEXUS_CHAT_URL must be an HTTPS URL without credentials, query or fragment.');
  nexusChatUrl=target.href;
 }
 return http.createServer(async(req,res)=>{
 securityHeaders(res);
 try{const url=new URL(req.url,'http://localhost');let path=decodeURIComponent(url.pathname);if(path.includes('\0'))throw new HttpError(400,'Invalid URL.');if(path.length>1&&path.endsWith('/')){res.writeHead(308,{Location:path.slice(0,-1)+url.search});return res.end();}
 if(path==='/nexus')res.setHeader('Cache-Control','no-store');
 if(path==='/health'&&req.method==='GET')return json(res,200,{status:'ok'});
 if(path.startsWith('/api/')){
  if(nexusChatUrl&&path.startsWith('/api/nexus/'))throw new HttpError(410,'Nexus has moved to the dedicated staff chat. Please open /nexus.');
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');checkOrigin(req);limit('api:'+ip(req),30);
  if(path==='/api/nexus/login'){
   nexusLoginLimit(ip(req));if(!process.env.NEXUS_PASSWORD_HASH)throw new HttpError(503,'Staff access is not configured yet. Please contact the CSL administrator.');
   const body=await readJson(req,2000);if(!await verifyPassword(body.password,process.env.NEXUS_PASSWORD_HASH))throw new HttpError(401,'The access code could not be verified.');
   closeNexusSession(req);res.setHeader('Set-Cookie',nexusCookie(openNexusSession()));return json(res,200,{authenticated:true,sourcesConnected:false});
  }
  if(path==='/api/nexus/session')return json(res,200,{authenticated:hasNexusSession(req),sourcesConnected:false});
  if(path==='/api/nexus/logout'){closeNexusSession(req);res.setHeader('Set-Cookie',nexusCookie('',process.env,0));return json(res,200,{authenticated:false});}
  if(path==='/api/nexus/chat'){
   if(!hasNexusSession(req))throw new HttpError(401,'Please sign in to NEXUS again.');limit('nexus:'+ip(req),10);limit('global-chat',60);
   const body=await readJson(req,22000);if(typeof body.message!=='string'||!body.message.trim()||body.message.length>3000)throw new HttpError(400,'Enter a message of up to 3,000 characters.');
   const history=Array.isArray(body.history)?body.history.slice(-8).filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').map(x=>({role:x.role,content:x.content.slice(0,2000)})):[];
   if(activeChat>=3)throw new HttpError(429,'The assistant is busy. Please try again shortly.');activeChat++;try{return json(res,200,await nexusAnswer(body.message.trim(),history));}finally{activeChat--;}
  }
  if(path==='/api/enquiries'){limit('enquiry:'+ip(req),5);const body=await readJson(req,22*1024*1024);const saved=await saveEnquiry(validateEnquiry(body),dataDir);try{await notifyEnquiry(saved);}catch{console.error('Notification update failed for',saved.record.reference);}return json(res,201,{reference:saved.record.reference});}
  if(path==='/api/chat'){limit('chat:'+ip(req),15);limit('global-chat',60);const body=await readJson(req,16000);if(typeof body.message!=='string'||!body.message.trim()||body.message.length>1500)throw new HttpError(400,'Please enter a message of up to 1,500 characters.');const history=Array.isArray(body.history)?body.history.slice(-8).filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').map(x=>({role:x.role,content:x.content.slice(0,2000)})):[];if(activeChat>=3)throw new HttpError(429,'Our assistant is busy. Please try again shortly or contact the team.');activeChat++;try{return json(res,200,await assistantAnswer(body.message.trim(),history));}finally{activeChat--;}}
  throw new HttpError(404,'Endpoint not found.');
 }
 if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Method not allowed.');
 if(path==='/nexus'&&nexusChatUrl){res.setHeader('X-Robots-Tag','noindex, nofollow');res.writeHead(302,{Location:nexusChatUrl});return res.end();}
 if(redirects[path]){res.writeHead(301,{Location:redirects[path]});return res.end();}
 const origin=(process.env.SITE_URL||'http://localhost:3000').replace(/\/$/,'');
 if(path==='/robots.txt'){res.setHeader('Content-Type','text/plain');return res.end(process.env.SEARCH_INDEXING==='true'?`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /nexus\nDisallow: /onboarding\nDisallow: /nexus-training\nSitemap: ${origin}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');}
 if(path==='/sitemap.xml'){res.setHeader('Content-Type','application/xml');return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${paths.map(p=>`<url><loc>${origin.replace(/&/g,'&amp;')+p}</loc><lastmod>2026-10-24</lastmod>${heritageImages.filter(x=>x.pages.some(old=>({'/factory':'/capabilities','/history':'/about'}[old]||old)===p)).map(x=>`<image:image><image:loc>${origin}/assets/heritage/${x.file}</image:loc></image:image>`).join('')}</url>`).join('')}</urlset>`);}
 if(path==='/llms.txt'||path==='/llms-full.txt'){res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end(discoveryText(origin,paths,path==='/llms-full.txt'));}
 if(path.startsWith('/assets/')||['/styles.css','/app.js','/analytics.js','/site.webmanifest'].includes(path)){
  const file=resolve(publicDir,'.'+path);if(!file.startsWith(publicDir+sep))throw new HttpError(404,'Not found.');let info;try{info=await stat(file);}catch{throw new HttpError(404,'Not found.');}if(!info.isFile()||!mime[extname(file)])throw new HttpError(404,'Not found.');res.setHeader('Content-Type',mime[extname(file)]);res.setHeader('Cache-Control',['.css','.js'].includes(extname(file))?'no-cache':'public, max-age=3600');res.setHeader('Content-Length',info.size);return res.end(req.method==='HEAD'?undefined:await readFile(file));
 }
 if(path==='/adam'||path==='/ben'){res.setHeader('X-Robots-Tag','noindex, nofollow');res.writeHead(302,{Location:'/onboarding'+path});return res.end();}
 const onboarding=renderNexusOnboarding(path);if(onboarding){res.statusCode=onboarding.status;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');return res.end(req.method==='HEAD'?undefined:onboarding.html);}
 const page=render(path);res.statusCode=page.status;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control',path==='/nexus'?'no-store':'no-cache');res.end(req.method==='HEAD'?undefined:page.html);
 }catch(e){if(e.status)json(res,e.status,{error:e.message});else{console.error('Request failed:',e.code||e.name);json(res,500,{error:'We could not complete this request. Please try again or contact our team.'});}}
 });}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
 const host=option('--host')||process.env.HOST||'127.0.0.1',port=Number(option('--port')||process.env.PORT||3000);
 const server=createServer();server.requestTimeout=60000;server.headersTimeout=15000;server.listen(port,host,()=>console.log(`CSL website listening on ${host}:${port}`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
}
