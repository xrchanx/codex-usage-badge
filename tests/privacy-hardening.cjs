'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {DatabaseSync} = require('node:sqlite');
function load(file, names, customRequire = require) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const context = {require: customRequire, process, setTimeout, clearTimeout, AbortController, AGENT_VERSION: 'test', mergeRateLimitsResponse: (_, value) => value};
  return vm.runInNewContext(source + `\n;({${names}})`, context);
}
const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'badge-privacy-'));
(async () => {
  const queries = [];
  const guardedRequire = name => name === 'node:sqlite' ? {DatabaseSync: class {
    constructor(file, options) { assert.equal(options.readOnly, true); this.db = new DatabaseSync(file, options); }
    prepare(sql) { queries.push(sql); assert.match(sql, /^SELECT id, tokens_used FROM threads WHERE id IN \(\?(?:,\?)*\)$/); return this.db.prepare(sql); }
    close() { this.db.close(); }
  }} : require(name);
  const {ThreadTokenReader} = load('thread-token-reader.js', 'ThreadTokenReader', guardedRequire);
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const databaseFile = path.join(temp, 'state_1.sqlite');
  const db = new DatabaseSync(databaseFile);
  db.exec('CREATE TABLE threads(id TEXT PRIMARY KEY,tokens_used INTEGER,conversation_body TEXT);');
  db.prepare('INSERT INTO threads VALUES(?,?,?)').run(id, 42, 'private conversation must stay unread'); db.close();
  fs.writeFileSync(path.join(temp, 'auth.json'), 'private auth fixture must stay unread');
  const before = fs.readFileSync(databaseFile);
  const reader = new ThreadTokenReader({home: temp});
  assert.equal(reader.read([id, "x'); SELECT * FROM threads;--"]).totals[id], 42);
  assert.deepEqual(fs.readFileSync(databaseFile), before, 'reader must not modify database');
  assert.equal(queries.length, 1);
  const incompatible = new DatabaseSync(path.join(temp, 'state_2.sqlite'));
  incompatible.exec('CREATE TABLE threads(id TEXT, conversation_body TEXT)'); incompatible.close();
  const unavailable = reader.read([id]);
  assert.equal(unavailable.ok, false); assert.equal(Object.keys(unavailable.totals).length, 0);
  assert.equal(queries.length, 2, 'schema failure must never fall back to conversation data');
  const {ThreadTokenReader: LinkedReader} = load('thread-token-reader.js', 'ThreadTokenReader', name => name === 'node:fs' ? {
    readdirSync: () => ['state_1.sqlite'], lstatSync: () => ({isFile: () => true, isSymbolicLink: () => true})
  } : (() => { assert.notEqual(name, 'node:sqlite', 'linked database must be rejected before opening'); return require(name); })());
  assert.equal(new LinkedReader({home: temp}).read([id]).ok, false);

  const {AppServerClient} = load('app-server.js', 'AppServerClient');
  const fixture = path.join(temp, 'server.cjs');
  fs.writeFileSync(fixture, `require('node:readline').createInterface({input:process.stdin}).on('line', line => { const m=JSON.parse(line); if(m.id) process.stdout.write(JSON.stringify({id:m.id,error:{message:'private account email token path'}})+'\\n'); });`);
  const client = new AppServerClient({command: process.execPath, args: [fixture], requestTimeoutMs: 1000});
  try { await assert.rejects(client.start(), error => error.message === 'App Server request failed'); }
  finally { client.stop(); }

  const {ProjectSizeScanner, refreshProjectSizes, measureDirectoryPortable} = load('project-size-reader.js', 'ProjectSizeScanner,refreshProjectSizes,measureDirectoryPortable');
  const scanner = new ProjectSizeScanner({measure: async () => { throw new Error('private email account path'); }});
  const projects = [{id: 'x); globalThis.compromised = true; //', roots: [temp]}];
  assert.equal(scanner.normalize([{id: 'remote', roots: ['\\\\host\\share', '//host/share', '\\\\?\\C:\\private', temp + '\0']}])[0].roots.length, 0, 'remote/device/NUL roots cannot trigger filesystem access');
  const realFolder = path.join(temp, 'folder'); fs.mkdirSync(realFolder);
  const junction = path.join(temp, 'junction'); fs.symlinkSync(realFolder, junction, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(measureDirectoryPortable(junction), /项目路径不可用/);
  scanner.snapshot(projects); await scanner.whenIdle();
  const snapshot = scanner.snapshot(projects);
  assert.equal(snapshot.sizes[projects[0].id].message, '无法计算文件夹占用，请检查路径和访问权限');
  const page = {window: {__codexProjectSizes: {update(value) { page.received = value; }}}};
  await refreshProjectSizes({sessions: new Map([['page', {evaluate: async expression => {
    if (expression.includes('requestedProjects')) return {result: {value: projects}};
    return vm.runInNewContext(expression, page);
  }}]])}, scanner);
  assert.equal(page.compromised, undefined);
  assert.equal(page.received.sizes[projects[0].id].state, 'error'); scanner.stop();
  console.log('PASS privacy boundary: only read-only thread totals, no schema fallback, linked DB refusal, private errors suppressed, JSON-only helper injection');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temp, {recursive: true, force: true}));

