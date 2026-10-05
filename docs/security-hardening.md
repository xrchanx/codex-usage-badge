# Security hardening 验证报告

日期：2026-10-05。仓库：`xrchanx/codex-usage-badge`。基线 main：`d014efcd7735a4349576c6b424cac23b614f9115`。

## Security hardening summary

| 等级 | 发现与修复 |
| --- | --- |
| Critical | Fork 的运行时 updater 和构建 manifest 仍信任原作者 Releases，可能自动安装原作者后续代码。所有运行时信任来源改为 `xrchanx/codex-usage-badge`；只有 README 来源 attribution 保留原作者。集中校验请求 URL 与每次重定向，拒绝其他仓库、非 GitHub 来源和不匹配的 repository metadata。 |
| High | 自动更新默认开启。两平台改为首次安装和缺少 preference 时关闭，仅显式 UpdatesOn 开启；保留已有明确设置，手动 check/update 不改变 preference。 |
| High | 固定 CDP 端口与过宽的 target 接受范围。启动时用安全随机数分配 49152–65535 可用端口，处理占用和系统保留端口，插件锁串行化启动；显式绑定 127.0.0.1。私有原子 session state 是唯一端口来源；严格校验 renderer URL、page、ws、loopback、同一 port、target ID/path，禁止 redirects。生产代码无固定 39222。 |
| High | 两平台的 archive/manifest 检查与缓存目录标准不一致。统一 fork 身份、tag/platform/version/name/size/URL、GitHub digest（如有）、外部和内部 SHA256SUMS、manifest、allowlist/required files；拒绝额外文件、重复、大小写冲突、symlink、traversal、超限 archive/expanded size。缓存移入私有安装目录；校验失败不执行包内代码。 |
| Medium | 多处状态与日志写入缺少一致的路径/权限保护。增加共享 owner/path/atomic helper，全链拒绝 symlink/junction/reparse 越界，Windows 当前 SID ACL（仅保留不可避免的 SYSTEM/本机 Administrators 特权主体），macOS 0700/0600，随机临时文件；配置、runtime、receipt 和 rollback 写入使用原子替换，Windows shortcut 原子保存。 |
| Medium | Runtime.evaluate 接口允许过宽的 expression。限制为固定仓库 bootstrap/helper 和 JSON.stringify 数据更新；不接受任意 CDP method、用户 JavaScript 或远程脚本。移除不必要的 Runtime.enable。 |
| Medium | 原始子进程/文件系统错误可能进入日志。自动日志改为固定错误信息，不记录原始 stderr、完整 command line、项目路径、账户数据或正文。SQLite symlink/schema 失败不扩大读取范围；文件夹计量拒绝 UNC/device roots 和链接。 |
| Medium | macOS 启动保护没有排除带特殊参数的实例。控制器和原生 action 边界增加 plain-launch 保护，退出前重新确认唯一实例。Windows 的身份、前台、年龄、输入和正常退出保护继续保留。 |
| Low | 扩大 release secret/data 扫描与合成坏包测试：OpenAI/GitHub/Bearer/JWT/OAuth/private key/Cookie、auth/.env/runtime/log/DB、个人绝对路径、allowlist。CI 保留原有 read-only permissions 和 SHA pin，增加 --ignore-scripts、关闭 checkout credential persistence、运行 release 安全测试。 |

额度圆环、Token 显示、项目颜色和文件夹大小的 UI 源文件未修改。只读 Token 查询仍为参数化 `SELECT id, tokens_used`，SQLite `readOnly: true`；没有 schema fallback。额度通过本机官方 app-server，未新增凭据或聊天数据读取。

## Tests run / Tests passed

以下测试均已在 Windows 本机实际执行并通过，测试使用临时合成客户端/数据，不修改用户的 Codex 安装或会话。

