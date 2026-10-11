# npm-usage

DeepSeek Harness 的本地用量统计插件：在**设置 → 用量统计**里查看 token 消耗、请求数、缓存命中率与按天趋势。

数据全部来自本机会话日志，不联网、不上传、不需要任何 API Key。

## 背景

DSH 自带每轮对话的 token 明细，但没有跨会话的汇总视图。社区里 cc-switch 这类外部工具能做，代价是要额外装一个桌面应用、并且靠解析日志文件来猜格式。

这个插件解决同一件事，但完全跑在 DSH 内部：宿主已经提供了公开的 `sessionQuery` 服务，会话日志的解压、排序与中断轮次平衡都由它负责，插件只消费结构化的事件。因此没有文件解析、没有格式猜测，也不会因为 DSH 升级改了日志布局而失效。

## 原理

```
durable session log
      │  ctx.sessionQuery.listSessions() / readSession()
      ▼
  事件流（已解压、已排序）
      │  assistant/message.usage  ▸ 覆盖同轮的 assistant/chunk
      │  request/header / request/context  ▸ 模型与供应商标识
      ▼
  按 (session, turn, step) 折叠成"一次调用"
      │  本地日历日分桶
      ▼
  日聚合 / 模型聚合 / 区间汇总 + 价格表计价
      │  GET /api/npm-usage/summary
      ▼
  设置页原生分区（settings.section slot）
```

一次调用只计一份用量：`assistant/message` 上的最终 usage 会**替换**同一 `turn:step` 的流式 `assistant/chunk`，而不是相加；全零的重放事件也不会覆盖已记录的真实数字。

## 指标口径

token 桶遵循宿主 `@deepseek-ai/dsh-llm` 声明的 **DISJOINT** 语义：`inputTokens` 只含未命中缓存的输入，缓存部分单列在 `cacheReadTokens` / `cacheWriteTokens`。

| 指标 | 计算方式 |
|---|---|
| 消耗 token | `输入 + 输出 + 缓存写 + 缓存读` |
| 总请求数 | 携带 usage 的调用次数（按 `session:turn:step` 去重） |
| 缓存命中率 | `缓存读 ÷ (输入 + 缓存写 + 缓存读)` |

> **注意**：OpenAI 式协议不上报 `cacheWriteTokens`，此时该项恒为 0，命中率仍然正确（分母同样不含它）。这不是统计缺失，是上游没有这个字段。

## 功能

| 位置 | 内容 |
|---|---|
| 顶部三张卡 | 消耗 token / 总请求数 / 缓存命中率，点击展开该指标的构成明细 |
| 使用趋势 | 按天柱状图，可切 Tokens / 请求；数值悬浮或键盘聚焦时显示，不常驻 |
| 筛选 | 供应商、模型、时间范围（近 7 / 30 / 90 天、自定义起止） |
| 请求明细 | 逐次调用的时间、供应商、模型、token、费用 |
| 供应商 / 模型 | 分组聚合与占比 |
| 定价 | 可编辑价格表，按 USD / 百万 token 计四桶价格 |

趋势图的 X 轴按**日历日补齐**，没有数据的日期显示为 0 而不是跳过 —— 否则"闲置两周后爆发一天"会被画成"长期低用量带个尖峰"。

## 安装

```bash
dsh plugin --profile web add github:sixzjd/npm-usage
```

包尚未发布到 npm；发布后可改用：

```bash
dsh plugin --profile web add npm-usage
```

安装后刷新浏览器页面即可。插件挂载在设置页的 `settings.section` 插槽，入口为「用量统计」（英文界面下为 Usage Statistics）。

## 卸载

```bash
dsh plugin --profile web remove npm-usage
```

## 内置价格

预置 DeepSeek 官方峰谷价（含中国法定节假日全天按谷价），数据以插件内常量形式随版本发布，来源为官方公告：

| 模型 | 谷时 in / out / 缓存读 | 峰时 in / out / 缓存读 |
|---|---|---|
| `deepseek-v4-flash` | 0.15 / 0.6 / 0.003 | 0.44 / 1.32 / 0.014 |
| `deepseek-v4-pro` | 0.66 / 1.98 / 0.022 | 1.32 / 3.96 / 0.044 |

单位均为 USD / 百万 token。峰时段为 UTC `01:00–04:00` 与 `06:00–10:00`（北京时间 09:00–12:00、14:00–18:00）的周一至周五，法定节假日除外。

**没有公开单价的模型一律标为「未计价」，不会套用任何猜测价格。** 你可以在「定价」里手工补价。

## 开发

```
client.js            浏览器半区（设置页面板）
lib/index.js         宿主半区入口
lib/plugin.js        扫描、聚合调度、持久化与 HTTP 路由
lib/aggregate.js     事件折叠与日/模型分桶
lib/catalog.js       读取路由别名缓存，解析真实模型名（失败即关闭）
lib/pricing.js       价格表与峰谷判定
locale/{en,zh}.json  插件页显示名（en.json 必须存在，否则 zh.json 不被读取）
test/                node:test 套件，无第三方依赖
```

```bash
npm test     # 全部离线，无需依赖
npm run check
```

## 模型显示名

