# Zotero PDF Translate（划词翻译）

一个为 **Zotero 10.0.2**（同时兼容 Zotero 7/8/9）开发的翻译插件：在 PDF / EPUB 阅读器里**选中文本**后，划词工具条上会出现一个翻译按钮，**点击后在选区旁弹出悬浮译文卡片**——和浏览器的 Google 翻译插件用法一致。

> 开发环境：Zotero 10.0.2（`C:\Program Files\Zotero`，Build 20260909185038）、Windows、Node.js 26。

---

## 1. 功能

| 功能 | 说明 |
| --- | --- |
| 划词悬浮按钮 | 选中文本 → Zotero 原生划词工具条上出现 `译` 按钮（就在选区旁边） |
| 悬浮译文卡片 | 点击按钮后在选区旁弹出卡片，**就地展开**原文与译文 |
| 可拖动 | 按住卡片标题栏可拖动，避免遮挡原文；关闭后下次重新定位到选区 |
| 一键复制 | 卡片内「复制」按钮把译文写入剪贴板 |
| 存为批注 | 卡片内「存为批注」把译文写进高亮/下划线批注的注释里，颜色可选 |
| 长文本分块 | 超长选区自动按句子边界切分、多次请求后合并 |
| **智能路由** | 自动判断划词是**单词**还是**句子**：单词走 Google 免费接口（查词快），句子走 LLM 接口（上下文更准）；某一类服务不可用时自动回退到另一类 |
| **点击空白处自动关闭** | 点击卡片以外的任何位置——正文页面、划词工具条、批注侧栏、Zotero 窗口的标签页与工具条——卡片立即关闭，`Esc` 和 `×` 同样可用（可在设置中关闭） |
| 结果缓存 | 同一段文本（相同语言/服务）不重复请求，最多 200 条 |
| 自动降级 | 所选服务不可达时自动切换到另一个可用服务，并标注「已自动切换」，5 分钟内跳过失败服务 |
| 多服务支持 | Google 免费接口、MyMemory 免费接口、任意 OpenAI 兼容接口（OpenAI / DeepSeek / 通义 / Kimi / 本地 Ollama…） |
| 中英界面 | 跟随 Zotero 界面语言（zh-CN / en-US） |
| 阅读器通用 | PDF、EPUB、网页快照、阅读模式共用同一套划词机制 |

---

## 2. 安装

### 方式 A：安装打包好的插件（推荐）

1. 运行构建（或直接使用仓库里已生成的产物）：
   ```powershell
   npm run build
   ```
   产物：`dist/zotero-pdf-translate-1.2.0.xpi`
2. 打开 Zotero → **工具 → 插件**（Tools → Plugins）→ 右上角齿轮 → **Install Plugin From File…** → 选择该 `.xpi`。
   （安装包放在哪个目录都行，路径含空格也没问题；但**不要用拖拽**，见下面的排查说明。）
3. 重启 Zotero（Zotero 会自动加载，必要时手动重启一次）。

### 方式 B：开发模式（免打包，改代码即生效）

```powershell
npm run build                  # 生成 build/zotero-pdf-translate-1.2.0/ 未打包目录
```
把 `build/zotero-pdf-translate-1.2.0/` 整个目录复制到 Zotero 配置目录的 `extensions/pdf-translate@thejieee.github.io/`：

