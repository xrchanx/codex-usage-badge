'use strict';
const assert=require('node:assert/strict');
const {repository,allowedOutbound,fetchResponse}=require('../updater/network.cjs');
(async()=>{
  assert.equal(repository,'xrchanx/codex-usage-badge');
  const url=`https://github.com/${repository}/releases/download/v1.0.0-windows/package.zip`;
  assert.ok(allowedOutbound(url));
  for(const bad of ['https://example.com/update.zip','http://github.com/'+repository+'/releases/download/v1.0.0-windows/x.zip',url.replace(repository,'jaykinhoo9/codex-usage-badge'),url.replace(repository,'other/repository'),'https://user:password@github.com/'+repository+'/releases/download/v1.0.0-windows/x.zip']){
    let calls=0;await assert.rejects(fetchResponse(bad,{fetchImpl:()=>{calls++;}}));assert.equal(calls,0,'reject before outbound request');
  }
  let calls=0;await assert.rejects(fetchResponse(url,{fetchImpl:async()=>{calls++;return new Response('',{status:302,headers:{location:'https://evil.invalid/payload'}});}}));assert.equal(calls,1);
  const seen=[];await fetchResponse(url,{fetchImpl:async(u,options)=>{seen.push(u);assert.equal(options.redirect,'manual');return seen.length===1?new Response('',{status:302,headers:{location:'https://release-assets.githubusercontent.com/signed/package.zip?signature=test'}}):new Response('ok');}});assert.equal(seen.length,2);
  console.log('PASS outbound repository allowlist, HTTPS, credentials refusal and redirect validation before request');
})().catch(error=>{console.error(error);process.exitCode=1;});

