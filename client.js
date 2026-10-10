window.__ModuleLoader__.load({
  id: "npm-usage",
  factory: (require) => {
    const React = require("react");
    const SUMMARY_PATH = "/api/npm-usage/summary";
    const PRICING_PATH = "/api/npm-usage/pricing";
    const h = React.createElement;
    // Native dialog chrome. The host's Modal portals to <body>, centres in the
    // VIEWPORT, and owns the mask, Escape, the close button and focus return —
    // all of which a hand-rolled overlay inside a tall settings column gets
    // wrong. Required lazily so a surface without the primitives package still
    // renders (the fixed-position fallback below) instead of failing the whole
    // client half.
    let Modal = null;
    try { Modal = require("@deepseek-ai/dsh-client-ui-primitives").Modal ?? null; } catch { Modal = null; }
    const css = `
      .um-root{position:relative;color:var(--dsw-alias-label-primary,#25252a);background:var(--dsw-alias-bg-base,#f7f7f8);font:13px/1.45 var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);padding:24px;max-width:1180px;margin:0 auto}
      .um-root *{box-sizing:border-box}.um-head,.um-row,.um-chart-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.um-head{margin-bottom:20px}.um-title{font-size:22px;font-weight:650;letter-spacing:-.3px}.um-muted,.um-label{color:var(--dsw-alias-label-secondary,#74747c)}.um-muted{margin-top:3px}
.um-cell-sub{display:block;margin-top:2px;color:var(--dsw-alias-label-tertiary,#9a9aa3);font-size:11px;font-weight:400;white-space:normal}.um-actions,.um-segment,.um-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.um-content{position:relative}.um-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end;margin-bottom:16px}.um-filter{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0}.um-filter>.um-label{display:block}.um-validation{margin:-8px 0 16px;color:var(--dsw-alias-state-warn-primary);font-size:12px}.um-button,.um-select,.um-input{height:32px;width:100%;min-width:0;padding:0 10px;color:var(--dsw-alias-label-primary,#25252a);background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l4,#d4d6db);border-radius:var(--dsw-radius-md,8px);font:inherit;font-size:14px;line-height:22px;transition:background .15s,border-color .15s,box-shadow .15s}.um-button{width:auto}.um-select{box-sizing:border-box;height:36px;padding:0 14px;padding-right:38px;border:none;border-radius:var(--dsw-radius-md);background-color:var(--dsw-alias-bg-module-platform,#f5f6f7);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;width:auto;max-width:100%;appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-position:right 14px center;background-repeat:no-repeat;background-size:12px 12px;transition:background-color .15s ease}.um-select:hover{background-color:var(--dsw-alias-interactive-bg-hover,#2631480f)}.um-button:hover,.um-input:hover{background-color:var(--dsw-alias-interactive-bg-hover,#f1f1f3)}.um-button:active{background-color:var(--dsw-alias-interactive-bg-active,#e8e8eb)}.um-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}.um-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.um-button:focus-visible,.um-tab:focus-visible,.um-segment button:focus-visible,.um-card:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.um-button[disabled]{opacity:.55;cursor:wait}
.um-select:disabled{color:var(--dsw-alias-label-tertiary,#9a9aa3);cursor:default}.um-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}.um-card,.um-panel{border:1px solid var(--dsw-alias-border-l2,#dedee3);border-radius:var(--dsw-radius-panel,12px);background:var(--dsw-alias-bg-layer-1,#fff)}.um-card{width:100%;height:83px;min-width:0;display:flex;flex-direction:column;justify-content:center;padding:20px 32px;border:.5px solid var(--dsw-alias-border-l2,#dedee3);border-radius:20px;background:transparent;box-shadow:none;cursor:pointer;text-align:left;color:inherit;font:inherit;transition:background .15s,border-color .15s}.um-card:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f1f3);border-color:var(--dsw-alias-border-l1,#c9c9d0)}.um-card-label{color:var(--dsw-alias-label-secondary,#74747c);font-size:13px}.um-value{font-size:23px;font-weight:650;margin-top:6px;letter-spacing:-.4px;overflow-wrap:anywhere}.um-panel{padding:16px;margin-bottom:16px}.um-chart-head{align-items:center;margin-bottom:12px}.um-panel-title{font-weight:600}.um-segment{padding:3px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-interactive-bg-hover,#f1f1f3);gap:2px}.um-segment button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#74747c);border-radius:var(--dsw-radius-sm,6px);padding:5px 10px;font:inherit;cursor:pointer}.um-segment button:hover,.um-segment button.active{background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,.04))}.um-bars-wrap{position:relative;display:flex;flex-direction:column;gap:6px;min-height:190px}.um-bars{display:flex;flex-direction:column;gap:4px;flex:1;min-height:0}
.um-bars-body{display:flex;align-items:stretch;gap:8px}
.um-bars-axis,.um-bars-x{--um-axis-w:42px}.um-bars-axis{flex:none;width:var(--um-axis-w);height:150px;position:relative;color:var(--dsw-alias-label-tertiary,#9a9aa3);font-size:11px;line-height:1}
.um-bars-axis span{position:absolute;right:0;transform:translateY(-50%);white-space:nowrap}
.um-bars-axis span:nth-child(1){top:0}
.um-bars-axis span:nth-child(2){top:50%}
.um-bars-axis span:nth-child(3){top:100%}.um-bars-plot{position:relative;flex:1;min-width:0;display:flex;align-items:flex-end;gap:var(--um-bar-gap,2px);height:150px;overflow:visible}.um-bars-grid{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}.um-bars-grid span{border-top:1px solid var(--dsw-alias-border-l1,#0000000a);height:0}.um-bars-grid span:last-child{border-top-color:var(--dsw-alias-border-l2,#dedee3)}.um-bar-slot{flex:1 1 0;min-width:0;width:auto;max-width:var(--um-bar-w,16px);height:100%;display:flex;align-items:flex-end;padding:0;border:0;background:transparent;cursor:pointer;position:relative;outline:none}.um-bar{display:block;width:100%;min-height:0;border-radius:3px 3px 0 0;background:var(--dsw-alias-state-business-primary,#4176e6);opacity:.85;transition:opacity .12s ease,filter .12s ease}.um-bar-slot:hover .um-bar,.um-bar-slot.um-on .um-bar{opacity:1;filter:brightness(1.06)}.um-bar-slot:focus-visible .um-bar{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.um-bars-tip{position:absolute;z-index:6;left:50%;bottom:calc(100% - 8px);transform:translate(-50%,0);display:flex;flex-direction:column;gap:5px;padding:9px 12px;min-width:126px;border:1px solid var(--dsw-alias-border-l2,#dedee3);border-radius:var(--dsw-radius-panel,12px);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-prominent);pointer-events:none;white-space:nowrap}
.um-bars-tip.um-tip-start{left:0;transform:none}
.um-bars-tip.um-tip-end{left:auto;right:0;transform:none}.um-bars-tip-date{display:block;color:var(--dsw-alias-label-primary,#25252a);font-size:13px;font-weight:650}.um-bars-tip-row{display:flex;align-items:center;gap:8px;font-size:12px;width:100%}.um-bars-tip-dot{width:8px;height:8px;border-radius:2px;flex:none;background:var(--dsw-alias-state-business-primary,#4176e6)}.um-bars-tip-label{color:var(--dsw-alias-label-secondary,#74747c)}.um-bars-tip-value{margin-left:auto;color:var(--dsw-alias-label-primary,#25252a);font-weight:600;font-variant-numeric:tabular-nums}.um-bars-x{display:flex;gap:var(--um-bar-gap,2px);padding-top:2px;padding-left:calc(var(--um-axis-w) + 8px)}.um-bars-x-tick{flex:1 1 0;min-width:0;max-width:var(--um-bar-w,16px);text-align:center;color:var(--dsw-alias-label-secondary,#74747c);font-size:11px;white-space:nowrap;overflow:visible}
.um-bars-x-tick.um-x-first{text-align:left}
.um-bars-x-tick.um-x-last{text-align:right}.um-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}.um-tabs{gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2,#dedee3);margin:-4px -16px 14px;padding:0 12px}.um-tab{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#74747c);padding:10px 12px;min-height:40px;font:inherit;cursor:pointer}.um-tab:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f1f3)}.um-tab.active{border-bottom-color:currentColor;color:inherit;font-weight:600}.um-table{width:100%;border-collapse:collapse}.um-table th{padding:0 8px 9px;color:var(--dsw-alias-label-secondary,#74747c);font-size:11px;text-align:left;font-weight:500}.um-table td{padding:10px 8px;border-top:1px solid var(--dsw-alias-border-l2,#dedee3);white-space:nowrap}.um-empty,.um-error,.um-loading{padding:28px 12px;text-align:center;color:var(--dsw-alias-label-secondary,#74747c)}.um-error{color:var(--dsw-alias-state-error-primary,#bd4747)}.um-price-grid{display:grid;grid-template-columns:1.5fr repeat(4,1fr);gap:8px;align-items:center}.um-price-grid input{width:100%}.um-scan{font-size:12px;color:var(--dsw-alias-label-secondary,#74747c)}.um-detail-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-2,color-mix(in srgb,#000 45%,transparent))}.um-detail{width:min(520px,100%);padding:24px;background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l2,#dedee3);border-radius:20px;box-shadow:none}.um-detail-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}.um-detail-title{font-size:18px;font-weight:650}.um-detail-value{font-size:28px;font-weight:650;line-height:1.15;letter-spacing:-.5px;margin-top:6px;overflow-wrap:anywhere}.um-detail-close{border:0;background:transparent;color:inherit;font-size:22px;line-height:1;padding:4px;cursor:pointer}.um-detail-list{display:grid;gap:12px;margin:0}.um-detail-row{display:flex;justify-content:space-between;gap:16px;padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l2,#dedee3)}.um-detail-row:last-child{border-bottom:0;padding-bottom:0}.um-detail-row dt{color:var(--dsw-alias-label-secondary,#74747c)}.um-detail-row dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}
      @media(max-width:760px){.um-root{padding:16px}.um-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.um-card{padding:18px 24px}.um-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.um-head,.um-chart-head{display:block}.um-actions{margin-top:12px}.um-price-grid{grid-template-columns:1fr 1fr}.um-price-grid .um-price-label{grid-column:1/-1}.um-table{font-size:12px;display:block;overflow:auto}}
      @media(max-width:480px){.um-metrics{grid-template-columns:1fr}.um-card{padding:18px 20px}.um-filters{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.um-root *{transition:none!important}}
    `;
    const finite = (value) => { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; };
    const cacheableTotal = (value) => { const parts = ["input", "cacheWrite", "cacheRead"].map((key) => finite(value?.[key])); return parts.some((part) => part !== null) ? parts.reduce((sum, part) => sum + (part ?? 0), 0) : null; };
    const compactNum = (value) => { const number = finite(value); if (number === null) return "—"; const abs = Math.abs(number); if (abs < 10000) return num(number); const divisor = abs >= 100000000 ? 100000000 : 10000; const suffix = divisor === 100000000 ? "亿" : "万"; return `${(number / divisor).toFixed(2).replace(/\.?0+$/, "")}${suffix}`; };
    const num = (value) => { const number = finite(value); return number === null ? "—" : Math.round(number).toLocaleString("zh-CN"); };
    const money = (value) => { const number = finite(value); return number === null ? "—" : `$${number.toFixed(4)}`; };
    const scopeText = (scope) => {
      const start = typeof scope?.start === "string" && scope.start.trim() ? scope.start : "—";
      const end = typeof scope?.end === "string" && scope.end.trim() ? scope.end : "—";
      return `${start} 至 ${end}`;
    };
    const tokens = (row) => ["input", "output", "cacheRead", "cacheWrite"].reduce((sum, key) => sum + (finite(row?.tokens?.[key]) ?? 0), 0);
    const metricValue = (row, metric) => metric === "requests" ? (finite(row?.calls) ?? 0) : tokens(row);
    const metricLabel = (metric) => metric === "requests" ? "请求" : "Tokens";
    const displayCost = (cost) => (finite(cost?.unpriced) ?? 0) > 0 ? "未完整计价" : money(cost?.total);
    const metricText = (row, metric) => num(metricValue(row, metric));
    /** The host already labelled the row when a route id resolved; never re-derive it. */
    const modelLabel = (row) => (row && (row.displayName || row.modelId)) || "unknown";
    const percentage = (value) => { const number = finite(value); return number === null ? "—" : `${(number * 100).toFixed(1).replace(/\.0$/, "")}%`; };
    // `labels` maps an option value to the text shown for it. The model filter
    // needs this split: it displays the resolved model name while the query
    // still carries the route id, which is what the backend groups and
    // filters on. Showing a name the server cannot match would silently
    // return nothing.
    const selectOptions = (label, values, current, onChange, labels) => h("div", { className: "um-filter" }, h("span", { className: "um-label" }, label), h("select", { className: "um-select", value: current, onChange: (e) => onChange(e.target.value), "aria-label": label }, h("option", { value: "" }, `全部${label}`), ...values.map((v) => h("option", { key: v, value: v }, (labels && labels[v]) || v))));
    /** Parse YYYY-MM-DD as a local calendar instant, or null. */
    const finiteDate = (value) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
      const [y, m, d] = value.split("-").map(Number)
      const at = new Date(y, m - 1, d)
      return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d ? at.getTime() : null
    }

    const isoDay = (atMs) => {
      const at = new Date(atMs)
      return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`
    }

    /**
     * Round a maximum up to a readable axis ceiling (1 / 2 / 2.5 / 5 x 10^n),
     * so the scale reads "5000万 / 2500万 / 0" instead of "4938.58万 / 2469.29万".
     */
    const niceMax = (value) => {
      const number = finite(value) ?? 0
      if (number <= 0) return 0
      const magnitude = 10 ** Math.floor(Math.log10(number))
      const unit = number / magnitude
      const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
      return step * magnitude
    }

    /**
     * Axis label. compactNum rounds to an integer below 10,000, which would put
     * "3" on a gridline that sits at 2.5, so small fractions keep one decimal.
     */
    const axisLabel = (value) => {
      const number = finite(value) ?? 0
      if (number === 0) return "0"
      if (Number.isInteger(number) || number >= 10000) return compactNum(number)
      return String(Math.round(number * 10) / 10)
    }

    /** 09/12 — compact axis label. */
    const monthDay = (date) => { const parts = String(date).split("-"); return parts.length === 3 ? `${parts[1]}/${parts[2]}` : date }

    /**
     * Indices that carry an axis label. Every Nth slot so a 30/90-day range stays
     * legible instead of printing every date, with the final day always labelled.
     */
    const tickIndexes = (length, barWidth = 16, barGap = 2) => {
      if (length === 0) return new Set()
      // Labels are ~34px wide ("2026-09-11" renders as MM/DD), so the cadence
      // must be derived from the slot PITCH, not from a fixed day count: a
      // 2-day step looked fine at 90 days and collided at 14.
      // Baseline cadence in days, matching what the panel looked like before:
      // sparse enough to read, dense enough to orient. Only widened when the
      // actual slot pitch would put two ~34px labels on a collision course —
      // which happens on short ranges, where slots are at their widest.
      const base = length <= 14 ? 2 : length <= 45 ? 7 : 14
      const pitch = Math.max(1, barWidth + barGap)
      const every = Math.max(base, Math.ceil(44 / pitch))
      const ticks = []
      for (let i = 0; i < length; i += every) ticks.push(i)
      // The final day is always labelled, but as a REPLACEMENT rather than an
      // addition: appending it unconditionally put 10/09 and 10/10 side by side
      // whenever the regular cadence already landed next to the end.
      const last = length - 1
      if (ticks[ticks.length - 1] === last) return new Set(ticks)
      if (last - ticks[ticks.length - 1] < every) ticks.pop()
      if (ticks.length === 0 || last - ticks[ticks.length - 1] >= every) ticks.push(last)
      else ticks[ticks.length - 1] = last
      return new Set(ticks)
    }
    /**
     * Daily bar chart.
     *
     * Bars, not a line: the series counts discrete per-day totals, and a line
     * implies a value between two days that does not exist.
     *
     * The axis is filled with every calendar day in the scope, not just the days
     * that happen to have usage. A sparse history used to render three bars spread
     * across thirty slots, which read as "steady low usage with a spike" instead of
     * "idle, then two active days".
     *
     * Values appear on hover/focus only, so the plot stays readable at 90 days.
     */
    function Chart({ days, metric, scope }) {
      // null = nothing hovered; a number = that bar's index. Clicking a bar
      // pins its tip so keyboard and touch users can read it without hovering.
      const [hover, setHover] = React.useState(null);
      const series = React.useMemo(() => {
        const byDate = new Map((Array.isArray(days) ? days : []).map((row) => [row.date, row]))
        const filled = []
        const from = finiteDate(scope?.start), to = finiteDate(scope?.end)
        // Guard against a pathological range: fall back to the data's own span.
        if (from !== null && to !== null && to >= from && (to - from) / 86400000 + 1 <= 400) {
          for (let t = from; t <= to; t += 86400000) {
            const date = isoDay(t)
            filled.push({ date, row: byDate.get(date) ?? null })
          }
        } else {
          for (const row of Array.isArray(days) ? days : []) filled.push({ date: row.date, row })
        }
        return filled
      }, [days, scope?.start, scope?.end])
      const values = series.map((point) => (point.row ? metricValue(point.row, metric) : 0))
      // Bars scale against the rounded ceiling, so a bar top always lines up
      // with a gridline rather than ending just below it.
      const max = niceMax(Math.max(...values, 0))
      const barWidth = series.length > 60 ? 6 : series.length > 30 ? 10 : 16
      const barGap = series.length > 120 ? 1 : 2
      const tickSet = React.useMemo(() => tickIndexes(series.length, barWidth, barGap), [series.length, barWidth, barGap])
      const tickList = [...tickSet].sort((a, b) => a - b)
      const firstTick = tickList[0] ?? -1
      const lastTick = tickList[tickList.length - 1] ?? -1
      return h("div", {
        className: "um-bars-wrap",
        onMouseLeave: () => setHover(null),
      }, series.length ? h("div", { className: "um-bars", style: { "--um-bar-gap": barGap + "px" } },
        h("div", { className: "um-bars-body" },
        h("div", { className: "um-bars-axis", "aria-hidden": "true" },
          h("span", null, axisLabel(max)), h("span", null, axisLabel(max / 2)), h("span", null, "0")),
          // 三档刻度与 .um-bars-grid 的三条线一一对应
        h("div", { className: "um-bars-plot", style: { "--um-bar-w": barWidth + "px" } },
          h("div", { className: "um-bars-grid", "aria-hidden": "true" }, [0, 1, 2].map((n) => h("span", { key: n }))),
          series.map((point, index) => {
            const value = values[index]
            const ratio = max > 0 ? value / max : 0
            // A non-zero day keeps a visible stub so it never disappears entirely.
            const height = value > 0 ? Math.max(Math.round(ratio * 10000) / 100, 2) : 0
            const on = hover === index
            // Edge bars would push a centred tip out of the panel, so the
            // first and last few anchor to the inner side instead.
            const align = index < 2 ? " um-tip-start" : index > series.length - 3 ? " um-tip-end" : ""
            return h("button", {
              key: point.date,
              type: "button",
              className: "um-bar-slot" + (on ? " um-on" : ""),
              "data-index": index,
              "aria-label": `${point.date}：${num(value)} ${metricLabel(metric)}`,
              onMouseEnter: () => setHover(index),
              onFocus: () => setHover(index),
              onBlur: (event) => {
                const next = event.relatedTarget
                if (next instanceof HTMLElement && !next.classList.contains("um-bar-slot")) setHover(null)
              },
              onClick: () => setHover(on ? null : index),
            }, h("span", { className: "um-bar", style: { height: height + "%" } }),
              on ? h("span", { className: "um-bars-tip" + align, role: "status" },
                h("span", { className: "um-bars-tip-date" }, point.date),
                h("span", { className: "um-bars-tip-row" },
                  h("span", { className: "um-bars-tip-dot" }),
                  h("span", { className: "um-bars-tip-label" }, metricLabel(metric)),
                  h("span", { className: "um-bars-tip-value" }, num(value)))) : null)
          })),
        ),
        h("div", { className: "um-bars-x", "aria-hidden": "true", style: { "--um-bar-w": barWidth + "px" } },
          series.map((point, index) => {
            if (!tickSet.has(index)) return h("span", { key: point.date, className: "um-bars-x-tick" })
            // Edge labels align to the inner side so a ~34px label cannot hang
            // past the panel on either end (the old 10/10 was clipped).
            const edge = index === firstTick ? " um-x-first" : index === lastTick ? " um-x-last" : ""
            return h("span", { key: point.date, className: "um-bars-x-tick" + edge }, monthDay(point.date))
          })),
        h("span", { className: "um-sr" }, metricLabel(metric) + "按日趋势，悬浮或聚焦柱子查看每日数值")) : h("div", { className: "um-empty" }, "当前区间暂无数据"))
    }

    function PricingEditor({ prices, setPrices, saving, onSave }) {
      const fields = [["input", "输入 USD/M"], ["output", "输出 USD/M"], ["cacheRead", "缓存读 USD/M"], ["cacheWrite", "缓存写 USD/M"]];
      return h("div", null, prices.length ? h("div", { className: "um-price-grid" }, h("strong", null, "模型"), ...fields.map(([, label]) => h("span", { key: label, className: "um-label" }, label)), ...prices.map((price, index) => h(React.Fragment, { key: `${price.modelId}-${index}` }, h("span", { className: "um-price-label" }, price.label || price.modelId || "未知模型"), ...fields.map(([field, label]) => h("input", { key: field, className: "um-input", type: "number", min: "0", step: "any", "aria-label": `${price.modelId} ${label}`, value: price.offPeak?.[field] ?? "", onChange: (e) => setPrices(prices.map((item, i) => i === index ? { ...item, offPeak: { ...(item.offPeak || {}), [field]: e.target.value } } : item)) }))))) : h("div", { className: "um-empty" }, "暂无可编辑的模型价格"), h("div", { className: "um-row", style: { marginTop: 14, alignItems: "center" } }, h("span", { className: "um-muted" }, "价格按 USD / 百万 tokens 计算"), h("button", { className: "um-button", type: "button", onClick: onSave, disabled: saving }, saving ? "保存中…" : "保存价格")));
    }
    function Detail({ kind, totals, scope, onClose }) {
      const values = kind === "tokens" ? [["输入 tokens", num(totals.tokens?.input)], ["输出 tokens", num(totals.tokens?.output)], ["缓存读取", num(totals.tokens?.cacheRead)], ["缓存写入", num(totals.tokens?.cacheWrite)]] : kind === "requests" ? [["会话数", num(totals.sessions)], ["时间范围", scopeText(scope)]] : [["缓存读取", num(totals.tokens?.cacheRead)], ["可缓存 tokens", num(cacheableTotal(totals.tokens))], ["时间范围", scopeText(scope)]];
      const title = kind === "tokens" ? "消耗token" : kind === "requests" ? "总请求数" : "缓存命中率";
      const headline = kind === "tokens" ? num(totals.realTokens) : kind === "requests" ? num(totals.calls) : percentage(totals.hitRate);
      const body = h(React.Fragment, null,
        h("div", { className: "um-detail-head" }, h("div", null,
          h("div", { className: "um-detail-title" }, title),
          h("div", { className: "um-detail-value" }, headline))),
        h("dl", { className: "um-detail-list" }, values.map(([label, value]) => h("div", { className: "um-detail-row", key: label }, h("dt", null, label), h("dd", null, value)))));
      // Native path: the host owns the mask, centring, Escape and focus return.
      if (Modal !== null) return h(Modal, { open: true, onClose, title, closeLabel: "关闭详情" }, body);
      // Fallback: viewport-fixed (NOT absolute inside the tall content column,
      // which is what buried the card out of view), mask click closes it. The
      // host Modal already renders its own close button, so only this branch
      // needs one.
      return h("div", { className: "um-detail-backdrop", role: "presentation", onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h("div", { className: "um-detail", role: "dialog", "aria-modal": "true", "aria-label": title },
          h("button", { className: "um-detail-close", type: "button", onClick: onClose, "aria-label": "关闭详情" }, "×"),
          body));
    }
    function UsageMeterSection() {
      const [state, setState] = React.useState({ loading: true, saving: false, error: null, data: null, prices: [], priceToken: null });
      const [filters, setFilters] = React.useState({ days: "30", start: "", end: "", provider: "", model: "" });
      const [metric, setMetric] = React.useState("tokens"), [tab, setTab] = React.useState("requests"), [detailKind, setDetailKind] = React.useState(null);
      const requestSequence = React.useRef(0), abortRef = React.useRef(null);
      const customDateIncomplete = filters.days === "" && (!filters.start || !filters.end);
      const dateValidation = customDateIncomplete ? "请选择开始和结束日期后再加载。" : "";
      const query = React.useMemo(() => { const p = new URLSearchParams(); if (filters.start) p.set("start", filters.start); if (filters.end) p.set("end", filters.end); if (filters.days) p.set("days", filters.days); if (filters.provider) p.set("provider", filters.provider); if (filters.model) p.set("model", filters.model); return p.toString(); }, [filters]);
      const load = React.useCallback(async (withPricing) => { if (filters.days === "" && (!filters.start || !filters.end)) return; const sequence = ++requestSequence.current; abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller; setState((s) => ({ ...s, loading: true, error: null })); try { const response = await fetch(`${SUMMARY_PATH}?${query}`, { headers: { accept: "application/json" }, signal: controller.signal }); if (!response.ok) throw new Error("用量统计暂不可用"); const summary = await response.json(); if (summary?.ok !== true) throw new Error("用量统计返回了无效数据"); let prices = state.prices, priceToken = state.priceToken; if (withPricing || !priceToken) { const pricingResponse = await fetch(PRICING_PATH, { headers: { accept: "application/json" }, signal: controller.signal }); if (!pricingResponse.ok) throw new Error("价格配置暂不可用"); const pricing = await pricingResponse.json(); if (pricing?.ok !== true) throw new Error("价格配置返回了无效数据"); const configured = Array.isArray(pricing.prices) ? pricing.prices : [], known = new Set(configured.map((price) => price.modelId)), detected = Array.isArray(pricing.models) ? pricing.models : []; prices = configured.concat(detected.filter((model) => !known.has(model.modelId)).map((model) => ({ modelId: model.modelId, label: model.displayName || model.modelId, provider: model.provider, offPeak: {} }))); priceToken = pricing.token; } if (sequence !== requestSequence.current) return; setState((s) => ({ ...s, loading: false, error: null, data: summary, prices, priceToken })); } catch (error) { if (error?.name === "AbortError" || sequence !== requestSequence.current) return; setState((s) => ({ ...s, loading: false, error: error instanceof Error ? error.message : "加载失败" })); } }, [filters.days, filters.start, filters.end, query, state.prices, state.priceToken]);
      React.useEffect(() => { if (customDateIncomplete) { abortRef.current?.abort(); setState((s) => ({ ...s, loading: false })); return; } void load(!state.priceToken); }, [query, customDateIncomplete]);
      React.useEffect(() => { if (!detailKind || Modal !== null) return undefined; const onKeyDown = (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); setDetailKind(null); } }; document.addEventListener("keydown", onKeyDown, true); return () => document.removeEventListener("keydown", onKeyDown, true); }, [detailKind]);
      const data = state.data, totals = data?.totals || {}, providers = [...new Set((data?.providers || []).map((x) => x.provider || "unknown").concat(filters.provider || []))], models = [...new Set((data?.models || []).map((x) => x.modelId || "unknown").concat(filters.model || []))];
      // Route id -> shown name. The option VALUE stays the route id because
      // that is what the backend filters and groups on.
      const modelLabels = Object.fromEntries((data?.models || [])
        .filter((x) => x.displayName && x.modelId)
        .map((x) => [x.modelId, x.displayName]))
      const savePrices = async () => { setState((s) => ({ ...s, saving: true, error: null })); try { const response = await fetch(PRICING_PATH, { method: "POST", headers: { "content-type": "application/json", "x-npm-usage-token": state.priceToken }, body: JSON.stringify({ prices: state.prices }) }); if (!response.ok) throw new Error("价格配置保存失败"); await load(true); setState((s) => ({ ...s, saving: false })); } catch (error) { setState((s) => ({ ...s, saving: false, error: error instanceof Error ? error.message : "保存失败" })); } };
      const update = (key, value) => setFilters((f) => ({ ...f, [key]: value })), rows = tab === "providers" ? data?.providers : tab === "models" ? data?.models : data?.requests;
      const table = tab === "requests" ? h("table", { className: "um-table" }, h("thead", null, h("tr", null, h("th", null, "时间"), h("th", null, "供应商"), h("th", null, "模型"), h("th", null, "Tokens"), h("th", null, "费用"))), h("tbody", null, ...(rows || []).slice(0, 100).map((r, i) => h("tr", { key: r.id || i }, h("td", null, r.time ? new Date(r.time).toLocaleString() : r.date || "—"), h("td", null, r.provider || "unknown"), h("td", { title: r.displayName ? String(r.modelId) : undefined }, modelLabel(r)), h("td", null, num(tokens(r))), h("td", null, displayCost(r.cost)))))) : h("table", { className: "um-table" }, h("thead", null, h("tr", null, h("th", null, tab === "providers" ? "供应商" : "模型"), h("th", null, "请求"), h("th", null, "Tokens"), h("th", null, "费用"))), h("tbody", null, ...(rows || []).map((r, i) => h("tr", { key: `${r.modelId || r.provider || i}` }, h("td", { title: r.displayName ? String(r.modelId) : undefined }, tab === "models"
            // Same model over two routes is two deliberate rows; name them
            // apart so the pair does not read as a duplicated entry.
            ? h(React.Fragment, null, modelLabel(r), r.provider ? h("span", { className: "um-cell-sub" }, r.provider) : null)
            : (r.provider || "unknown")), h("td", null, num(r.calls)), h("td", null, num(r.realTokens ?? tokens(r))), h("td", null, displayCost(r.cost))))));
      const card = (kind, label, value) => h("button", { className: "um-card", type: "button", onClick: () => setDetailKind(kind), "aria-label": `${label}，查看详情` }, h("span", { className: "um-card-label" }, label), h("span", { className: "um-value" }, value));
      return h("div", { className: "um-root" }, h("style", null, css), h("header", { className: "um-head" }, h("div", null, h("div", { className: "um-title" }, "用量统计"), h("div", { className: "um-muted" }, data?.scope ? `${data.scope.start} 至 ${data.scope.end}` : "模型使用、缓存效率与成本概览"), data?.scan?.done === false ? h("div", { className: "um-scan" }, `正在扫描历史会话 ${data.scan.loaded || 0}/${data.scan.total || 0}`) : null), h("div", { className: "um-actions" }, h("button", { className: "um-button", type: "button", onClick: () => void load(false), disabled: state.loading || customDateIncomplete }, state.loading ? "刷新中…" : "刷新"))),
        h("div", { className: "um-content" },
          h("div", { className: "um-filters" }, selectOptions("供应商", providers, filters.provider, (v) => setFilters((f) => ({ ...f, provider: v, model: "" }))), selectOptions("模型", models, filters.model, (v) => update("model", v), modelLabels), h("div", { className: "um-filter" }, h("span", { className: "um-label" }, "时间范围"), h("select", { className: "um-select", value: filters.days === "" ? "custom" : filters.days, onChange: (e) => setFilters((f) => ({ ...f, days: e.target.value === "custom" ? "" : e.target.value, start: e.target.value === "custom" ? f.start : "", end: e.target.value === "custom" ? f.end : "" })) }, h("option", { value: "7" }, "近 7 天"), h("option", { value: "30" }, "近 30 天"), h("option", { value: "90" }, "近 90 天"), h("option", { value: "custom" }, "自定义区间"))), filters.days === "" ? h("div", { className: "um-filter" }, h("span", { className: "um-label" }, "开始"), h("input", { className: "um-input", type: "date", value: filters.start, "aria-invalid": !filters.start || undefined, onChange: (e) => setFilters((f) => ({ ...f, start: e.target.value, days: "" })) })) : null, filters.days === "" ? h("div", { className: "um-filter" }, h("span", { className: "um-label" }, "结束"), h("input", { className: "um-input", type: "date", value: filters.end, "aria-invalid": !filters.end || undefined, onChange: (e) => setFilters((f) => ({ ...f, end: e.target.value, days: "" })) })) : null),
          dateValidation ? h("div", { className: "um-validation", role: "status" }, dateValidation) : null,
          state.error && data ? h("div", { className: "um-error", role: "alert" }, state.error) : null,
          state.loading && !data ? h("div", { className: "um-loading", role: "status" }, "正在加载用量统计…") : state.error && !data ? h("div", { className: "um-error", role: "alert" }, h("p", null, state.error), h("button", { className: "um-button", type: "button", onClick: () => void load(true) }, "重试")) : h(React.Fragment, null,
          h("div", { className: "um-metrics" }, card("tokens", "消耗token", compactNum(totals.realTokens)), card("requests", "总请求数", num(totals.calls)), card("cache", "缓存命中率", percentage(totals.hitRate))),
          h("section", { className: "um-panel", "aria-labelledby": "um-trend-title" }, h("div", { className: "um-chart-head" }, h("div", { className: "um-panel-title", id: "um-trend-title" }, "使用趋势 · 按天"), h("div", { className: "um-segment", role: "group", "aria-label": "趋势指标" }, [["tokens", "Tokens"], ["requests", "请求"]].map(([key, label]) => h("button", { key, type: "button", className: metric === key ? "active" : "", onClick: () => setMetric(key), "aria-pressed": metric === key }, label)))), h(Chart, { days: data?.days, metric, scope: data?.scope })),
          h("section", { className: "um-panel" }, h("nav", { className: "um-tabs", "aria-label": "用量明细" }, [["requests", "请求"], ["providers", "供应商"], ["models", "模型"], ["pricing", "定价"]].map(([key, label]) => h("button", { key, className: `um-tab${tab === key ? " active" : ""}`, type: "button", onClick: () => setTab(key), "aria-selected": tab === key, role: "tab" }, label))), tab === "pricing" ? h(PricingEditor, { prices: state.prices, setPrices: (prices) => setState((s) => ({ ...s, prices })), saving: state.saving, onSave: savePrices }) : rows?.length ? table : h("div", { className: "um-empty" }, "当前筛选暂无数据")),
          detailKind ? h(Detail, { kind: detailKind, totals, scope: data?.scope, onClose: () => setDetailKind(null) }) : null)));
    }
    const inject = ["slots"];
    function apply(ctx) { ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "npm-usage", order: 65, label: () => (typeof navigator !== "undefined" && /^zh/i.test(navigator.language || "") ? "用量统计" : "Usage Statistics"), inject: () => ({}) }, UsageMeterSection)); }
    return { inject, apply };
  },
});