| 命令 | 验证 |
| --- | --- |
| `npm ci --ignore-scripts` | 锁文件安装成功，未执行依赖安装脚本；未新增依赖。 |
| `npm run build` | stdlib-only agent 生成成功。 |
| `npm test` | 全部 18 个 Windows/跨平台 suite：额度协议与刷新、UI 双环/主题/hover/焦点/remount、Token/颜色/大小、真实 Chromium CDP、startup controllers、两平台 updater、动态端口/私有 state/锁、隐私失败边界。 |
| `npm run test:privacy` | tracked-source privacy scan 和当前 Windows ZIP audit 通过。 |
| `python scripts/build_release.py --platform Windows` | allowlist Windows 0.10.1 ZIP 与 SHA256SUMS 生成并通过 archive audit；没有发布。 |
| `python tests/release-security.py` | 合成密钥/用户数据、额外文件、路径、symlink、大小写冲突、metadata/checksum 错误被拒绝。 |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/windows.ps1` | PowerShell 解析、默认 off/明确 preference 保留、首次安装/升级失败 rollback、retry/backup/ownership/uninstall；OS 调用为 mock。 |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/windows-update.ps1` | 真实 ZIP 解压验证，内部/外部 SHA、manifest repo、extra/missing/duplicate/case/traversal/symlink 错误拒绝。 |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/windows-native.ps1` | Windows PowerShell 5.1 原生隐藏安装、真实 COM shortcut、singleton mutex、升级、正常停止/重启/卸载；合成客户端。 |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/windows-startup-native.ps1` | 原生进程身份/参数、后台拒绝、正常 OS shutdown、拒绝强退、隐藏重启、输入取消和 stop guard；合成客户端。 |
| `git diff --check` | 修改无 whitespace 错误。 |

本机没有 Playwright bundled Chromium，首次 UI 测试因此失败；后续显式设置 `PLAYWRIGHT_EXECUTABLE_PATH` 使用已安装 Chrome，完整 suite 通过。原来的 Python3 Windows Store alias 导致 privacy 命令失败，已用平台对应的 Python launcher 修复。原生 rollback 测试发现 WinPS 5.1 将 File.Replace 的 null backup 转成空字符串；改用随机备份路径后通过。最终复跑全部通过，没有隐藏失败。

## Tests not run

本机为 Windows，不能执行 macOS Objective-C/AppKit helper 编译、NSWorkspace 启动/退出/前台恢复、LaunchAgent 原生生命周期、macOS 完整 agent reconnect 回归或真实 Store Codex 登录环境。

已有两平台共用的 updater、ZIP、网络、CDP、privacy 测试，以及 macOS startup controller/shortcut 单元测试；CI 保留 macOS runner 原生测试。仍需真实 macOS 验证 native helper 参数签名、plain-launch guard、正常 quit/relaunch、private runtime permissions、安装 rollback 与现有 Codex UI 注入。Windows 真实 Store 激活路径只做源码/guard 审计，原生本机测试使用合成 executable，不声称已验证真实 Store 应用。

## 全仓审计判定

- `jaykinhoo9`：仅 README attribution 和拒绝原仓库的负面测试。
- `39222`：仅测试 fixture/负面断言，生产文件及生成 agent 中没有固定端口。
- `auth.json/access_token/refresh_token/Cookie/Bearer`：文档、secret audit pattern 和合成测试；无运行时凭据读取。
- `fetch/http/https`：私有 loopback CDP 与集中 allowlist 的 GitHub update；plist DTD URL 只是固定 XML 声明，没有下载代码。
- `Runtime.evaluate`：固定 bootstrap/status/cleanup/helper，加 JSON 数据；`eval/new Function` 只在拒绝测试和文档。
- `child_process/exec/spawn/powershell`：必要的本机官方 app-server、计量、native helper、normal launch、已验证 installer 和开发/测试；参数数组，动态值不拼入 shell source。无 shell:true、curl/wget 下载后执行、模拟键盘输入或远程脚本。
- macOS legacy shortcut 清理只处理已确认属于插件的旧 launcher/Dock/Launchpad 项；不涉及聊天或浏览器数据。

