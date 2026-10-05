'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const net=require('node:net');
const OWNER='codex-usage-badge-cdp-v1';
const checkedPermissions=new Map();
const isSafePort=port=>Number.isInteger(port)&&port>=49152&&port<=65535;
function installDirectory(){
  return process.platform==='win32'?path.join(process.env.LOCALAPPDATA,'CodexUsageBadge'):path.join(os.homedir(),'Library/Application Support/CodexUsageBadge');
}
function assertNoLinks(file){
  const absolute=path.resolve(file),base=path.parse(absolute).root;
  let current=base;
  for(const part of absolute.slice(base.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    try{if(fs.lstatSync(current).isSymbolicLink())throw Error('Owned path cannot contain links');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return absolute;
}
function secureDirectory(directory){
  assertNoLinks(directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(process.platform==='win32'){
    // Fixed script; the directory is passed through the environment, never PowerShell source.
    const script='$ErrorActionPreference="Stop"; $p=$env:CODEX_BADGE_OWNED_DIR; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,"FullControl","ContainerInherit,ObjectInherit","None","Allow"); $acl.AddAccessRule($rule); [IO.Directory]::SetAccessControl($p,$acl)';
    require('node:child_process').execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'pipe',env:{...process.env,CODEX_BADGE_OWNED_DIR:directory}});
  }else{fs.chmodSync(directory,0o700);if(fs.statSync(directory).uid!==process.getuid())throw Error('Owned directory user mismatch');}
}
function assertOwned(directory){
  assertNoLinks(directory);
  const marker=path.join(directory,'.codex-usage-badge-owner');assertNoLinks(marker);
  const expected=process.platform==='win32'?'local.codexusagebadge.windows':'local.codexusagebadge.macos';
  if(fs.readFileSync(marker,'utf8').trim()!==expected)throw Error('Install owner marker mismatch');
  if(process.platform!=='win32'&&(fs.statSync(directory).uid!==process.getuid()||(fs.statSync(directory).mode&0o077)))throw Error('Install permissions are not private');
}
function atomicWrite(file,data,{mode=0o600}={}){
  assertNoLinks(file);assertNoLinks(path.dirname(file));
  const temp=file+'.tmp-'+crypto.randomUUID();let fd;
  try{fd=fs.openSync(temp,'wx',mode);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;assertNoLinks(file);fs.renameSync(temp,file);}
  finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(temp,{force:true});}
}
function writeJson(file,value){atomicWrite(file,JSON.stringify(value,null,2)+'\n');}
function sessionFile(directory){return path.join(directory,'runtime/cdp-session.json');}
function assertPrivate(file){
  const stat=fs.statSync(file);
  if(process.platform!=='win32'){
    if(stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('Runtime permissions are not private');
    return;
  }
  const stamp=`${stat.ino}:${stat.ctimeMs}`;
  if(checkedPermissions.get(file)===stamp)return;
  // Windows hosted profiles may retain several privileged local principals.
  // Reject broad/interactive-user groups while retaining SYSTEM/admin access.
  const script='$ErrorActionPreference="Stop"; $p=$env:CODEX_BADGE_OWNED_DIR; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $deny=@("Everyone","NT AUTHORITY\\Authenticated Users","BUILTIN\\Users","Users"); $acl=if([IO.Directory]::Exists($p)){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)}; if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid){throw "Owner mismatch"}; foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.NTAccount])){if($rule.AccessControlType -eq "Allow" -and $deny -contains $rule.IdentityReference.Value){throw "Public runtime access"}}';
  try{require('node:child_process').execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'pipe',env:{...process.env,CODEX_BADGE_OWNED_DIR:file}});}
  catch(error){
    const stderr=String(error?.stderr||'');
    const reason=stderr.includes('Owner mismatch')?'owner':stderr.includes('Public runtime access')?'public':error?.code==='ENOENT'?'helper':'acl';
    throw Error(`Runtime permissions are not private (${reason})`);
  }
  checkedPermissions.set(file,stamp);
}
function readSession(directory=installDirectory()){
  assertOwned(directory);const file=sessionFile(directory);assertNoLinks(file);
  assertPrivate(path.dirname(file));assertPrivate(file);
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size>4096||(process.platform!=='win32'&&(stat.uid!==process.getuid()||(stat.mode&0o077))))throw Error('Unsafe CDP session file');
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  if(state.owner!==OWNER||state.host!=='127.0.0.1'||!isSafePort(state.port)||!Number.isSafeInteger(state.createdAt)||state.createdAt>Date.now()+1000||!/^[-a-f0-9]{36}$/.test(state.session||''))throw Error('Invalid CDP session');
  // Session state from a previous login or reboot must not be reused.
  if(state.createdAt<Date.now()-os.uptime()*1000-10000)throw Error('Expired CDP session');
  return state;
}
async function reservePort(){
  for(let attempt=0;attempt<64;attempt++){
    const port=crypto.randomInt(49152,65536),server=net.createServer();
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port,exclusive:true},resolve);});return {port,release:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};}
    catch(error){if(!['EADDRINUSE','EACCES'].includes(error.code))throw error;}
  }
  throw Error('No available private CDP port');
}
async function portInUse(port){
  if(!isSafePort(port))throw Error('Invalid CDP port');
  return new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});const done=value=>{socket.destroy();resolve(value);};socket.once('connect',()=>done(true));socket.once('error',error=>done(error.code!=='ECONNREFUSED'));socket.setTimeout(350,()=>done(true));});
}
function acquireLock(directory,{pid=process.pid,now=Date.now,isAlive=p=>{try{process.kill(p,0);return true;}catch(e){return e.code!=='ESRCH';}}}={}){
  assertNoLinks(directory);fs.mkdirSync(path.dirname(directory),{recursive:true,mode:0o700});
  for(let attempt=0;attempt<2;attempt++){
    try{fs.mkdirSync(directory,{mode:0o700});writeJson(path.join(directory,'owner.json'),{pid,startedAt:now()});return ()=>{assertNoLinks(directory);fs.rmSync(directory,{recursive:true,force:true});};}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      assertNoLinks(directory);const file=path.join(directory,'owner.json');assertNoLinks(file);
      let owner;try{owner=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
      const predatesBoot=Number.isFinite(owner?.startedAt)&&owner.startedAt<now()-os.uptime()*1000-10000;
      if(owner&&Number.isSafeInteger(owner.pid)&&owner.pid>0){if(!predatesBoot&&isAlive(owner.pid))return null;}
      else if(now()-fs.statSync(directory).mtimeMs<120000)return null;
      assertNoLinks(directory);fs.rmSync(directory,{recursive:true,force:true});
    }
  }
  return null;
}
async function withSessionLaunch(directory,launch){
  assertOwned(directory);const runtime=path.join(directory,'runtime');secureDirectory(runtime);
  const lock=path.join(runtime,'launch.lock');assertNoLinks(lock);
  const unlock=acquireLock(lock);if(!unlock)throw Error('Another private CDP launch is running');let reservation;
  try{
    reservation=await reservePort();
    const state={owner:OWNER,host:'127.0.0.1',port:reservation.port,session:crypto.randomUUID(),createdAt:Date.now()};
    writeJson(sessionFile(directory),state);
    await reservation.release();reservation=null;
    // Chromium cannot inherit a reserved listener; recheck immediately at the launch boundary.
    if(await portInUse(state.port))throw Error('CDP port became occupied');
    return await launch(state);
  }finally{if(reservation)await reservation.release();unlock();}
}
module.exports={OWNER,isSafePort,installDirectory,assertNoLinks,secureDirectory,assertOwned,atomicWrite,writeJson,sessionFile,readSession,reservePort,portInUse,acquireLock,withSessionLaunch};
if(require.main===module){
  const directory=installDirectory();
  if(process.argv[2]!=='launch')throw Error('Unknown runtime action');
  assertOwned(directory);const file=path.join(directory,'config.json');assertNoLinks(file);const config=JSON.parse(fs.readFileSync(file,'utf8'));
  if(process.platform!=='win32'||!path.isAbsolute(config.AppExe)||!/[\\/]((Codex|ChatGPT)\.exe)$/i.test(config.AppExe))throw Error('Invalid desktop executable');
  withSessionLaunch(directory,async state=>{
    const child=require('node:child_process').spawn(config.AppExe,['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${state.port}`],{detached:true,windowsHide:true,stdio:'ignore'});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
    console.log(JSON.stringify({port:state.port}));
  }).catch(()=>{console.error('Safe desktop launch failed');process.exitCode=1;});
}

