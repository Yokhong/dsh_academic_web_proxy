# DSH Academic Web Proxy

[English](README.en.md) · [使用指南 / GUIDE](docs/GUIDE.md) · [升级说明](docs/UPGRADING.md) · [隐私说明](docs/PRIVACY.md)

为 DeepSeek Harness 提供独立的学术网站代理设置，在当前任务的现有共享浏览器中打开机构代理页面，并在需要登录或人机验证时交由用户在原标签页操作。v0.2.1 修复旧 `browser_*` 与新 `dsh_browser_*` 工具命名兼容，保留 0.2 的可选论文 PDF 文件重命名和三语言设置界面。

**0.2.1 的安全变化：生产 DesktopBridge 不能证明页面属于当前任务，因此停用后台页面扫描、自动代理跳转和强制展示标签页；启用并配置后运行模式为 `tools-only`。** 人工在浏览器中导航不会自动应用代理；请明确调用 `academic_proxy_open`，导航后调用 `academic_proxy_check`。这不是与旧版自动监控功能完全等价的适配。

**重命名默认关闭，下载文件夹默认为空。** 开启后只处理明确选择的本地文件夹中符合条件的新 PDF：必须先观察到新出现的 `X.pdf.crdownload` 或 `X.pdf.part`，随后该临时文件消失、同名 `X.pdf` 稳定至少 2 秒，并通过 PDF 完整性和论文元数据匹配检查。这是文件系统轮询启发式，不是浏览器原生下载完成事件，也不保证每篇论文都能重命名。

以下情况保留原文件名：已有文件、未观察到临时文件的快速下载、临时与最终文件名不对应的“另存为”、缺少或歧义元数据、加密或损坏 PDF、超过 64 MiB、子文件夹、符号链接、已有硬链接，以及不支持安全硬链接操作的文件系统。重命名后浏览器下载记录可能仍指向旧名称；请在下载文件夹中确认结果。

## 安装与升级

运行要求：Node.js `>=22.19`、DSH `>=0.2.0-rc.2 <0.3.0 || 0.2.1-rc.2`；可选 browser peer 为 `dsh-builtin-browser` `0.3.x || 0.4.15`。适配旧 `browser_*` 与新 `dsh_browser_*` 注册表工具；代表版本 `0.3.1` 和 `0.4.15` 的接口结构核对不等于真实 provider 验证，也不表示整个 `0.3.x` 范围均已实测。生产 DesktopBridge 的 `taskScoped: false` 不提供当前任务归属证明，因此不会探测浏览器窗口来启用自动监控。

npm semver 不会让原范围自动包含跨 patch 的预发布版 `0.2.1-rc.2`，因此本次仅显式补入该版本，原下限不变，不延伸到未经验证的 `0.2.1-rc.3`。维护者已提供真实 SDK `0.2.0-rc.2` 与 `0.2.1-rc.2` 的隔离离线运行结果；浏览器仍使用桩，最终冻结后的数量和产物证据见[验证报告](docs/VALIDATION.md)，不据此声称真实 browser provider 已验。

从含 v0.2.1 的源码树构建安装包：

```sh
git clone https://github.com/Yokhong/dsh_academic_web_proxy.git
cd dsh_academic_web_proxy
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.2.1.tgz
```

将 `your-profile` 替换为目标 DSH profile 名称，并先核对 `package.json` 的版本；公开仓库、npm 与 GitHub Release 的发布是独立步骤，本地构建不代表它们已发布。仅在 npm 确实提供 `0.2.1` 时使用 `dsh plugin --profile your-profile add dsh-academic-web-proxy@0.2.1`。本修复须发布新的 `v0.2.1` tag 和 npm `0.2.1`，不能修改已发布的 `v0.2.0` tag 或把它当作已包含修复；市场已有该项目条目时通常无需重复提交。运行时包不包含开发测试脚本，需要重新打包时使用源码树。

从 0.1 或 0.2 升级前备份当前 profile 的插件设置，见[升级说明](docs/UPGRADING.md)。版本 1 设置封套及原有代理值继续兼容，0.1 缺少的语言和重命名字段填入默认值，0.2 已保存的偏好保留；不要在没有备份的情况下直接回退旧版。语言或命名偏好的更改不会清除代理的待人工处理状态或防循环记录；缺少 `settings` 的无效保存 POST 会被拒绝，不会重置配置。

## 首次设置

在 DSH Settings 中打开 **Academic Web Proxy**：

