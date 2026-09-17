# AGENTS.md

Working notes for agents and contributors editing this repository.
`README.md` is the user-facing document (Chinese); this file is the engineering
one. Keep it in sync when conventions change.

## What this is

A Zotero plugin (id `pdf-translate@thejieee.github.io`) that adds a "译" button
to the reader's text-selection popup and shows a floating translation card.
Pure source, **zero runtime and build dependencies** — Node ≥ 18 is the only
requirement.

## Commands

Run from the repository root:

```powershell
npm test          # unit tests: node test/run.mjs (in-process, no child processes)
npm run check     # static consistency checks — run this before every commit
npm run build     # stage build/<name>-<version>/ and pack dist/<name>-<version>.xpi
npm run verify    # check the .xpi + probe the local Zotero install for the APIs we use
npm run release   # build + generate release/updates.json (sha256)
npm run icons     # regenerate addon/content/icons/*.png (PowerShell + System.Drawing)
```

- `npm run verify` needs a local Zotero install (reads `omni.ja`); it is
  deliberately **not** in CI. Run it locally before a release.
- CI (`.github/workflows/ci.yml`) runs `check` → `test` → `build` on Node 22.
  Releases are cut by pushing a `v*` tag (`.github/workflows/release.yml`).

## Layout

```
addon/                          everything that ships inside the .xpi
  manifest.json                 id / update_url / strict_*  (all three required by Zotero)
  bootstrap.js                  entry point; ZPT_SCRIPTS is the global load order
  prefs.js                      default prefs (extensions.zotero.pdfTranslate.*)
  content/
    preferences.xhtml           settings pane markup (XUL + html: prefix mix)
    preferences.js              settings pane logic (separate sandbox!)
    scripts/*.js                loaded in order from bootstrap.js into one scope
scripts/                        build + check + verify + zip helpers (plain Node ESM)
test/                           node:test suites, imported by test/run.mjs
docs/                           Run-JavaScript snippets for troubleshooting
```

## Hard rules (these are checked, or they will bite you)

1. **Every pref key exists twice.** Add it to `addon/prefs.js` *and* to the
   `DEFAULTS` map in `addon/content/scripts/prefs.js`, or `npm run check` fails.
   Comment style in `addon/prefs.js` is fine, but keep one `pref(...)` per line.
2. **Every localized string exists in both locales.** `l10n.js` has `en-US` and
   `zh-CN` blocks that must define exactly the same ids (`npm run check`).
   `'error.<code>'` strings are required for every code passed to
   `ZPT.util.pluginError()`.
3. **New scripts must be added to `addon/bootstrap.js` `ZPT_SCRIPTS`** (and, if
   they are testable without a DOM, to `SCRIPTS` in
   `test/helpers/load-plugin.mjs`). A file in `content/scripts/` that is not
   listed in `bootstrap.js` fails `npm run check`.
4. **`byId('...')` in `preferences.js` must match an `id` in
   `preferences.xhtml`** — also checked.
4b. **Every pane field needs an input hint and the full-width class.** Each
   `input`/`textarea` in `preferences.xhtml` must carry `placeholder="..."`
   (short, language-neutral example) and `class="zpt-field"`, or `npm run check`
   fails. Long-form guidance belongs in a localized `.zpt-hint` description
   (`prefs.*.hint`), never in a placeholder — a placeholder cannot be
   translated by `l10n.js`.
4c. **Files the pane registration points at are checked.** `plugin.js` builds
   those URIs with `ZPT.rootURI + 'content/...'`; every such path must exist, and
   `content/preferences.css` must actually be passed as
   `PreferencePanes.register({ stylesheets: [...] })`. Add new URIs in that same
   `ZPT.rootURI + '...'` form or the check will not see them.
5. **Version lives in two places**: `package.json` and `addon/manifest.json`
   (checked for equality). When bumping, also update the two hardcoded xpi paths
   in `docs/zotero-install-diagnose.js` (they point at a versioned filename).
   Never use `*` in `strict_min_version`; `update_url` must keep pointing at
   `releases/latest/download/updates.json`.
