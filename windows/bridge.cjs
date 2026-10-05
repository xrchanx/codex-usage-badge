'use strict';
const { validateCdpTarget } = require('./agent.cjs');
const {readSession}=require('./runtime/state.cjs');
const expressions = {
  cleanup: `(() => { window.__codexUsageBadge?.destroy?.(); window.__codexProjectColors?.destroy?.({clearStorage:true}); window.__codexThreadTokens?.destroy?.(); window.__codexProjectSizes?.destroy?.(); return !document.getElementById('codex-usage-badge') && !document.getElementById('codex-project-colors-style') && !document.getElementById('codex-thread-tokens-style') && !document.getElementById('codex-project-sizes-style'); })()`,
  status: `JSON.stringify({quota:!!window.__codexUsageBadge,folderColors:!!window.__codexProjectColors,threadTokens:!!window.__codexThreadTokens})`
};
async function evaluate(target, expression) {
  const endpoint = validateCdpTarget(target,readSession().port);
  if(!Object.values(expressions).includes(expression))throw Error('Only fixed bridge helpers are allowed');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    const timer = setTimeout(() => done(new Error('窗口响应超时')), 3500);
    let settled = false;
    function done(error, value) {
      if (settled) return;
      settled = true; clearTimeout(timer); ws.close();
      error ? reject(error) : resolve(value);
    }
    ws.addEventListener('open', () => ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}})));
    ws.addEventListener('message', event => {
      try {
        const data = JSON.parse(event.data);
        if (data.id !== 1) return;
        if (data.error || data.result?.exceptionDetails) return done(new Error('窗口脚本执行失败'));
        done(null, data.result?.result?.value);
      } catch (error) { done(error); }
    });
    ws.addEventListener('error', () => done(new Error('无法连接窗口')));
    ws.addEventListener('close', () => done(new Error('窗口已关闭')));
  });
}
async function main(action) {
  if (!Object.hasOwn(expressions, action)) throw new Error('用法：bridge.cjs status|cleanup');
  const {port}=readSession();
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {signal:AbortSignal.timeout(2500),redirect:'error'});
  if (!response.ok) throw new Error('调试端口未就绪');
  const targets = (await response.json()).filter(t=>{try{validateCdpTarget(t,port);return true;}catch{return false;}});
  if (!targets.length) throw new Error('没有已连接的主窗口');
  const result = await Promise.all(targets.map(t => evaluate(t, expressions[action])));
  if (action === 'cleanup' && result.some(value => value !== true)) throw new Error('部分界面组件未完成清理');
  console.log(JSON.stringify({action,windows:result},null,2));
}
module.exports = {evaluate, main};
if (require.main === module) main(process.argv[2]).catch(() => { console.error('Trusted renderer connection unavailable'); process.exitCode=1; });