1. 选择插件界面语言：简体中文 `zh-CN`（默认）、繁體中文 `zh-TW` 或美式英语 `en-US`。它独立于 DSH 的界面语言，切换立即显示并自动保存。
2. 按机构文档填写 `Login URL Scheme` 或 `Proxied URL Scheme`。两项初始均为空；都为空时不会做代理路由。
3. 选择默认域名组，按需添加自定义域名。默认组有 47 个主机名；它与自定义列表分别保存，关闭默认组不会清空自定义项。
4. 若需重命名，先让浏览器将文件保存到自己明确选择的本地下载文件夹，在插件中填入该文件夹的**绝对路径**，再开启 PDF 文件重命名。此设置只观察该文件夹，不会修改浏览器下载位置，也不支持网络共享、设备路径或子文件夹递归。
5. 等待设置保存成功；若启用重命名，还须确认 `renaming.ready` 为 `true`。随后用 `academic_proxy_open` 打开论文摘要页，调用 `academic_proxy_check` 检查，再使用下载工具。设置约在最后一次修改 600 ms 后保存；保存失败时按界面提示处理。

不要把机构模板、下载目录、登录信息或其他个人配置提交到仓库。设置页状态的 `scope: profile` 只描述 profile 注册表，不保证当前任务的工具可用；请在目标任务中检查 `academic_proxy_status`。

## 代理规则与人工操作

域名采用精确匹配，例如 `example.org` 不自动包含 `www.example.org`。自定义域名只填写主机名，不带协议、端口、路径或通配符。修改模板不会改写默认组和自定义列表。

模板占位符：`%u` 为编码后的完整原始 URL，`%h` 为主机名（HTTPS 主机中的点转换为连字符），`%p` 为路径、查询和片段。以下只是虚构格式示例，不能直接作为机构配置：

```text
Login URL Scheme: https://login.example.edu/login?qurl=%u
Proxied URL Scheme: https://%h.proxy.example.edu/%p
```

配置了登录模板时优先使用它。规则包含已代理页面与重定向循环检查，不做 HTTP 降级，不支持非标准端口或页面子请求代理。0.2.1 不后台监视人工导航，也不是网络请求拦截器；只有显式代理工具调用才按配置处理目标 URL。

遇到登录或 CAPTCHA，停止自动交互，保留**同一个原标签页**，由用户完成操作，再调用 `academic_proxy_check`。不填写密码、不解答或重试验证码，也不为尝试强制展示而额外探测或触碰阻断页。生产桥接不保证原标签页自动置前；用户可能需要手动选择当前任务窗口和原标签。

## PDF 文件名

可选择以下五个字段，顺序固定，字段间使用下划线，扩展名为 `.pdf`：

| 顺序 | 字段 | 内容 | 默认选择 |
| --- | --- | --- | --- |
| 1 | `title` | 论文标题 | 是 |
| 2 | `author` | 第一位作者 | 否 |
| 3 | `year` | 明确的发表年份 | 是 |
| 4 | `venue` | 期刊或会议名称 | 否 |
| 5 | `platform` | 可识别的平台，如 ASCE、Elsevier、Springer、MDPI | 是 |

默认组合是 `title_year_platform.pdf`。例如虚构元数据可能生成 `A study of porous materials_2025_ASCE.pdf`。界面预览使用示例元数据，不表示当前下载已匹配或已重命名。

缺少的所选字段会跳过；未选择任何字段或所有所选字段都没有值时保留原名。非法文件名字符会替换，过长名称会截短；重名时添加 ` (1)`、` (2)` 等后缀，不覆盖已有文件。文件保留在原文件夹，采用“创建独占硬链接、验证、移除原名称”的方式变更名称；不支持该操作时保留原文件。

元数据来自已打开论文页面的 citation、Dublin Core、PRISM、ScholarlyArticle JSON-LD 等字段；缺失标题可尝试页面标题，缺失年份不会从 PDF 创建或修改日期推断。0.2.1 不通过生产 DesktopBridge 后台采集页面；下载工具在当前任务中检查页面并在点击真实下载控件前尝试采集元数据。

用于重命名的文章元数据必须在临时下载开始被观察到之前已采集。最终文件须为不超过 64 MiB、未加密、可解析且具有有效终止 EOF 的 PDF；其 PDF Info 中的 DOI 或规范化后完全相同、长度至少 12 的标题须唯一对应一篇先前记录的文章。标题比较保留字母和数字，排除 Introduction、Bibliography 等通用标题；双方都有 DOI 时必须一致，非空 PDF 标题与文章标题矛盾时也不匹配。同一文章的相容记录可合并补全字段，冲突记录不能合并。缺失或歧义时保留原名，不凭文件名、点击顺序或 PDF 日期猜测。

