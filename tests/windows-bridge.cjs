const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require('playwright');
const api=require('../agent.cjs');
const runtime=require('../runtime/state.cjs');
(async()=>{
  const reserved=await runtime.reservePort(),port=reserved.port;await reserved.release();
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,args:[`--remote-debugging-address=127.0.0.1`,`--remote-debugging-port=${port}`]});
  try {
    const context=await browser.newContext();
    await context.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><input id="editor"></body></html>'}));
    const pages=await Promise.all([context.newPage(),context.newPage()]);
    for(const [i,page]of pages.entries()){
      await page.goto(`http://fixture.test/window-${i}`);
      await page.evaluate(api.buildBootstrapScript());
      await page.evaluate(()=>{localStorage.setItem('codex-usage-badge.project-color.v1:project:test','red');localStorage.setItem('unrelated-setting','keep');document.querySelector('#editor').focus();});
    }
    const targets=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(t=>t.type==='page').map(t=>({...t,url:'app://-/index.html'}));
    const output=[];
    const sandbox={module:{exports:{}},require:Object.assign(name=>name==='./agent.cjs'?api:{readSession:()=>({port})},{main:{}}),URL,AbortSignal,setTimeout,clearTimeout,
      console:{log:s=>output.push(JSON.parse(s))},
      fetch:async url=>{assert.equal(url,`http://127.0.0.1:${port}/json/list`);return {ok:true,json:async()=>[...targets,{url:'https://unrelated.test'},{url:'app://-/index.html?overlay=1'}]};},
      WebSocket
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../windows/bridge.cjs'),'utf8'),sandbox);
    const {main,evaluate}=sandbox.module.exports;
    for(const ws of [`ws://example.com:${port}/test`,'ws://127.0.0.1:9999/test',`wss://127.0.0.1:${port}/test`])await assert.rejects(evaluate({...targets[0],webSocketDebuggerUrl:ws},'1'),/loopback/);
    await main('status');
    assert.equal(output[0].windows.length,2);
    for(const item of output[0].windows)assert.deepEqual(JSON.parse(item),{quota:true,folderColors:true,threadTokens:true});
    await main('cleanup');
    assert.deepEqual(output[1].windows,[true,true]);
    for(const page of pages){
      assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('codex-usage-badge.'))),false);
      assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-setting')),'keep');
      assert.equal(await page.locator('#editor').evaluate(el=>el===document.activeElement),true);
    }
    await main('cleanup'); // repeated cleanup is safe
    await assert.rejects(main('invalid-action'),/用法/);
    console.log('PASS Windows bridge over real isolated Chromium CDP: multiwindow status/cleanup, preserve unrelated storage/focus, repeated cleanup, reject external endpoints and overlays');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

