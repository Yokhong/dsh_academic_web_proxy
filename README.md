# DSH Academic Web Proxy

[English](README.en.md) · [使用指南 / GUIDE](docs/GUIDE.md) · [升级说明](docs/UPGRADING.md) · [隐私说明](docs/PRIVACY.md)

为 DeepSeek Harness 提供独立的学术网站代理设置，在原有共享浏览器中打开机构代理页面，并在需要登录或人机验证时交由用户在原标签页操作。v0.2.0 增加可选的论文 PDF 文件重命名，以及简体中文、繁体中文和美式英语设置界面。

**重命名默认关闭，下载文件夹默认为空。** 开启后只处理明确选择的本地文件夹中符合条件的新 PDF：必须先观察到新出现的 `X.pdf.crdownload` 或 `X.pdf.part`，随后该临时文件消失、同名 `X.pdf` 稳定至少 2 秒，并通过 PDF 完整性和论文元数据匹配检查。这是文件系统轮询启发式，不是浏览器原生下载完成事件，也不保证每篇论文都能重命名。

以下情况保留原文件名：已有文件、未观察到临时文件的快速下载、临时与最终文件名不对应的“另存为”、缺少或歧义元数据、加密或损坏 PDF、超过 64 MiB、子文件夹、符号链接、已有硬链接，以及不支持安全硬链接操作的文件系统。重命名后浏览器下载记录可能仍指向旧名称；请在下载文件夹中确认结果。

## 安装与升级

运行要求：Node.js `>=22.19`、DSH `>=0.2.0-rc.2 <0.3.0`。现有浏览器适配目标仍为 `dsh-builtin-browser` `0.3.x`；原生 `4.1` 下载 API 仅做过接口审阅，未完成接入或实机验证。自动导航检测需要兼容的 DSH Desktop 侧栏桥接。其他可用浏览器后端可使用代理工具，但不保证自动检测、展示原标签或文件重命名。

从含 v0.2.0 的源码树构建安装包：

```sh
git clone https://github.com/Yokhong/dsh_academic_web_proxy.git
cd dsh_academic_web_proxy
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.2.0.tgz
```

将 `your-profile` 替换为目标 DSH profile 名称，并先核对 `package.json` 的版本；公开仓库、npm 与 GitHub Release 的发布是独立步骤，本地构建不代表它们已发布。仅在 npm 确实提供 `0.2.0` 时使用 `dsh plugin --profile your-profile add dsh-academic-web-proxy@0.2.0`。运行时包不包含开发测试脚本，需要重新打包时使用源码树。

从 0.1 升级前备份当前 profile 的插件设置，见[升级说明](docs/UPGRADING.md)。原代理设置继续使用，新增字段填入默认值；新设置写入后，不要在没有备份的情况下直接回退旧版。

## 首次设置

在 DSH Settings 中打开 **Academic Web Proxy**：

1. 选择插件界面语言：简体中文 `zh-CN`（默认）、繁體中文 `zh-TW` 或美式英语 `en-US`。它独立于 DSH 的界面语言，切换立即显示并自动保存。
2. 按机构文档填写 `Login URL Scheme` 或 `Proxied URL Scheme`。两项初始均为空；都为空时不会做代理重定向。
3. 选择默认域名组，按需添加自定义域名。默认组有 47 个主机名；它与自定义列表分别保存，关闭默认组不会清空自定义项。
4. 若需重命名，先让浏览器将文件保存到自己明确选择的本地下载文件夹，在插件中填入该文件夹的**绝对路径**，再开启 PDF 文件重命名。此设置只观察该文件夹，不会修改浏览器下载位置，也不支持网络共享、设备路径或子文件夹递归。
5. 等待设置保存成功、重命名状态就绪，再在共享浏览器中打开论文摘要页并下载。设置约在最后一次修改 600 ms 后保存；保存失败时按界面提示处理。

不要把机构模板、下载目录、登录信息或其他个人配置提交到仓库。

## 代理规则与人工操作

域名采用精确匹配，例如 `example.org` 不自动包含 `www.example.org`。自定义域名只填写主机名，不带协议、端口、路径或通配符。修改模板不会改写默认组和自定义列表。

模板占位符：`%u` 为编码后的完整原始 URL，`%h` 为主机名（HTTPS 主机中的点转换为连字符），`%p` 为路径、查询和片段。以下只是虚构格式示例，不能直接作为机构配置：

