import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs=require('node:fs/promises'),os=require('node:os'),http=require('node:http');
(async()=>{
 const root=process.env.EXTENSION_ROOT || resolve(import.meta.dirname, '..');
 const profile=await fs.mkdtemp(os.tmpdir()+'/tabrot-repro-');
 let pendingWorkerIcons = 0;
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/icon')) {
   const workerRequest = req.headers['sec-fetch-dest'] === 'empty';
   if (workerRequest) pendingWorkerIcons++;
   return setTimeout(()=>{
    if (workerRequest) pendingWorkerIcons--;
    res.writeHead(200,{'Content-Type':'image/svg+xml'});
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>');
   },800);
  }
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><head><title>Reload test</title><link id="icon" rel="icon" href="/icon.svg"></head><body>Reload test</body></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin='http://127.0.0.1:'+server.address().port;
 const context=await chromium.launchPersistentContext(profile,{headless:true,...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: 'chromium' }),ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+root,'--load-extension='+root]});
 const exceptions=[];
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  const admin=await context.newPage();await admin.goto('chrome://extensions');
  await admin.evaluate(()=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true}));
  const article=await context.newPage();const cdp=await context.newCDPSession(article);
  await cdp.send('Runtime.enable');cdp.on('Runtime.exceptionThrown',e=>exceptions.push(e.exceptionDetails));
  await article.goto(origin);await article.waitForFunction(()=>document.title.startsWith('☀️ '));

  for(let i=0;i<5;i++){
   await article.evaluate(i=>document.querySelector('#icon').href='/icon.svg?reload='+i,i);
   await article.evaluate(i=>{document.title='Updated '+i;},i);
   await admin.evaluate(id=>chrome.developerPrivate.reload(id,{failQuietly:true,populateErrorForUnpacked:true}),id);
   await article.waitForTimeout(500);
   const live=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
   await live.evaluate(async origin=>{
    const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===origin+'/');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:chrome.runtime.getManifest().content_scripts[0].js});
    await chrome.tabs.sendMessage(tab.id,{type:'RENDER',url:origin+'/',titleMarker:'🌿'});
   },origin);
   await article.waitForFunction(()=>document.title.startsWith('🌿 '));
   console.log('reload',i+1);
  }
  await article.waitForTimeout(2000);
  const info=await admin.evaluate(()=>new Promise(r=>chrome.developerPrivate.getExtensionsInfo({includeDisabled:true},r)));
  assert.deepEqual(exceptions, [], 'no uncaught page/isolated-world exceptions after reload');
  const extension = info.find(item => item.id === id);
  assert.ok(extension);
  assert.deepEqual(extension.runtimeErrors, [], 'Chrome extension error collection must remain empty');
  assert.deepEqual(extension.manifestErrors, []);
  console.log(`PASS: ${extension.version}, 5 reloads during title/favicon changes; fresh title scripts render correctly and Chrome reports no errors.`);
 }finally{await context.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
