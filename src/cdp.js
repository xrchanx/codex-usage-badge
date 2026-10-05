function isMainWindow(target) {
  return target?.url==='app://-/index.html';
}
function validateCdpTarget(target,port){
  if(!Number.isInteger(port)||port<49152||port>65535||target?.type!=='page'||!isMainWindow(target)||typeof target.id!=='string')throw Error('Unsafe CDP target');
  const u=new URL(target.webSocketDebuggerUrl);
  if(u.protocol!=='ws:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.port!==String(port)||u.username||u.password||u.search||u.hash||u.pathname!==`/devtools/page/${target.id}`)throw Error('CDP endpoint must match private loopback session');
  return u;
}
function buildBootstrapScript() {
  return [installUsageBadge,installProjectColors,installProjectSizes,installThreadTokens].map(fn=>`(${fn.toString()})()`).join(';\n');
}
function validateCdpExpression(expression){
  if(expression===buildBootstrapScript()||['window.__codexThreadTokens?.requestedIds() ?? []','window.__codexProjectSizes?.requestedProjects() ?? []'].includes(expression))return expression;
  const match=/^window\.__codex(?:UsageBadge|ThreadTokens|ProjectSizes)\?\.update\((.*)\)$/.exec(expression);
  if(match&&JSON.stringify(JSON.parse(match[1]))===match[1])return expression;
  throw Error('Only fixed CDP bootstrap and JSON helpers are allowed');
}
class CdpSession {
  constructor(target,port) {this.target=target;this.port=port;this.pending=new Map();this.serial=0;this.socket=null;}
  async connect() {
    const u=validateCdpTarget(this.target,this.port);
    const ws=new WebSocket(u);this.socket=ws;
    ws.addEventListener('message',event=>{
      let msg;try{msg=JSON.parse(event.data);}catch{return;}
      const p=this.pending.get(msg?.id);if(!p)return;
      this.pending.delete(msg.id);clearTimeout(p.timer);
      msg.error || msg.result?.exceptionDetails ? p.reject(new Error('CDP evaluation failed')) : p.resolve(msg.result);
    });
    ws.addEventListener('close',()=>this.rejectPending());
    ws.addEventListener('error',()=>this.rejectPending());
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{ws.close();reject(new Error('CDP handshake timed out'));},4000);
      const finish=fn=>{clearTimeout(timer);fn();};
      ws.addEventListener('open',()=>finish(resolve),{once:true});
      ws.addEventListener('error',()=>finish(()=>reject(new Error('CDP unavailable'))),{once:true});
      ws.addEventListener('close',()=>finish(()=>reject(new Error('CDP closed'))),{once:true});
    });
  }
  request(method,params={}) {
    if(method!=='Runtime.evaluate')return Promise.reject(new Error('Unsupported CDP method'));
    if(this.socket?.readyState!==WebSocket.OPEN)return Promise.reject(new Error('CDP disconnected'));
    const id=++this.serial;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP request timed out'));},5000);
      this.pending.set(id,{resolve,reject,timer});
      try{this.socket.send(JSON.stringify({id,method,params}));}catch(error){this.pending.delete(id);clearTimeout(timer);reject(error);}
    });
  }
  evaluate(expression){return this.request('Runtime.evaluate',{expression:validateCdpExpression(expression),returnByValue:true,awaitPromise:true});}
  rejectPending(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP disconnected'));}this.pending.clear();}
  close(){this.rejectPending();this.socket?.close();this.socket=null;}
}
class RendererInjector {
  constructor(){this.port=null;this.session=null;this.sessions=new Map();this.currentValue=null;this.scanning=false;this.stopped=false;}
  async scan(){
    if(this.scanning||this.stopped)return;
    this.scanning=true;
    try{
      const state=require('./runtime/state.cjs').readSession();
      if(this.session!==state.session){for(const s of this.sessions.values())s.close();this.sessions.clear();this.port=state.port;this.session=state.session;}
      const res=await fetch(`http://127.0.0.1:${this.port}/json/list`,{signal:AbortSignal.timeout(3000),redirect:'error'});
      if(!res.ok)throw new Error('CDP unavailable');
      const list=await res.json();if(!Array.isArray(list)||list.length>128)throw Error('Invalid CDP target list');
      const pages=list.filter(t=>{try{validateCdpTarget(t,this.port);return true;}catch{return false;}});
      const live=new Set(pages.map(t=>t.id));
      for(const[id,s]of this.sessions)if(!live.has(id)){s.close();this.sessions.delete(id);}
      await Promise.all(pages.map(async t=>{
        const existing=this.sessions.get(t.id), session=existing || new CdpSession(t,this.port);
        try{
          if(!existing)await session.connect();
          await session.evaluate(buildBootstrapScript());
          if(this.currentValue)await session.evaluate(`window.__codexUsageBadge?.update(${JSON.stringify(this.currentValue)})`);
          if(this.stopped){session.close();return;}
          this.sessions.set(t.id,session);
        }catch{session.close();this.sessions.delete(t.id);}
      }));
    }finally{this.scanning=false;}
  }
  async update(value){
    this.currentValue=value;
    await Promise.all([...this.sessions].map(async([id,s])=>{
      try{await s.evaluate(`window.__codexUsageBadge?.update(${JSON.stringify(value)})`);}catch{s.close();this.sessions.delete(id);}
    }));
  }
  stop(){this.stopped=true;for(const s of this.sessions.values())s.close();this.sessions.clear();}
}