```text
Login URL Scheme: https://login.example.edu/login?qurl=%u
Proxied URL Scheme: https://%h.proxy.example.edu/%p
```

配置了登录模板时优先使用它。规则包含已代理页面与重定向循环检查，不做 HTTP 降级，不支持非标准端口或页面子请求代理。Desktop 自动检测发生在导航之后，原站可能已收到首次请求；这不是网络请求拦截器。

遇到登录或 CAPTCHA，保留并尽可能展示**同一个原标签页**，由用户完成操作，再检查页面状态。插件保留 0.1 的提示与人工接管流程，不填写密码、不解答或重试验证码，也不新增自动恢复操作。某些浏览器或布局需要用户手动展开侧栏、选择原标签。

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

元数据来自已打开论文页面的 citation、Dublin Core、PRISM、ScholarlyArticle JSON-LD 等字段；缺失标题可尝试页面标题，缺失年份不会从 PDF 创建或修改日期推断。兼容 Desktop 桥接会在本 profile 已就绪的匹配学术页面采集，下载工具也会在点击真实下载控件前采集。

用于重命名的文章元数据必须在临时下载开始被观察到之前已采集。最终文件须为不超过 64 MiB、未加密、可解析且具有有效终止 EOF 的 PDF；其 PDF Info 中的 DOI 或规范化后完全相同、长度至少 12 的标题须唯一对应一篇先前记录的文章。标题比较保留字母和数字，排除 Introduction、Bibliography 等通用标题；双方都有 DOI 时必须一致，非空 PDF 标题与文章标题矛盾时也不匹配。同一文章的相容记录可合并补全字段，冲突记录不能合并。缺失或歧义时保留原名，不凭文件名、点击顺序或 PDF 日期猜测。

文件夹按约 500 ms 间隔轮询，文件系统通知可提前触发检查；这些间隔不等于完成证明。首次扫描会排除所有已有文件和已有临时下载的目标。缓存最多 100 条文章元数据，30 分钟未刷新会过期；待处理下载最多 100 条，30 分钟后过期。更改重命名设置或重启会重建观察基线，不补处理旧文件。详细边界见[使用指南](docs/GUIDE.md)和[兼容性说明](docs/COMPATIBILITY.md)。

## 代理工具

| 工具 | 用途 |
| --- | --- |
| `academic_proxy_status` | 查看代理、待人工处理页面和重命名状态；不返回模板值或下载目录绝对路径。 |
| `academic_proxy_open` | 按当前配置在现有共享浏览器中打开学术 URL。 |
| `academic_proxy_check` | 检查当前页面是否需要登录或人机验证。 |
| `academic_proxy_download` | 检查并点击页面可见的真实 PDF/下载控件；`inspectOnly: true` 只列候选。 |

多个同优先级候选需要明确选择返回的 `selector`；跨域 iframe 或 PDF 阅读器中的控件需要用原浏览器继续检查。工具不猜测或直接请求 PDF URL。`clicked` 只表示点击成功，`metadataCaptured` 只表示记录了元数据；两者都不等于文件已保存或重命名成功。请核对浏览器下载界面、实际文件和重命名结果，不为获得重命名状态反复触发下载。

## 数据与验证

代理模板、所选本地目录、语言和字段偏好保存在当前 profile 的运行时 `plugins/dsh-academic-web-proxy/settings.json`，不写入源码仓库。插件不采集凭证、不导出 Cookie、不发送遥测，也不把 PDF 或元数据上传到云端。近期重命名结果只在内存中保留最多 10 条文件名，不含绝对路径；完整说明见[隐私说明](docs/PRIVACY.md)。

[验证报告](docs/VALIDATION.md)区分自动化结果与仍需实机完成的 SSO、CAPTCHA、浏览器保存和文件系统检查；CI 配置和接口审阅不代表这些场景已通过。[发布指南](docs/RELEASING.md)说明源码、安装包、npm 与市场条目的关系。市场提交草稿是独立的维护材料，只有公开源码已包含其描述的功能时才能提交。

本项目使用 MIT 许可证，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。代理模板和依据书目元数据命名的交互参考了 Zotero 的公开文档；这是独立实现，不要求安装 Zotero。来源链接见 [GUIDE](docs/GUIDE.md#public-sources)。
