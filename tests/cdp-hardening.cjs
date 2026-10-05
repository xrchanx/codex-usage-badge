'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const crypto=require('node:crypto');
const runtime=require('../runtime/state.cjs');
const {validateCdpTarget,validateCdpExpression}=require('../agent.cjs');
const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'badge-cdp-'));
(async()=>{
  try{
    for(const port of [49152,65535])assert.equal(runtime.isSafePort(port),true);
    for(const port of [0,39222,49151,65536,NaN,'50000'])assert.equal(runtime.isSafePort(port),false);
    const target={id:'renderer',type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:50000/devtools/page/renderer'};
    assert.equal(validateCdpTarget(target,50000).port,'50000');
    assert.equal(validateCdpExpression('window.__codexUsageBadge?.update({"percent":50})'),'window.__codexUsageBadge?.update({"percent":50})');
    for(const expression of ['eval("1")','new Function("return 1")()','window.__codexUsageBadge?.update({});fetch("https://example.com")','window.__codexUsageBadge?.update(window.location)','window.open("https://example.com")'])assert.throws(()=>validateCdpExpression(expression));
    for(const changes of [{type:'worker'},{type:'other'},{url:'app://-/index.html?overlay=1'},{url:'app://-/index.html#extension'},...['0.0.0.0','192.168.1.1','[::]','example.com'].map(host=>({webSocketDebuggerUrl:`ws://${host}:50000/devtools/page/renderer`})),{webSocketDebuggerUrl:'ws://127.0.0.1:50001/devtools/page/renderer'},{webSocketDebuggerUrl:'wss://127.0.0.1:50000/devtools/page/renderer'},{webSocketDebuggerUrl:'ws://user@localhost:50000/devtools/page/renderer'},{webSocketDebuggerUrl:'ws://localhost:50000/devtools/browser/renderer'}])assert.throws(()=>validateCdpTarget({...target,...changes},50000));
    fs.writeFileSync(path.join(temp,'.codex-usage-badge-owner'),process.platform==='win32'?'local.codexusagebadge.windows':'local.codexusagebadge.macos');
    runtime.secureDirectory(temp);
    const first=await runtime.withSessionLaunch(temp,async state=>{assert.equal(runtime.readSession(temp).port,state.port);return state;});
    assert.ok(runtime.isSafePort(first.port));
    const second=await runtime.withSessionLaunch(temp,async state=>state);assert.notEqual(first.session,second.session);
    assert.equal(second.host,'127.0.0.1');
    const releaseLock=runtime.acquireLock(path.join(temp,'runtime/launch.lock'));
    try{await assert.rejects(runtime.withSessionLaunch(temp,async()=>{}),/Another/);}finally{releaseLock();}
    const f=runtime.sessionFile(temp);
    for(const changes of [{owner:'other'},{port:39222},{host:'0.0.0.0'},{session:'invalid'},{createdAt:Date.now()+100000}]){runtime.writeJson(f,{...second,...changes});assert.throws(()=>runtime.readSession(temp));}
    runtime.writeJson(f,second);
    const outside=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'badge-outside-'));
    try{const link=path.join(temp,'escape');fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>runtime.writeJson(path.join(link,'state.json'),{}),/links/);assert.equal(fs.existsSync(path.join(outside,'state.json')),false);fs.unlinkSync(link);}finally{fs.rmSync(outside,{recursive:true,force:true});}
    const available=await runtime.reservePort(),occupied=net.createServer();await available.release();await new Promise(resolve=>occupied.listen({host:'127.0.0.1',port:available.port,exclusive:true},resolve));
    const random=crypto.randomInt;let calls=0;crypto.randomInt=(...args)=>++calls===1?available.port:random(...args);
    try{const reserved=await runtime.reservePort();assert.notEqual(reserved.port,available.port);assert.ok(calls>=2);await reserved.release();}finally{crypto.randomInt=random;await new Promise(resolve=>occupied.close(resolve));}
    for(const dir of ['src','windows','startup','macos','runtime'])for(const file of fs.readdirSync(path.join(__dirname,'..',dir),{recursive:true}).filter(f=>/\.(js|cjs|ps1|cs|m)$/.test(f)))assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..',dir,file),'utf8'),/39222/,file);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../manage.cjs'),'utf8'),/39222/);
    console.log('PASS dynamic loopback ports, occupied-port retry, session ownership, atomic private state, symlink refusal, strict renderer/WebSocket validation, no production fixed port');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});