- Windows：`%APPDATA%\Zotero\Zotero\Profiles\<随机>.default\extensions\`
- macOS：`~/Library/Application Support/Zotero/Profiles/<随机>.default/extensions/`
- Linux：`~/.zotero/zotero/<随机>.default/extensions/`

然后重启 Zotero → 工具 → 插件，若显示为已禁用就点「启用」再重启一次。卸载时删除该目录即可。

### 安装失败排查

如果提示「无法安装插件“…” 它可能无法与该版本的 Zotero 兼容」，按下面顺序排查（这是 Zotero 对**所有**安装失败统一显示的提示，真正的原因不会显示出来）：

1. **清单必填项**（本项目踩过的坑，已有自动化检查兜底）：Zotero 打过补丁的 `Extension.sys.mjs` 在加载插件时强制要求 `applications.zotero` 中同时存在
   `id`、`update_url`、`strict_max_version` 三个字段，缺任何一个插件都会被判为无效。
   `npm run check` 会校验这三项，并核对 `update_url` 必须指向本仓库 Release 的 `updates.json`。
2. **用齿轮菜单安装，不要拖拽**：工具 → 插件 → 右上角齿轮 → **Install Plugin From File…**。
   直接拖到插件页面走的是内核的拖放安装通道，对这类带 `bootstrap.js` 的插件不保证可用。
3. **换一份打包产物**：`dist/zotero-pdf-translate-1.0.0-alt.xpi`（用 PowerShell 的 `Compress-Archive` 打包）。
4. **挖出真实原因**：Zotero 只显示那句笼统提示，真正的错误要自己取。运行
   `docs/zotero-install-diagnose.js`（**工具 → 开发者 → Run JavaScript** → 勾选 *Run as async* → 粘贴 → 运行），
   它会把 `AddonManager` 的错误码和 `additionalErrors` 明细写入 `.diag/install-result.txt`。

   | 错误码 | 含义 |
   | --- | --- |
   | -3 | 文件损坏 / 清单无法解析（`ERROR_CORRUPT_FILE`；**清单校验失败也会被归到这里**） |
   | -5 | 需要签名（`ERROR_SIGNEDSTATE_REQUIRED`） |
   | -11 | 版本范围不兼容（`ERROR_INCOMPATIBLE`） |
   | -12 | 平台不支持该插件类型（`ERROR_UNSUPPORTED_ADDON_TYPE`） |

   而 `installTemporaryAddon()` 抛出的 `Extension is invalid` 会带 `additionalErrors`，例如
   `Reading manifest: applications.zotero.update_url not provided` —— 这才是真正的原因。

   > 排障记录：曾误判为「安装包路径含空格导致 `jar:` URI 读取失败」。用 A/B 对照（含空格路径 vs `%TEMP%` 无空格路径）验证后，两条路径报的是**完全相同的清单错误**，空格与本次失败无关；真正原因是缺少 `update_url`。

5. **免安装的开发模式**（完全绕开 XPI 安装通道）：
   ```powershell
   $dest = "$env:APPDATA\Zotero\Zotero\Profiles\<你的配置目录>.default\extensions\pdf-translate@thejieee.github.io"
   New-Item -ItemType Directory -Force -Path $dest | Out-Null
   Copy-Item "build\zotero-pdf-translate-1.2.0\*" $dest -Recurse -Force
   ```
   Zotero 默认会自动禁用这类侧载插件（`extensions.autoDisableScopes`），在插件页面点「启用」即可。

---

## 3. 使用

1. 在 Zotero 中打开一篇 PDF。
2. 用鼠标选中一段文字，Zotero 的划词工具条会出现，最右侧多出一个 **`译`** 按钮。
3. 点击 `译`，选区旁弹出译文卡片：
   - **复制**：复制译文；
   - **存为批注**：把译文保存为高亮/下划线批注的注释（方便在批注列表里回看）；
   - **重试**：请求失败时重新翻译；
   - **×**、`Esc` 或**点击卡片外的任何位置**（正文页面、划词工具条、批注侧栏、Zotero 窗口的标签页/工具条）：关闭卡片；
   - 拖动标题栏可移动卡片。
4. 卡片标题栏会显示这次实际用的服务和判定结果，例如
   `Google 翻译（免费接口） · English → 中文（简体） · 单词`，降级时追加「已从 … 自动切换」。

### 单词 / 句子是怎么判定的

| 判定 | 规则 | 走哪个服务 |
| --- | --- | --- |
| 单词 | 不含空格、不含句中/句末标点，且长度不超过 40 字符（纯中文不超过 20 字）；数字、DOI、网址、邮箱、`e.g.` 这类整体算一个词 | Google 免费接口（或你选定的服务） |
| 句子 | 含空格、含标点（中文以 `。！？；…` 结尾的一律算句子），或超长 | 配置的 LLM 接口 |

判定结果只影响「用哪个服务」，不影响语言设置。某个服务不可用（Google 连不上、LLM 没填 Key）时会自动回退到另一类，卡片上会标注「已自动切换」；刚失败的服务 5 分钟内不再优先尝试。不想要这套逻辑就在设置里关掉**智能路由**，所有划词都用你选定的服务（此时若该服务没配好，会明确报错而不是偷偷换服务）。

源语言在「自动检测」下的处理：**短英文单词/短语**（30 字符内的 ASCII 文本）按英语发送，避免 Google 免费接口把它猜成别的语言（例如把 `Transformer` 当荷兰语）；句子、中文/日文/韩文，以及带变音符号或西里尔字母的文本（`Größe`、`Привет мир`）一律用自动检测，不会误标语言。

---

## 4. 设置

**编辑 → 设置 → PDF Translate**（Edit → Settings → PDF Translate）：

- **首选翻译服务**：`Google（免费接口）` / `MyMemory（免费接口）` / `OpenAI 兼容接口`
- **智能路由**：单词用 Google、句子用 LLM（默认开启）；**不可用时自动切换**：某条线路整体失败时回退到另一类服务并标注「已自动切换」，5 分钟内跳过失败的服务
- **源语言 / 目标语言**：默认「自动检测 → 中文（简体）」
- **阅读器悬浮气泡**：是否显示按钮、按钮文字、卡片宽度、是否显示原文、**点击卡片外区域自动关闭**（默认开启）
- **批注**：是否允许存为批注、批注类型（高亮/下划线）、批注颜色
- **各服务参数**（分组始终可见，输入框占满整行，框内灰色示例即推荐填法）：
  - **OpenAI 兼容接口** ← **Base URL / API Key / 模型 / 系统提示词填在这里**
  - **Google（免费接口）**：接口地址
  - **MyMemory（免费接口）**：接口地址与邮箱
- **高级**：请求超时、单次请求最大字符数、调试日志开关、**测试翻译服务**按钮（就地验证当前配置，开启智能路由时会分别测一条句子和一条单词）

---

## 5. ⚠️ 网络环境说明（中国大陆用户必读）

翻译服务都走网络请求，不同网络环境下可用性差别很大。本机实测（中国大陆网络，无代理）：

| 服务 | 需要 Key | 本机实测 | 备注 |
| --- | --- | --- | --- |
| `translate.googleapis.com`（Google 免费接口） | 否 | ❌ 连接超时 | 需要代理/VPN |
| `api.openai.com` | 是 | ❌ 连接超时 | 需要代理/VPN |
| `api.mymemory.translated.net`（MyMemory） | 否 | ✅ 可直连 | 匿名约 5000 字符/天，填邮箱可提高 |
| `api.deepseek.com` 等国内 OpenAI 兼容服务 | 是 | ✅ 可直连 | 国内推荐 |

因此：

- **想开箱即用**：把「翻译服务」改成 **MyMemory**（免费、无需 Key，译文质量一般）。
- **想要高质量译文**：把「翻译服务」改成 **OpenAI 兼容接口**，例如
  - Base URL：`https://api.deepseek.com/v1`，模型：`deepseek-chat`，填自己的 API Key；
  - 或本地 Ollama：Base URL：`http://localhost:11434/v1`，模型：`qwen2.5:7b`，Key 可留空。
