# Codex Usage Badge · Codex 用量条

为 Codex 桌面端增加额度显示、项目配色、文件夹容量和会话 Token 统计，适配浅色与深色主题。

![Codex Usage Badge：原生风格额度圆环、项目配色与 Token 色块](assets/cover.png)

## 功能

- **额度圆环**：查看订阅剩余额度，绿、黄、红对应充足、偏低和即将耗尽。Plus 支持 5 小时与每周额度双圆环。
- **文件夹配色**：在项目菜单中选择颜色，方便区分不同项目。
- **文件夹容量（macOS）**：在本地项目名称旁显示目录占用，支持 KB、MB、GB 等单位，自动缓存并刷新。
- **会话 Token**：用蓝色色块表示用量，悬停查看累计 Token，按万、千万、亿显示。
- **可选自动更新**：默认关闭；显式启用后每 6 小时检查本 fork 的 GitHub Releases，校验安装包后升级，失败时恢复原版。

## 下载

[**本 fork Releases**](https://github.com/xrchanx/codex-usage-badge/releases) · macOS v0.9.4 / Windows v0.10.1 源码基线；尚未发布的安装包请按开发说明本地构建。

| 系统 | 安装包 | 使用说明 |
| --- | --- | --- |
| macOS · Apple Silicon / Intel | [fork 发布包](https://github.com/xrchanx/codex-usage-badge/releases) | [macOS 安装](docs/macos.md) |
| Windows 10 / 11 | [fork 发布包](https://github.com/xrchanx/codex-usage-badge/releases) | [Windows 安装](docs/windows.md) |

macOS 和 Windows 安装后均可沿用原应用图标，启动时自动加载。Windows 后台在新窗口尚未开始操作时请求正常重开；点击、输入或后台启动时会跳过。需要已登录的 Codex 客户端和 Node.js 24+，安装器会优先查找客户端自带的运行环境。

[更新记录](CHANGELOG.md) · [问题反馈](https://github.com/xrchanx/codex-usage-badge/issues) · [开发说明](docs/development.md) · [隐私与安全](SECURITY.md)

Windows 和 macOS 首次安装自动更新均为关闭；已有明确设置随升级保留，无设置时保持关闭。Windows 用 `UpdatesOn.cmd` 显式开启，`UpdatesOff.cmd` 关闭，`CheckUpdate.cmd` 只检查，`Update.cmd` 手动安装。macOS 使用对应的开启、关闭、检查和更新 command。[更新设置](docs/windows.md)

网络出口仅包括受控 loopback CDP、官方本机 Codex app-server，以及手动检查/更新或显式开启自动更新后的 fork GitHub API 和 GitHub Release asset。无遥测、第三方 CDN、远程配置或 webhook。Token 只读 SQLite 的 `id`、`tokens_used`；不读取凭据或聊天正文。

本仓库 fork 自 [jaykinhoo9/codex-usage-badge](https://github.com/jaykinhoo9/codex-usage-badge)，保留 MIT 来源说明；更新信任仅属于 `xrchanx/codex-usage-badge`。

非官方项目，与 OpenAI 无关联。采用 [MIT 许可](LICENSE)。