6. **Plugins scripts are classic scripts, not modules.** No `import`/`export`, no
   top-level `await`. Each file starts with the `var ZPT = ...` guard and hangs
   its API off the shared `ZPT` namespace. Everything is loaded with
   `Services.scriptloader.loadSubScript` into one sandbox, so load order matters:
   `l10n → log → prefs → util → http → providers → translate → annotations →
   reader-ui → plugin`.
7. **`addon/content/preferences.js` runs in its own sandbox** whose prototype is
   the preferences window. Only `l10n.js` and `log.js` are loaded next to it
   (see `plugin.js` `registerPreferencePane`), so it may use `ZPT.l10n`,
   `ZPT.log`, `Zotero` and `document` — and nothing else from `ZPT`.
8. **Keep the code loadable by Zotero 7 through 10.** Plain ES2018 syntax only:
   no optional chaining or nullish coalescing (`?.`, `??`, `??=` — the codebase
   currently uses none and mixes in a few `var` hoisting tricks for that reason),
   no `Array.prototype.at`, no `structuredClone`.

## Translation pipeline (`translate.js`)

The file is the heart of the plugin; read the comments in it before changing
behaviour. Invariants worth preserving:

- **One chain builder.** `providerChain(kind, preferredID)` is the single place
  that decides provider order; `routeFor()` reports the chain head so the card
  meta and the real request can never disagree.
- **`kind` argument**: `'word'`/`'sentence'` = the router picked the family
  order (free endpoints first for words, LLMs first for sentences); `null` = the
  user's own service choice leads (smart routing off).
- **The preferred service always leads its own family and is never dropped.**
  `provider.autoFallback` must never change *which* service answers, only
  whether other services are appended.
- **A family that is not usable yet** (`isConfigured()` false, e.g. no API key)
  does not shadow a usable one — except when the user explicitly picked that
  broken service, which keeps it first so `noApiKey` surfaces instead of a
  silent substitution.
- **Explicit `options.provider`** (used by `Zotero.PDFTranslate.translate(text,
  options)` and `selfTest({ provider })`) leads the chain and disables routing
  for that call. `options.chain` is used verbatim (the self test builds one).
- **Source language** (`sourceLanguageFor`): a *short ASCII token* (≤ 30 chars,
  detected as a word) is sent as `en` because auto-detection is unreliable for
  single words and Google otherwise answers in the wrong language. Everything
  else — sentences, CJK, anything non-ASCII such as `Größe` or `Привет мир` —
  stays `auto`. Never label a language you cannot detect.
- **Health marking**: a provider that fails with a retryable error is marked
  unhealthy for 5 minutes and sinks to the back of the chain — including when it
  is the only member of its family, otherwise every request re-pays its timeout.
  Non-retryable errors (`noApiKey`, `auth`, `parse`, `emptyResult`) abort the
  chain instead of falling back.
- **Cache key** uses the provider that actually answered (not the chain head),
  so a fallback result is found again by the next identical request. Changing
  cache keys without clearing `unhealthy` semantics can break the cool-down
  behaviour tests.
- **Reasoning (thinking) is off by default.** `thinkingDisabledFields()` in
  `provider-openai.js` adds the switch of the service named by the Base URL —
  DeepSeek/GLM `thinking.type`, Model Studio `enable_thinking`, OpenRouter
  `reasoning.enabled`, Ollama `reasoning_effort: "none"` — and adds **nothing**
  for a host it cannot recognize, because `api.openai.com` answers an unknown
  body field with a 400. Local servers get the vLLM/SGLang/llama.cpp
  `chat_template_kwargs`; the Ollama-only `reasoning_effort` is gated on port
  11434 or an `ollama` host/path because vLLM validates that field's values.
  Extend `THINKING_SWITCHES` for a new vendor, never send a switch blind.
- `detectTextKind()` in `util.js` is pure and unit-tested. If you change the
  rules, update the README table ("单词 / 句子是怎么判定的") at the same time.

## Settings pane (`content/preferences.{xhtml,js}`)

- Prefs are bound declaratively with `preference="extensions.zotero.pdfTranslate.<key>"`.
  Numbers are bound manually (`bindNumberFields`), because the declarative
  binding writes strings into int prefs.