- **LLM 接口默认关闭「思考」（思维链）**：翻译不需要推理过程，思考会占用输出额度、拖慢首次出字，还可能吃掉整个请求超时。由于各家字段不通用（OpenAI 官方接口遇到不认识的字段会直接 400），插件按 Base URL 识别服务后只对认得出的服务附加开关：
  - DeepSeek：`thinking: {type: "disabled"}`；阿里云百炼（DashScope）：`enable_thinking: false`；智谱 GLM：`thinking: {type: "disabled"}`；OpenRouter：`reasoning: {enabled: false}`；Ollama 官方端点：`reasoning_effort: "none"`
  - 本机服务（`localhost` / `127.0.0.1`）：vLLM、SGLang、llama.cpp 用 `chat_template_kwargs: {enable_thinking: false}`，Ollama（默认端口 11434）额外发 `reasoning_effort: "none"`
  - 认不出的服务（例如 `api.openai.com`、自建网关）不加任何字段，完全沿用原来的请求体与模型默认行为
- **有代理/VPN**：保持默认的 Google 免费接口即可（质量最好、无需 Key）。
- 默认开启「不可用时自动切换」：Google 超时后自动改用 MyMemory，并在卡片上标注「已从 Google 翻译（免费接口）自动切换」。

---

## 6. 开发