部分供应商用**路由别名**暴露模型，而不是真实模型名。Qoder 就是这样：日志里记的是
`{provider:"qoder", model:"qfmodel"}`，而该路由背后的实际模型是 `Qwen3.8-Flash`。
这个别名会原样回传给上游，**不能**在源头替换掉，真实名字只存在于该插件自己的模型发现缓存里。

面板会读取该缓存，把路由别名显示为真实模型名。

只有**日志里的 modelId 本身就是别名**的模型需要这一步。绝大多数供应商返回的就是真实模型名
（`openai/gpt-oss-120b`、`minimaxai/minimax-m3`、`deepseek-v4-flash-free`……），别名表里查不到，
面板原样显示，也不需要装任何别的插件。没装 qoder 的人不会看到 `qfmodel`，因为他本来就不会有这个
路由键 —— 少解析几个别名，界面上没有任何变化。

匹配是**整串精确匹配**（忽略大小写），不匹配命名空间后的尾段。因为别名缓存里没有 provider 字段，
`vendor/dmodel` 若按尾段命中 Qoder 的 `dmodel`，就会把别家的模型标成 Qoder 的名字 —— 界面上标错
比不标更糟。

**这仅影响显示。** 分组、计数、筛选与计价一律仍按路由 id 进行，所以：

- 贴标签不会把某次调用挪到另一行，也不会改变任何统计数字
- 两个账号的缓存对同一别名给出不同名字时，该别名被**丢弃**（宁可显示路由 id，也不显示错的模型名）
- 缓存缺失、格式变更或不可读时**静默**退回路由 id：界面上不提示，看到的就只是 `qfmodel` 这类路由键。要确认是否生效，查 `GET /api/npm-usage/summary` 响应里的 `catalog.aliasCount`，为 0 即表示没解析到任何别名

## 依赖的接缝

| 接缝 | 用途 |
|---|---|
| `ctx.sessionQuery` | 列出会话、读取已解压的事件流 |
| `ctx.storage` (json backend, kv) | 持久化价格表到 `$DSH_HOME/storages` |
| `ctx.webServer` | 注册 `/api/npm-usage/*` |
| `ctx.timer` | 定时对账与实时去抖 |
| `settings.section` slot | 挂载设置页分区 |
| `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal` | 指标详情浮层（缺失时降级为自绘浮层） |

### 一处公开接缝之外的读取

本插件**不读** `$DSH_HOME/sessions`（会话日志全部经 `ctx.sessionQuery`），
但为了上面的模型显示名，它会读取 `dsh-qoder-connect` 自己的模型发现缓存：

```
$DSH_HOME/profiles/*/.dsh-qoder-connect/state/*-catalog.json
```

这是**另一个插件的私有文件，不是公开契约** —— 路径、JSON 结构与按账号分键的格式都可能随对方版本改变。我明确知道这违背了本仓库先前"只用公开接缝"的表述，此处为修订后的准确说明。取舍是：不读它就只能在界面上永远显示 `qfmodel` 这类无语义的路由键。

因此该读取被写成**失败即关闭**：

- 只接受文件名以 `-catalog.json` 结尾、且结构为 `{version:1, entries:{…models:[…]}}` 的文件；同目录下的 `.qoder-probe.json`、`.qoder-host-heartbeat.json`（含 `pid`）被排除
- 缓存按 `pat:<hash>` 分账号，**只提取 `{id, name}` 两个字段**，账号标识符不进入任何响应（有测试钉住这一点）
- 任何一步失败都退回原路由键，不抛错、不猜测、不影响其余统计
- 若上游改了格式，最坏结果是名字回到路由键，统计数字不受牵连

## 安全边界

- 两个 HTTP 路由都要求**回环地址**：socket 对端与 `Host` 头必须都是 loopback，`Sec-Fetch-Site: cross-site` 直接拒绝，防止 DNS rebinding。
- 写接口（保存价格）额外要求进程令牌，由 `GET /pricing` 下发，跨源页面读不到。
- 响应只含用量数字、模型标识与会话 ID（UUID）。**不包含**提示词、回复正文、会话标题、工作区路径，也不包含上文的账号标识符。
- 唯一的文件读取是上面那处 catalog 缓存；不写入该文件，也不读取同目录其它文件。

## 已知限制

- **成本是估算值**，按内置/手工价格表计算，不等于供应商账单。缓存读写与推理的口径取决于上游是否上报。
- **Qoder 路由按 credits 配额计费，不按 token 计费**（其缓存里每个模型带 `billing.credits` 倍率，例如 `x0.5`）。对这类路由套用 models.dev 的 USD 单价得到的是"等价 API 价"，**不是你实际支付的钱**；本插件因此只做名称解析，不自动为路由别名填价。
- 上游请求被中断时可能只有 `assistant/chunk` 的 usage 而没有最终 `assistant/message`；此时保留 chunk 用量。若上游完全没有任何 usage 事件，则无法从回复内容精确还原 token 数。
- 缺少 `request/header` / `request/context` 的会话，模型标识显示为 `unknown`，不会从供应商标名猜测模型。
- 模型显示名依赖 `dsh-qoder-connect` 的私有缓存格式（见上文），对方变更需跟进适配。
- 面板正文目前为中文，仅设置页侧栏标签跟随浏览器语言。
- 统计覆盖宿主列出的**全部**会话，不限于已注册工作区。

## 许可

MIT