文件夹按约 500 ms 间隔轮询，文件系统通知可提前触发检查；这些间隔不等于完成证明。首次扫描会排除所有已有文件和已有临时下载的目标。缓存最多 100 条文章元数据，30 分钟未刷新会过期；待处理下载最多 100 条，30 分钟后过期。更改重命名设置或重启会重建文件观察基线，不补处理旧文件；这与代理的待人工处理状态和防循环记录是不同的状态。0.2.1 不改变上述保守重命名算法。详细边界见[使用指南](docs/GUIDE.md)和[兼容性说明](docs/COMPATIBILITY.md)。

## 代理工具与状态

| 工具 | 用途 |
| --- | --- |
| `academic_proxy_status` | 查看工具兼容、自动监控、待人工处理页面和重命名状态；不返回模板值或下载目录绝对路径。 |
| `academic_proxy_open` | 按当前配置在当前任务的现有共享浏览器中打开学术 URL。 |
| `academic_proxy_check` | 检查当前页面是否需要登录或人机验证。 |
| `academic_proxy_download` | 检查并点击页面可见的真实 PDF/下载控件；`inspectOnly: true` 只列候选。 |

工具通过宿主 `ctx.tools.get` 和 `execute` 调用已选择的浏览器工具家族，保留审批、token、agent 和 signal 等调用上下文。优先识别现代 `dsh_browser_*`；现代家族缺项、拒绝或取消时不回退到旧命名，同一次操作不切换家族。祖先作用域已注册但被当前子作用域限制隐藏的现代工具也不能触发旧家族回退；公开 `scopeChainOf` 只读识别注册证据，不绕过当前作用域执行。宿主策略的粒度仍取决于 browser provider：`0.3.1` 的 restrict 为插件级，`0.4.15` 为任务级；插件不会把旧浏览器的隔离能力提升到新版。

多个同优先级候选需要明确选择返回的 `selector`；跨域 iframe 或 PDF 阅读器中的控件需要用原浏览器继续检查。即使已采集元数据，最终点击前也始终复检登录和人机验证；阻断时停止，不额外触碰页面。只有浏览器点击结果明确包含 `clicked: true` 才报告点击成功。工具不猜测或直接请求 PDF URL；点击成功和 `metadataCaptured` 都不等于文件已保存或重命名成功。请核对浏览器下载界面、实际文件和重命名结果，不为获得重命名状态反复触发下载。

| 状态 | 应如何理解 |
| --- | --- |
| `toolCompatibility` | `registered`、`partial` 或 `unavailable` 描述工具注册完整性，并报告 `prefix`、`scope` 和 `providerVerified: false`；注册不等于真实 provider 已验证。 |
| `scope` | 设置页为 `profile`，`academic_proxy_status` 为 `task`；前者不是后者的可用性保证。 |
| `automaticMonitoring` | 与工具注册独立；生产 DesktopBridge 不支持可信的当前任务自动监控，启用并配置后使用 `tools-only`。 |
| `renaming.enabled` / `renaming.ready` / `renaming.mode` | 分别描述命名开关、当前能否处理和观察器模式；即使 mode 为 `ready`，受限时 ready 仍为 `false`，界面显示暂停。不要只看开关或 mode。 |

## 数据与验证

代理模板、所选本地目录、语言和字段偏好保存在当前 profile 的运行时 `plugins/dsh-academic-web-proxy/settings.json`，不写入源码仓库。插件不采集凭证、不导出 Cookie、不发送遥测，也不把 PDF 或元数据上传到云端。近期重命名结果只在内存中保留最多 10 条文件名，不含绝对路径；完整说明见[隐私说明](docs/PRIVACY.md)。

[验证报告](docs/VALIDATION.md)区分离线实现回归、真实 SDK 加浏览器桩和未验证的真实 browser provider。旧版基线实机只在 `example.com` 复现了未知 `browser_execute`；这不构成 0.2.1 实机修复证明。0.2.1 的最终本地矩阵为四组各 264/264 通过；产物证据随发布交接单独提供，不沿用 0.2.0 数字。本轮未做 live 安装、真实账号、论文或下载验收，也未远程发布。[发布指南](docs/RELEASING.md)说明新的 `v0.2.1` / npm 版本及已有市场条目的处理。

本项目使用 MIT 许可证，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。代理模板和依据书目元数据命名的交互参考了 Zotero 的公开文档；这是独立实现，不要求安装 Zotero。来源链接见 [GUIDE](docs/GUIDE.md#public-sources)。