```powershell
npm run build     # 打包 addon/ → build/<未打包目录> + dist/*.xpi（零依赖，仅需 Node）
npm test          # 76 个单元测试（翻译核心、智能路由、单词/句子判定、分块、缓存、降级、批注、错误映射、关闭思考的厂商字段）
npm run check     # 静态一致性检查：语法、偏好项、双语字符串、脚本清单、面板 id、清单必填字段
npm run verify    # 读取 dist/*.xpi + 本机 Zotero 的 omni.ja，逐项核对 18 个 API 集成点
npm run icons     # 重新生成插件图标（48/96 PNG）
```

### 目录结构

```
addon/                        # 插件本体（会被完整打包成 .xpi）
  manifest.json               # 插件清单（id / update_url / 版本区间，三项均为 Zotero 必填）
  bootstrap.js                # Zotero 插件入口，按顺序加载 content/scripts/*
  prefs.js                    # 默认偏好项（extensions.zotero.pdfTranslate.*）
  content/
    preferences.xhtml         # 设置面板（XUL + html: 混排，preference 属性自动绑定）
    preferences.js            # 设置面板逻辑（双语标签、语言下拉、自检按钮）
    icons/                    # 图标
    scripts/
      l10n.js                 # 双语字符串（zh-CN / en-US）
      log.js                  # 调试日志
      prefs.js                # 偏好项读写与默认值
      util.js                 # 文本规范化、分块、URL 拼接、单词/句子判定（纯函数，可单测）
      http.js                 # Zotero.HTTP 封装 + 错误码归一化
      provider-google-free.js # Google 免费接口
      provider-mymemory.js    # MyMemory 免费接口
      provider-openai.js      # OpenAI 兼容接口
      translate.js            # 智能路由、调度、缓存、自动降级
      annotations.js          # 译文写入批注
      reader-ui.js            # 划词按钮 + 悬浮卡片（DOM/CSS 全部自绘；点击卡片外自动关闭，见下方 iframe 说明）
      plugin.js               # 生命周期、设置面板注册、调试接口
docs/zotero-install-diagnose.js  # 安装失败诊断脚本（写入 .diag/install-result.txt）
scripts/                      # 构建与校验脚本（纯 Node，无第三方依赖）
test/                         # node:test 单元测试
```

### 与 Zotero 10.0.2 源码对照的关键实现点

- 划词事件：`Zotero.Reader.registerEventListener('renderTextSelectionPopup', handler, pluginID)`
  - 事件对象：`{ reader, doc, params: { annotation }, append }`（`params.annotation.text` 是选中文本；`append` 把元素插进 Zotero 原生划词工具条）
  - `event.doc` 只是**阅读器文档**（`reader.html`）：PDF 页面由 pdf.js 画在它内部**再嵌套一层**的 iframe 里，而子 iframe 里的事件**即使处于捕获阶段也不会冒泡到父文档**。所以「点击卡片外关闭」必须同时监听阅读器文档、各级 iframe 文档，以及承载阅读器的 Zotero 窗口文档（`reader-ui.js` 的 `pressDocuments`）。Zotero 自己的浮层弹窗（`reader.js` 里的 overlay popup）也是这么逐个 iframe 扫的。
- 存批注：`Zotero.Annotations.saveFromJSON(attachment, json)`，`json` 由 `params.annotation` 派生并补上 `key`（`Zotero.Utilities.generateObjectKey()`）与 `comment`（译文）
- 复制：`Zotero.Utilities.Internal.copyTextToClipboard(text)`
- 网络：`Zotero.HTTP.request`（错误已归一化成 `timeout / network / auth / rateLimit / quota / server / http / parse` 等错误码）
- 设置面板：`Zotero.PreferencePanes.register({ pluginID, src, scripts, label })`，面板内用 `preference="extensions.zotero.pdfTranslate.xxx"` 声明式绑定
- 插件作用域：所有脚本通过 `Services.scriptloader.loadSubScript(url, scope)` 载入同一个 sandbox，共享 `ZPT` 命名空间

