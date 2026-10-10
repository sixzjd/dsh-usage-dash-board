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
lib/pricing.js       价格表与峰谷判定
locale/{en,zh}.json  插件页显示名（en.json 必须存在，否则 zh.json 不被读取）
test/                node:test 套件，无第三方依赖
```

```bash
npm test     # 全部离线，无需依赖
npm run check
```

## 依赖的公开接缝

| 接缝 | 用途 |
|---|---|
| `ctx.sessionQuery` | 列出会话、读取已解压的事件流 |
| `ctx.storage` (json backend, kv) | 持久化价格表到 `$DSH_HOME/storages` |
| `ctx.webServer` | 注册 `/api/npm-usage/*` |
| `ctx.timer` | 定时对账与实时去抖 |
| `settings.section` slot | 挂载设置页分区 |
| `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal` | 指标详情浮层（缺失时降级为自绘浮层） |

只使用文档化的公开服务，不触碰内部实现，也不直接读 `$DSH_HOME/sessions`。

## 安全边界

- 两个 HTTP 路由都要求**回环地址**：socket 对端与 `Host` 头必须都是 loopback，`Sec-Fetch-Site: cross-site` 直接拒绝，防止 DNS rebinding。
- 写接口（保存价格）额外要求进程令牌，由 `GET /pricing` 下发，跨源页面读不到。
- 响应只含用量数字、模型标识与会话 ID（UUID）。**不包含**提示词、回复正文、会话标题或工作区路径。

## 已知限制

- **成本是估算值**，按内置/手工价格表计算，不等于供应商账单。缓存读写与推理的口径取决于上游是否上报。
- 上游请求被中断时可能只有 `assistant/chunk` 的 usage 而没有最终 `assistant/message`；此时保留 chunk 用量。若上游完全没有任何 usage 事件，则无法从回复内容精确还原 token 数。
- 缺少 `request/header` / `request/context` 的会话，模型标识显示为 `unknown`，不会从供应商标名猜测模型。
- 面板正文目前为中文，仅设置页侧栏标签跟随浏览器语言。
- 统计覆盖宿主列出的**全部**会话，不限于已注册工作区。

## 许可

MIT
