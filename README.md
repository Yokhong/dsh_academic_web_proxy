# DSH Academic Web Proxy

**简体中文** | [English](README.en.md)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 内置浏览器提供学术网站代理规则、机构登录页面交接和真实论文下载按钮操作。

- GitHub 仓库：[Yokhong/dsh_academic_web_proxy](https://github.com/Yokhong/dsh_academic_web_proxy)
- npm 包名：`dsh-academic-web-proxy`（仓库名称使用下划线，npm 包名使用连字符）
- 许可证：[MIT](LICENSE)

本插件为独立实现，参考 Zotero 的代理模板行为。它不包含文献保存、自动文件导入、错误上报、调试日志、翻译器、Google Docs 集成或高级配置功能。

> 自动跳转和原标签展示需要兼容的 DSH Desktop 浏览器桥接。自动跳转采用导航后轮询，不能保证在首次请求之前拦截。其他可用的浏览器后端可通过本插件工具打开代理地址，但不保证自动监测或自动展示。真实机构登录、验证码和最终文件保存需要在部署环境中验收，详见[兼容性说明](docs/COMPATIBILITY.md)。

## 功能

- **独立设置页**：DSH 设置中的“学术网页代理”，支持中英文界面。
- **两个代理模板**：`Login URL Scheme` 和 `Proxied URL Scheme`，首次使用均为空白。编辑停顿约 600 ms 后自动保存，重启后保留。
- **独立域名管理**：内置 47 个默认域名，可整组启停；自定义域名单独保存和启用。修改模板不会重置域名列表。
- **精确域名匹配**：不自动匹配子域名或通配符；国际化域名会规范化。
- **原页面交接**：发现登录或人机验证时保留同一个标签，在兼容桌面布局中尝试展开并确认其可见性。无法确认时返回待处理状态。
- **真实下载操作**：从当前网页查找可见的 PDF/下载控件，通过原浏览器工具点击；候选有歧义时需要选择。
- **配置与会话隔离**：使用当前 DSH profile，包含防循环、页面地址复核和原子配置保存；不注册替代浏览器 provider。

## 运行要求

| 部件 | 要求或适配范围 |
| --- | --- |
| Node.js | 22.19 或以上 |
| DSH | 按 `0.2.0-rc.2` 接口适配；包声明范围为 `>=0.2.0-rc.2 <0.3.0` |
| dsh-builtin-browser | 兼容适配针对 `0.3.1`；自动模式需要已有桥接 |
| DSH Desktop | 桌面标签展示适配针对 `2.0.17` |

安装前确认原浏览器可以正常打开网页。插件不安装浏览器，也不修补 DSH 应用文件。版本范围不表示其中每个版本都已完成实机验证。

## 安装

### 从源码生成安装包

以下为 PowerShell 示例：

```powershell
git clone https://github.com/Yokhong/dsh_academic_web_proxy.git
cd dsh_academic_web_proxy
npm ci --ignore-scripts
npm run check
npm test
New-Item -ItemType Directory -Force dist | Out-Null
npm pack --pack-destination dist
```

执行 CLI 安装前，退出使用目标 profile 的 DSH 窗口。把下面的 `your-profile` 替换成自己的配置名；包文件名随版本变化：

```powershell
dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.1.0.tgz
```

也可通过 DSH 插件管理器安装本地 `.tgz` 包。重启 DSH 后进入 **设置 → 学术网页代理**。直接执行 `npm install` 只安装 npm 依赖；应使用 DSH 插件管理器激活本包的 bundle。

### 使用发布包

如果 [Releases](https://github.com/Yokhong/dsh_academic_web_proxy/releases) 提供 `.tgz` 附件，可下载后按上述方式安装。

GitHub 源码与 npm 注册表分别发布。**只有 npm 注册表存在该包的目标版本后**，才能按包名安装：

```powershell
dsh plugin --profile your-profile add dsh-academic-web-proxy
```

维护者的发布流程见 [RELEASING.md](docs/RELEASING.md)。

## 配置代理模板

使用机构提供的模板。以下为虚构示例，程序不会自动填入：

```text
Login URL Scheme:   https://login.example.edu/login?qurl=%u
Proxied URL Scheme:  %h.proxy.example.edu/%p
```

| 占位符 | 含义 |
| --- | --- |
| `%u` | 用 `encodeURIComponent` 编码完整原始 URL，包括查询参数与片段 |
| `%h` | 原始主机名；HTTPS 地址中的点号替换为连字符，HTTP 地址保留点号 |
| `%p` | 去掉开头 `/` 的路径，加查询参数与片段 |

- 两个模板均为空时不跳转，即使总开关已开启。
- 填写 `Login URL Scheme` 时优先使用登录模板，`Proxied URL Scheme` 用于识别代理地址。
- 只填写 `Proxied URL Scheme` 时直接重写地址；省略协议时沿用原始协议。
- 登录模板需要完整 HTTP(S) 地址和一个 `%u`；代理模板需要主机名中的一个 `%h`、机构固定域名后缀，以及路径中的一个 `%p`。
- 不将 HTTPS 降级为 HTTP，不改写非标准端口地址，也不改写 iframe、图片或 XHR 等子请求。

自定义域名只填写类似 `journals.example.org` 的主机名，不包含协议、端口、路径或通配符。关闭默认域名组后，自定义列表仍生效；例如 `example.org` 不会自动匹配 `www.example.org`。

## 使用方式

安装后可在 DSH 对话中要求：

> 打开这篇论文，使用已配置的机构代理。需要登录时让我在原页面完成，然后点击页面上的 PDF 下载按钮。

| 工具 | 用途 |
| --- | --- |
| `academic_proxy_status` | 查询配置状态、运行模式和待处理登录/验证页 |
| `academic_proxy_open` | 按域名规则打开学术 URL，复用当前任务浏览器 |
| `academic_proxy_check` | 检查当前页面是否需要登录或人机验证，并尝试展示原标签 |
| `academic_proxy_download` | 查找并点击真实下载控件；`inspectOnly: true` 仅列出候选 |

登录和验证码由用户在原浏览器页面完成。隐藏的其他对话、被遮挡的页面或不支持的布局可能返回 `presented: false`，此时需手动选择对应对话并展开浏览器。

`clicked` 表示已点击控件，**不代表文件已保存**。网站可能先打开 PDF 阅读器；跨域 iframe、阅读器或特殊控件需要继续用原浏览器工具定位真实下载按钮，并确认最终文件保存。

## 配置存储与隐私

插件通过宿主 `profileContext` 服务定位当前配置目录，在其下保存：

```text
plugins/dsh-academic-web-proxy/settings.json
```

配置保存启用状态、默认组开关、自定义域名、两个模板和修订信息，不保存登录账号、密码或 Cookie。登录态由原浏览器管理；插件没有后台遥测，也不导出 Cookie。

仓库不包含机构模板、运行配置或会话数据。不要把含凭证的模板或运行配置提交到仓库。同一配置目录应由一个 DSH host 管理。

## 开发与验证

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

项目使用原生 ESM，无需编译。测试使用 Node.js 内置测试器；默认域名测试使用仓库内的公开 fixture，无需额外个人文件。自动化检查覆盖设置保存、代理规则、profile 隔离、页面交接与下载调用；完整范围见 [VALIDATION.md](docs/VALIDATION.md)。

| 路径 | 内容 |
| --- | --- |
| `src/` | 代理规则、存储、浏览器适配和工具 |
| `client.js` | 独立设置页 |
| `test/` | 自动化测试与公开 fixture |
| `scripts/` | 检查与只读诊断脚本 |
| `docs/` | 兼容性、验证和发布说明 |
| `.github/workflows/ci.yml` | Node.js 22/24 与 Windows/Linux 的检查流程 |

CI 配置执行测试与打包，不自动发布 npm 包。实际远程运行结果以仓库的 Actions 页面为准。

## 卸载

通过 DSH 插件管理器移除，或退出对应 profile 后执行：

```powershell
dsh plugin --profile your-profile remove dsh-academic-web-proxy
```

卸载时释放插件自己的定时器、路由和套接字，保留配置便于重新安装。若需要清除配置，删除上文所列的本插件配置文件。

## 反馈与许可

功能请求和一般问题可提交到 [Issues](https://github.com/Yokhong/dsh_academic_web_proxy/issues)。报告时使用虚构或脱敏的 URL，不附带凭证、Cookie 或个人配置。

本项目采用 [MIT License](LICENSE)。第三方归属见 [NOTICE](NOTICE)。本项目与 Zotero、DeepSeek、学术机构或出版商没有隶属或背书关系。