- **All service groups are always visible.** An earlier version hid the Google /
  MyMemory / OpenAI groups unless the "preferred service" menu matched that
  provider, which made Base URL / API Key unreachable (`updateProviderVisibility`
  → now `updateProviderHighlight`, which only sets `data-active`). Do not
  reintroduce conditional `hidden` on a settings group: a user cannot configure
  a service whose fields are hidden.
- XUL elements render `value`/`label` attributes, not `textContent` — use the
  `setText` / `setLabel` helpers.
- **Field layout lives in `content/preferences.css`**, registered as
  `stylesheets: [ZPT.rootURI + 'content/preferences.css']`. `<hbox>` lays its
  children out inline and an `html:input` keeps its intrinsic width, so without
  that stylesheet (or with the class missing) the fields look cramped. Zotero
  loads it as a document-level stylesheet of the preferences window, hence every
  selector is prefixed with `#zpt-prefpane`.
- Every field carries a short `placeholder` example plus `class="zpt-field"`;
  longer guidance goes in a localized `<description class="zpt-hint">` fed by
  `prefs.*.hint` strings from `applyStrings()`.

## Tests

- `test/run.mjs` imports every suite **in one process** on purpose: `node --test`
  spawns one child per file and sandboxed environments can deny that (spawn
  EPERM). Add new suites to `test/run.mjs`.
- `test/helpers/load-plugin.mjs` loads the real scripts into a `node:vm` context
  with a fake `Zotero`, so tests exercise shipped code (including `addon/prefs.js`
  defaults, parsed from the real file). Inject HTTP with `installTransport()` or
  `makeTransport()`; never hit the network in tests.
- Pure logic (routing, detection, chunking, providers) must be testable without
  Zotero. Keep `util.js` free of Zotero APIs.
- The reader UI needs a real browser/iframe and has **no** automated coverage —
  verify card behaviour by hand in Zotero (click outside, `Esc`, `×`, drag,
  save-as-annotation). A reasonable mock DOM cannot be trusted for event
  ordering; don't build one and claim coverage.
- The card lives in the reader document (`event.doc` = `reader.html`), but the
  PDF pages are drawn by pdf.js in an iframe *nested inside* it, and a press in a
  child iframe never reaches the parent document — not even in the capture
  phase. "Click outside closes the card" therefore has to listen on the reader
  document, every nested iframe document and the hosting chrome window document
  (`pressDocuments()` in `reader-ui.js`); Zotero's own overlay popups scan the
  same list. Don't "simplify" that back to `event.doc` alone.

## Verifying a change end to end

```powershell
npm run check; npm test; npm run build; npm run verify
```

Then install `dist/zotero-pdf-translate-<version>.xpi` via
**Tools → Plugins → gear → Install Plugin From File…** and use it in a real
reader. Do **not** replace the xpi inside a running Zotero profile directory;
close Zotero first if you copy files into
`%APPDATA%\Zotero\Zotero\Profiles\<id>.default\extensions\`.

Useful debugging entry points (Zotero → Tools → Developer → Run JavaScript):

```js
Zotero.PDFTranslate.status();
await Zotero.PDFTranslate.selfTest();          // steps[] shows each route
await Zotero.PDFTranslate.translate('text');   // returns provider / route / kind
Zotero.PDFTranslate.preferences();
```

Debug logging is opt-in (`extensions.zotero.pdfTranslate.debug = true`) and
prefixed `[PDF Translate]` in **Help → Debug Output Logging**.

## House style

- Tabs for indentation, single quotes, semicolons, `let`/`const` (the files opt
  out of `no-var` only for the shared `ZPT` global).
- User-visible text goes through `ZPT.l10n.t()`; never hardcode a string in the
  UI scripts.
- Errors that reach the user are `ZPT.util.pluginError(code, args)` with a
  message id under `error.<code>`; attach machine-readable extras to the error
  object (e.g. `error.steps`) rather than growing the message.
- Comments explain *why* (Zotero quirks, network behaviour, user-visible
  trade-offs), not *what*. Keep them short and accurate — several existing
  comments document bugs that were found and fixed.