### 发布新版本（GitHub Actions 自动发版）

仓库：<https://github.com/TheJieee/zotero-pdf-translate> ｜ Actions：<https://github.com/TheJieee/zotero-pdf-translate/actions>

**打 tag 即自动发版**（`.github/workflows/release.yml`）：

```powershell
# 1) 改版本号：package.json 与 addon/manifest.json 两处都要改（npm run check 会校验一致）
# 2) 本地先自查
npm run check; npm test; npm run verify
# 3) 提交 + 打 tag 推送（tag 必须是 v + 版本号，workflow 会核对）
git add -A; git commit -m "release v1.0.1"; git tag v1.0.1
git -c http.proxy=http://127.0.0.1:7897 push origin main --tags
```

workflow 会自动完成：`npm run check` → `npm test` → `npm run release`（构建 XPI + 生成含 sha256 的 `updates.json`）→ 核对 tag 与构建版本是否一致 → 创建 Release 并上传 `zotero-pdf-translate-<版本>.xpi` 与 `updates.json`。

也可以在 **Actions → Release → Run workflow** 手动触发：

- `dry_run = true`（默认）：只构建并上传构建产物（artifact），不创建 Release
- `dry_run = false` + `tag = v1.0.1-ci-test`：创建一个**预发布**用于验证发布链路，不影响 `releases/latest/download/…`

`.github/workflows/ci.yml` 则在 push 到 main 与 PR 时跑 `check` / `test` / `build`。

两个资源的固定地址（`latest` 永远指向最新正式 Release）：

- 插件包：`https://github.com/TheJieee/zotero-pdf-translate/releases/latest/download/zotero-pdf-translate-<版本>.xpi`
- 更新清单：`https://github.com/TheJieee/zotero-pdf-translate/releases/latest/download/updates.json` ← 这就是 `addon/manifest.json` 里 `update_url` 的值

Zotero 会自动用 `update_url` 检查更新：`updates.json` 里的 `update_link` 指向新的 XPI，`update_hash` 用于校验完整性。

> 不想用 Actions 时的手动发布：`npm run release` 后执行
> `gh release create v1.0.1 dist/*.xpi release/updates.json --title v1.0.1 --notes "变更说明"`

> 本机网络提示：GitHub 直连被阻断，需要走本地代理（示例 `127.0.0.1:7897`）。Git for Windows 不读系统代理，push 时显式指定：
> ```powershell
> git -c http.proxy=http://127.0.0.1:7897 push origin main --tags
> $env:HTTPS_PROXY='http://127.0.0.1:7897'; gh release create ...
> ```
> 另外，**推送包含 `.github/workflows/**` 的改动需要 token 具备 `workflow` 权限**，否则 GitHub 会拒绝推送（`refusing to allow an OAuth App to create or update workflow`）。补权限：`gh auth refresh -h github.com -s workflow`。

### 调试接口

Zotero → **工具 → 开发者 → Run JavaScript**：

```js
Zotero.PDFTranslate.status()                 // 版本、语言、当前服务
Zotero.PDFTranslate.providers()              // 可用服务列表
await Zotero.PDFTranslate.selfTest()         // 依次测试句子路线与单词路线，返回 steps 明细
await Zotero.PDFTranslate.translate('hello') // 直接翻译一段文本，返回 provider / route / kind / detectedLang
await Zotero.PDFTranslate.translate('This is a sentence.')  // 同一接口，路由会自动改走 LLM
Zotero.PDFTranslate.preferences()            // 当前全部偏好项
Zotero.PDFTranslate.clearCache()             // 清空缓存与「服务不健康」标记
```

> 返回的 `route`（`word` / `sentence`）与 `kind` 说明了这次判定走了哪条路线，`fallbackFrom` 说明发生过自动切换——排查「为什么用了 Google / 为什么用了 LLM」时看这两个字段即可。

### 无界面自检

在 `user.js` 或设置里配置：

