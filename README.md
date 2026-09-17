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
   产物：`dist/zotero-pdf-translate-1.0.0.xpi`
2. 打开 Zotero → **工具 → 插件**（Tools → Plugins）→ 右上角齿轮 → **Install Plugin From File…** → 选择该 `.xpi`。
   （安装包放在哪个目录都行，路径含空格也没问题；但**不要用拖拽**，见下面的排查说明。）
3. 重启 Zotero（Zotero 会自动加载，必要时手动重启一次）。

### 方式 B：开发模式（免打包，改代码即生效）

```powershell
npm run build                  # 生成 build/zotero-pdf-translate-1.0.0/ 未打包目录
```
把 `build/zotero-pdf-translate-1.0.0/` 整个目录复制到 Zotero 配置目录的 `extensions/zotero-pdf-translate@example.com/`：

- Windows：`%APPDATA%\Zotero\Zotero\Profiles\<随机>.default\extensions\`
- macOS：`~/Library/Application Support/Zotero/Profiles/<随机>.default/extensions/`
- Linux：`~/.zotero/zotero/<随机>.default/extensions/`

然后重启 Zotero → 工具 → 插件，若显示为已禁用就点「启用」再重启一次。卸载时删除该目录即可。

### 安装失败排查

如果提示「无法安装插件“…” 它可能无法与该版本的 Zotero 兼容」，按下面顺序排查（这是 Zotero 对**所有**安装失败统一显示的提示，真正的原因不会显示出来）：

1. **清单必填项**（本项目踩过的坑，已有自动化检查兜底）：Zotero 打过补丁的 `Extension.sys.mjs` 在加载插件时强制要求 `applications.zotero` 中同时存在
   `id`、`update_url`、`strict_max_version` 三个字段，缺任何一个插件都会被判为无效。
   `npm run check` 会校验这三项。`update_url` 当前是占位地址，若要发布插件请替换成你自己的 `updates.json` 地址。
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
   $dest = "$env:APPDATA\Zotero\Zotero\Profiles\<你的配置目录>.default\extensions\zotero-pdf-translate@example.com"
   New-Item -ItemType Directory -Force -Path $dest | Out-Null
   Copy-Item "build\zotero-pdf-translate-1.0.0\*" $dest -Recurse -Force
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
   - **×** 或 `Esc`：关闭卡片；
   - 拖动标题栏可移动卡片。

---

## 4. 设置

**编辑 → 设置 → PDF Translate**（Edit → Settings → PDF Translate）：

- **翻译服务**：`Google（免费接口）` / `MyMemory（免费接口）` / `OpenAI 兼容接口`
- **源语言 / 目标语言**：默认「自动检测 → 中文（简体）」
- **阅读器悬浮气泡**：是否显示按钮、按钮文字、卡片宽度、是否显示原文
- **批注**：是否允许存为批注、批注类型（高亮/下划线）、批注颜色
- **各服务参数**：Google 接口地址；MyMemory 接口地址与邮箱；OpenAI 兼容接口的 Base URL / API Key / 模型 / 系统提示词
- **高级**：请求超时、单次请求最大字符数、调试日志开关、**测试翻译服务**按钮（就地验证当前配置）

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
- **有代理/VPN**：保持默认的 Google 免费接口即可（质量最好、无需 Key）。
- 默认开启「不可用时自动切换」：Google 超时后自动改用 MyMemory，并在卡片上标注「已从 Google 翻译（免费接口）自动切换」。

---

## 6. 开发

```powershell
npm run build     # 打包 addon/ → build/<未打包目录> + dist/*.xpi（零依赖，仅需 Node）
npm test          # 47 个单元测试（翻译核心、分块、缓存、降级、批注、错误映射）
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
      util.js                 # 文本规范化、分块、URL 拼接（纯函数，可单测）
      http.js                 # Zotero.HTTP 封装 + 错误码归一化
      provider-google-free.js # Google 免费接口
      provider-mymemory.js    # MyMemory 免费接口
      provider-openai.js      # OpenAI 兼容接口
      translate.js            # 调度、缓存、自动降级
      annotations.js          # 译文写入批注
      reader-ui.js            # 划词按钮 + 悬浮卡片（DOM/CSS 全部自绘）
      plugin.js               # 生命周期、设置面板注册、调试接口
