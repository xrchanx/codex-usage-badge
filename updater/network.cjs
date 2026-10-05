'use strict';
const repository='xrchanx/codex-usage-badge';
const assetHosts=new Set(['release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com']);
function allowedOutbound(value,{redirect=false}={}) {
  let u;try{u=new URL(value);}catch{return false;}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
  if(redirect&&assetHosts.has(u.hostname))return true;
  if(u.hostname==='api.github.com')return u.pathname===`/repos/${repository}/releases`&&u.search==='?per_page=100';
  return u.hostname==='github.com'&&u.pathname.startsWith(`/${repository}/releases/download/`)&&!u.search&&/^\/[^/]+\/[^/]+\/releases\/download\/v\d+\.\d+\.\d+-(windows|macos)\/[^/]+$/.test(u.pathname);
}
async function fetchResponse(url,{fetchImpl=fetch,signal,headers}={}) {
  if(!allowedOutbound(url))throw Error('Rejected non GitHub or untrusted repository URL');
  let current=url;
  for(let i=0;i<6;i++){
    const response=await fetchImpl(current,{headers,signal,redirect:'manual'});
    if(response.url&&response.url!==current&&!allowedOutbound(response.url,{redirect:true}))throw Error('Rejected non GitHub redirect URL');
    if(![301,302,303,307,308].includes(response.status))return response;
    const next=new URL(response.headers.get('location')||'',current).href;
    if(new URL(url).hostname==='api.github.com'||!allowedOutbound(next,{redirect:true}))throw Error('Rejected non GitHub redirect URL');
    current=next;
  }
  throw Error('Too many GitHub redirects');
}
function verifyAssetBytes(bytes,asset){
  const digest=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==asset.size||(asset.digest&&asset.digest!==`sha256:${digest}`))throw Error('GitHub asset size or digest mismatch');
}
function validReleaseMetadata(release,tag){
  if(release.repository&&release.repository.full_name!==repository)return false;
  if(release.html_url&&release.html_url!==`https://github.com/${repository}/releases/tag/${tag}`)return false;
  if(release.url&&!new RegExp(`^https://api\\.github\\.com/repos/${repository}/releases/[0-9]+$`).test(release.url))return false;
  return true;
}
module.exports={repository,allowedOutbound,fetchResponse,validReleaseMetadata,verifyAssetBytes};