```
user_pref("extensions.zotero.pdfTranslate.debug", true);
user_pref("extensions.zotero.pdfTranslate.selfTestOnStartup", true);
user_pref("extensions.zotero.pdfTranslate.selfTestFile", "D:/tmp/pdf-translate-selftest.json");
```

启动后该文件会写入插件版本、可用服务、设置面板 id 与自检译文结果，便于确认插件是否加载、翻译链路是否可用。调试输出见 **帮助 → Debug Output Logging**，关键字 `[PDF Translate]`。

---

## 7. 已验证 / 待验证

已在本机完成的验证：

- ✅ `npm test`：76 个单元测试全部通过（含智能路由：单词→Google、句子→LLM、跨类回退、健康度跳过、回退结果缓存、源语言判定、自检双路线、按厂商关闭思考）
- ✅ `npm run check`：脚本语法、26 个偏好项与默认值一致、双语字符串键一致（79 条/语言）、bootstrap 脚本清单、设置面板 74 个 id 引用、**清单必填字段（id / update_url / strict_max_version）且 update_url 指向本仓库 Release 地址**
- ✅ `npm run verify`：打包产物结构正确；对照本机 **Zotero 10.0.2** 的 `omni.ja` 逐项确认 21 个 API 集成点全部存在
- ✅ MyMemory / DeepSeek 等接口在本机网络下真实请求成功（Google / OpenAI 在本机网络不可达，属网络环境问题）
- ✅ 插件已在真实 **Zotero 10.0.2** 中安装并实测可用（划词工具条 `译` 按钮 → 悬浮译文卡片）
- ✅ 发布链路：Release v1.0.0 的 `updates.json` 与 XPI 均可从 `releases/latest/download/…` 下载，XPI 的 sha256 与 `update_hash` 一致，包内 `update_url` 指向该 Release

> v1.1.0：设置面板不再隐藏服务分组——Base URL / API Key 现在始终显示在「OpenAI 兼容接口」分组里（以前只有把「首选服务」切到 OpenAI 才看得见），并把该分组上移到「批注」之后；输入框已占满整行、每个都带灰色示例提示。
> 智能路由与「点击卡片外关闭」为 v1.0.1 新增：路由、判定与降级逻辑已有单元测试覆盖；卡片本身的界面行为（点击卡片外 / `Esc` / `×` / 拖动）需在阅读器里实测一次确认。
> 「点击卡片外关闭」原来只监听了阅读器文档，而 PDF 页面画在它内部嵌套的 pdf.js iframe 里（子 iframe 的事件不会冒泡到父文档），所以点正文关不掉卡片；现改为同时监听阅读器文档、各级 iframe 文档与 Zotero 窗口文档。

后续可以继续打磨的方向：

- 阅读模式（Reading Mode）与 EPUB 下的划词体验逐项实测
- 深色主题下卡片样式的细节
- Zotero 官方目前仍在筹备官方插件目录；社区插件市场（Zotero Addons / zotero-chinese 插件页）已提交索引条目，正式上架官方目录时还需要走签名流程

遇到问题请开 Issue，或把 **帮助 → Debug Output Logging** 里 `[PDF Translate]` 的相关行贴出来。

---

## 8. 已知限制

- Google 免费接口与 OpenAI 官方接口在中国大陆需要代理；MyMemory 匿名额度约 5000 字符/天。
- Google 免费接口是网页端接口，可能限流或变更；失败时插件会提示并支持降级。
- `update_url` 指向本仓库最新 Release 里的 `updates.json`（每次发版都会同时上传），实现 Zotero 内的自动更新。
- 阅读模式（Reading Mode）与 EPUB 同样走 `renderTextSelectionPopup`，理论上可用，但尚未逐一实测。
- 译文卡片为插件自绘 DOM，Zotero 大版本升级后如样式异常，改 `reader-ui.js` 中的 `CSS` 即可。
- 插件 ID 自 v1.2.0 起为 `pdf-translate@thejieee.github.io`（v1.1.0 及更早为占位 ID `zotero-pdf-translate@example.com`）。**改 ID 后旧版本收不到自动更新**，请重新安装一次 xpi。

## 9. 许可

MIT License，见 [LICENSE](LICENSE)。