docs/zotero-install-diagnose.js  # 安装失败诊断脚本（写入 .diag/install-result.txt）
scripts/                      # 构建与校验脚本（纯 Node，无第三方依赖）
test/                         # node:test 单元测试
```

### 与 Zotero 10.0.2 源码对照的关键实现点

- 划词事件：`Zotero.Reader.registerEventListener('renderTextSelectionPopup', handler, pluginID)`
  - 事件对象：`{ reader, doc, params: { annotation }, append }`（`params.annotation.text` 是选中文本；`append` 把元素插进 Zotero 原生划词工具条）
- 存批注：`Zotero.Annotations.saveFromJSON(attachment, json)`，`json` 由 `params.annotation` 派生并补上 `key`（`Zotero.Utilities.generateObjectKey()`）与 `comment`（译文）
- 复制：`Zotero.Utilities.Internal.copyTextToClipboard(text)`
- 网络：`Zotero.HTTP.request`（错误已归一化成 `timeout / network / auth / rateLimit / quota / server / http / parse` 等错误码）
- 设置面板：`Zotero.PreferencePanes.register({ pluginID, src, scripts, label })`，面板内用 `preference="extensions.zotero.pdfTranslate.xxx"` 声明式绑定
- 插件作用域：所有脚本通过 `Services.scriptloader.loadSubScript(url, scope)` 载入同一个 sandbox，共享 `ZPT` 命名空间

### 发布新版本（GitHub Release）

仓库：<https://github.com/TheJieee/zotero-pdf-translate>

```powershell
# 1) 改版本号（package.json 与 addon/manifest.json 两处，check 会校验一致）
# 2) 构建 + 生成更新清单（含 XPI 的 sha256）
npm run release
# 3) 提交并打标签
git add -A; git commit -m "release v1.0.1"; git tag v1.0.1; git push origin main --tags
# 4) 发布 Release 并上传资源（更新清单 + 插件包）
gh release create v1.0.1 dist/zotero-pdf-translate-1.0.1.xpi release/updates.json `
  --title "v1.0.1" --notes "变更说明…"
```

两个资源的固定下载地址（`releases/latest/download/…` 永远指向最新 Release）：

- 插件包：`https://github.com/TheJieee/zotero-pdf-translate/releases/latest/download/zotero-pdf-translate-<版本>.xpi`
- 更新清单：`https://github.com/TheJieee/zotero-pdf-translate/releases/latest/download/updates.json` ← 这就是 `addon/manifest.json` 里 `update_url` 的值

Zotero 会自动用 `update_url` 检查更新：`updates.json` 里的 `update_link` 指向新的 XPI，`update_hash` 用于校验完整性。

> 本机网络提示：GitHub 直连被阻断，需要走本地代理（示例 `127.0.0.1:7897`）。Git for Windows 不读系统代理，push 时显式指定：
> ```powershell
> git -c http.proxy=http://127.0.0.1:7897 push origin main --tags
> $env:HTTPS_PROXY='http://127.0.0.1:7897'; gh release create ...
> ```

### 调试接口

Zotero → **工具 → 开发者 → Run JavaScript**：

```js
Zotero.PDFTranslate.status()                 // 版本、语言、当前服务
Zotero.PDFTranslate.providers()              // 可用服务列表
await Zotero.PDFTranslate.selfTest()         // 测试当前翻译服务，返回译文
await Zotero.PDFTranslate.translate('hello') // 直接翻译一段文本
Zotero.PDFTranslate.preferences()            // 当前全部偏好项
Zotero.PDFTranslate.clearCache()             // 清空缓存与「服务不健康」标记
```

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

- ✅ `npm test`：47 个单元测试全部通过
- ✅ `npm run check`：脚本语法、24 个偏好项与默认值一致、双语字符串键一致（73 条/语言）、bootstrap 脚本清单、设置面板 70 个 id 引用、**清单必填字段（id / update_url / strict_max_version）且 update_url 指向本仓库 Release 地址**
- ✅ `npm run verify`：打包产物结构正确；对照本机 **Zotero 10.0.2** 的 `omni.ja` 逐项确认 18 个 API 集成点全部存在
- ✅ MyMemory / DeepSeek 等接口在本机网络下真实请求成功（Google / OpenAI 在本机网络不可达，属网络环境问题）
- ✅ 插件已在真实 **Zotero 10.0.2** 中安装并实测可用（划词工具条 `译` 按钮 → 悬浮译文卡片）
- ✅ 发布链路：Release v1.0.0 的 `updates.json` 与 XPI 均可从 `releases/latest/download/…` 下载，XPI 的 sha256 与 `update_hash` 一致，包内 `update_url` 指向该 Release

后续可以继续打磨的方向：

- 阅读模式（Reading Mode）与 EPUB 下的划词体验逐项实测
- 深色主题下卡片样式的细节
- 若要上架 Zotero 官方插件仓库，需要换成自己域名的插件 ID 并走 Zotero 的签名流程

遇到问题请开 Issue，或把 **帮助 → Debug Output Logging** 里 `[PDF Translate]` 的相关行贴出来。

---

## 8. 已知限制

- Google 免费接口与 OpenAI 官方接口在中国大陆需要代理；MyMemory 匿名额度约 5000 字符/天。
- Google 免费接口是网页端接口，可能限流或变更；失败时插件会提示并支持降级。
- `update_url` 指向本仓库最新 Release 里的 `updates.json`（每次发版都会同时上传），实现 Zotero 内的自动更新。
- 阅读模式（Reading Mode）与 EPUB 同样走 `renderTextSelectionPopup`，理论上可用，但尚未逐一实测。
- 译文卡片为插件自绘 DOM，Zotero 大版本升级后如样式异常，改 `reader-ui.js` 中的 `CSS` 即可。
- 插件 ID 为 `zotero-pdf-translate@example.com`，如需上架 Zotero 插件仓库请换成自己的域名 ID。

## 9. 许可

AGPL-3.0-or-later（与 Zotero 插件生态一致）。
