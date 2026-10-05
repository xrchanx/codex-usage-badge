# 隐私与安全

Windows / macOS 自动更新默认关闭。首次安装或旧版缺少 preference 时设置为 disabled；升级保留明确设置，不静默重新开启。只有用户执行 `UpdatesOn` / `开启自动更新.command` 后才周期检查。手动 CheckUpdate / Update 与 macOS 检查/更新 command 始终可用，不改变 preference。更新器仅信任 `xrchanx/codex-usage-badge`；不自动信任原作者或任何其他仓库。

更新网络出口集中在 `updater/network.cjs`：仅 HTTPS fork GitHub Releases API、该 fork release download URL，以及从已校验下载 URL 跳转的 GitHub asset hosts (`release-assets.githubusercontent.com`、`objects.githubusercontent.com`、`github-releases.githubusercontent.com`)。每次跳转在发起请求前验证；不携带本机凭据。无 analytics、telemetry、tracking、SaaS error reporting、第三方 CDN、webhook、广告或远程配置。

两平台验证 repository、tag、platform、version、asset filename/size/download URL、GitHub SHA-256 digest（如提供）、外部和包内 SHA256SUMS、内部 manifest、文件 allowlist 和 required files。拒绝额外文件、路径穿越、symlink、重复文件、大小写冲突与超限解压；阻止 downgrade。安装需 owner marker，失败不执行未验证代码，保留旧版本并报告错误。GitHub 发布权限仍是信任源，哈希无法防范 fork 维护者账号或 GitHub 被攻破。

统计在本机处理，无遥测或数据上传。额度使用客户端已有登录状态查询；Token 仅读取会话 ID 和累计数值，不读取聊天正文，也不要求提供 API Key、Cookie 或访问令牌。

文件夹容量仅在本机计算，读取目录和文件元数据，不读取文件内容、不上传项目路径。统计缓存保存在后台进程内存中。

启动助手读取目标应用的进程信息和最近输入时间，用于避免打断操作；不读取按键内容或截图。Windows 启动参数只用于区分主进程、调试参数和特殊启动，不写入日志。仅对新启动且尚未操作的前台实例请求系统正常退出；不启用 Restart Manager 的强制终止选项，也不发送全局键盘输入。设置和日志保存在当前用户目录。分享诊断结果前请移除个人路径与账号信息。

每次调试启动随机选择 49152–65535 中的可用端口，检测占用及系统保留端口并重试，显式绑定 `127.0.0.1`。启动操作由插件锁串行化；私有安装目录的 `runtime/cdp-session.json` 原子保存 owner marker、loopback host、port、随机 session 和启动时间，不含凭据。agent / bridge 不接受页面、环境变量或命令行传入端口。连接前严格验证 `page`、精确 renderer URL `app://-/index.html`、`ws:`、loopback host、当前 session port 和 `/devtools/page/<target.id>`，拒绝 redirect、overlay、devtools frontend、extension 和 worker。

CDP 只执行仓库内固定 bootstrap/helper；动态值用 JSON.stringify，未使用 eval(userInput)、new Function 或远程脚本。CDP 本身没有认证，同用户恶意进程仍可发现端口、修改插件文件或抢占监听。随机端口和文件权限降低攻击面，不能构成对同用户代码的安全隔离。Chromium 启动必须释放预留 listener，释放与绑定之间仍存在短暂竞态。

写入限于插件 owned directory 与明确的当前用户启动集成路径。Windows 安装目录使用当前 SID 的受保护 ACL，仅保留 Windows 不可避免的 SYSTEM/本机 Administrators 特权主体；macOS 私有目录 0700、状态 0600。路径全链拒绝 symlink/reparse point，临时文件随机命名，JSON 原子写入。配置、runtime、worker、日志、receipt 和 cache 均不入 release；异常日志不记录原始 app-server 或文件系统错误。Status 为本机诊断可显示安装路径。普通用户权限无法阻止同用户目录替换竞态或有权修改 ACL 的进程。

发布包使用文件白名单构建，并检查凭据、个人路径与数据文件。只包含项目代码、自行编译的启动助手、文档、封面和校验清单，不包含客户端二进制或用户数据。

Windows 使用当前用户 Startup shortcut，不要求 Administrator、不创建 Service / Scheduled Task、不写 HKLM，不修改 Defender / SmartScreen。正常退出仅针对刚启动、唯一、前台、未发生 meaningful input、PID 与启动身份匹配的 Codex/ChatGPT；Restart Manager flags 为 0，不使用强制终止或键盘模拟。Node 自有 helper/CLI 可被关闭，不对用户 Codex 工作进程强退。

Token 仅读本地 SQLite `SELECT id, tokens_used`，`readOnly: true`；schema 改变或不可用时显示 unavailable/—，不回退到 session JSONL/聊天数据。不读取 auth.json、access/refresh/id token、API key、Cookie、browser profile 或 clipboard。文件夹大小仅扫描本地元数据并拒绝 UNC/device roots；OS 映射盘/挂载点仍需由用户确保为本地目录。

安全问题请优先通过 GitHub 的私密漏洞报告提交，避免在公开 Issue 中附上凭据或聊天内容。