## Remaining risks

1. CDP 没有认证。相同用户的恶意进程仍能扫描随机端口或修改插件；权限与随机端口不是同用户隔离。Chromium 不支持继承预留 socket，释放 listener 到绑定仍有短暂竞态，启动前立即重检但不能完全消除。
2. GitHub digest/checksum 是完整性检查，不是独立签名；fork 发布账号或 GitHub 被攻破仍可发布合法 hash 的恶意代码。自动更新默认 off 降低自动执行风险。
3. 普通用户文件 API 无法完全消除同用户路径/ACL 替换竞态；全链 link 检查与随机原子文件减少风险。OS 映射盘/挂载点可能指向网络，文件夹计量的用户需确保这些项目在本机。
4. macOS 原生流程与真实 Windows Store Codex 还需要真实平台/应用验证。当前改变的是源仓库与本地测试包，没有更新正在运行的用户安装。
5. Windows 旧版 backup 保留以支持回滚，可能包含旧 updater cache；未自动删除恢复备份。

## 明确回答

1. 还会自动信任 jaykinhoo9 Release？**不会**。运行时唯一 repository 是 `xrchanx/codex-usage-badge`。
2. 自动更新默认关闭？**是**。缺少 preference 也关闭，明确已有 preference 保留。
3. 固定 39222 还存在？**生产代码不存在**；测试保留旧值用于验证拒绝和禁止回归。
4. CDP 只绑定 loopback？**是**，启动绑定 `127.0.0.1`；WebSocket 仅 loopback 且必须同 session port。
5. 读取 auth.json / Cookie / 登录 token？**否**。
6. 读取聊天正文？**否**；只读 thread id 和累计 tokens_used，失败不扩大读取范围。
7. Updater fail closed？**是**；未验证包不执行，失败保留旧版，rollback 测试通过。
8. 管理员 / Service / Scheduled Task？**没有**；Windows 当前用户 Startup shortcut，macOS 当前用户 LaunchAgent，无 HKLM/Defender/SmartScreen 改动。

## Commit / Push / Deploy

独立提交：`security: harden updater, CDP transport, and local runtime`，本地分支 `codex/security-hardening`，仓库 `xrchanx/codex-usage-badge`。未 push 到任何 remote，未发布 Release，未部署到服务器或覆盖用户安装。

## Files changed

```text
.github/workflows/ci.yml
README.md
SECURITY.md
docs/development.md
docs/macos.md
docs/security-hardening.md
docs/windows.md
macos/startup/bridge.m
macos/startup/controller.cjs
macos/startup/watch.cjs
manage.cjs
package.json
runtime/state.cjs
scripts/audit_release.py
scripts/build_release.py
scripts/run_python.cjs
src/agent-main.js
src/app-server.js
src/cdp.js
src/project-size-reader.js
src/thread-token-reader.js
startup/controller.cjs
startup/windows-bridge.ps1
startup/windows-native.cs
startup/windows.cjs
tests/agent-scheduling.cjs
tests/cdp-hardening.cjs
tests/lifecycle.cjs
tests/privacy-hardening.cjs
tests/regression.cjs
tests/release-security.py
tests/run.cjs
tests/startup-controller.cjs
tests/startup-native.cjs
tests/updater-network.cjs
tests/updater.cjs
tests/windows-bridge.cjs
tests/windows-native.ps1
tests/windows-startup-native.ps1
tests/windows-startup.cjs
tests/windows-update.cjs
tests/windows-update.ps1
tests/windows.cjs
tests/windows.ps1
updater/core.cjs
updater/network.cjs
updater/worker.cjs
windows/bridge.cjs
windows/manage-windows.ps1
windows/update-windows.ps1
windows/update.cjs
```

