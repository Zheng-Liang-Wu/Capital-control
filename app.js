(() => {
  const config = window.DASHBOARD_CONFIG || {};
  const positions = [
    { key: "spot", name: "現貨", description: "固定底倉", color: "spot", icon: "◈" },
    { key: "longTerm", name: "長線合約", description: "周線判斷進場", color: "long", icon: "↗" },
    { key: "trend", name: "趨勢合約", description: "日線判斷進場", color: "trend", icon: "⌁" },
    { key: "reserve", name: "U 倉", description: "等待進場 / 掛單", color: "reserve", icon: "Ｕ" }
  ];
  const demo = { date: "", capital: 10000, spot: 7200, longTerm: 1100, trend: 700, reserve: 1000 };
  const REFRESH_MS = 30_000;
  let lastData = null;
  let refreshing = false;
  const money = n => `${config.CURRENCY || "USDT"} ${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(n || 0)}`;
  const pct = (n, total) => total > 0 ? `${(n / total * 100).toFixed(1)}%` : "—";
  const set = (id, value) => { document.getElementById(id).textContent = value; };

  function parseCsv(text) {
    const rows = []; let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted && c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) { row.push(field); field = ""; }
      else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(cell => cell.trim() !== ""));
  }
  function number(value) { const n = Number(String(value || "").replace(/[,$\s]/g, "")); return Number.isFinite(n) ? n : 0; }
  function normalise(headers, values) {
    const keys = { "時間戳記": "date", "填寫日期": "date", "日期": "date", "總本金": "capital", "現貨金額": "spot", "現貨": "spot", "長線合約金額": "longTerm", "長線合約": "longTerm", "趨勢合約金額": "trend", "趨勢合約": "trend", "U倉金額": "reserve", "U 倉金額": "reserve", "U倉": "reserve", "U 倉": "reserve" };
    const result = { ...demo };
    headers.forEach((h, i) => { const key = keys[h.trim()]; if (key === "date") result.date = values[i] || ""; else if (key) result[key] = number(values[i]); });
    return result;
  }
  async function loadData() {
    if (!config.SHEET_CSV_URL) return { ...demo, isDemo: true };
    const separator = config.SHEET_CSV_URL.includes("?") ? "&" : "?";
    const response = await fetch(`${config.SHEET_CSV_URL}${separator}_refresh=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("無法讀取試算表");
    const rows = parseCsv(await response.text());
    const latest = rows.slice(1).reverse().find(row => row.length > 1 && row.slice(1).some(cell => cell.trim() !== ""));
    if (!latest) return { date: "", capital: 0, spot: 0, longTerm: 0, trend: 0, reserve: 0, isDemo: false, noEntries: true };
    return { ...normalise(rows[0], latest), isDemo: false };
  }
  function render(data) {
    const capital = Math.max(0, data.capital), values = Object.fromEntries(positions.map(p => [p.key, Math.max(0, data[p.key] || 0)]));
    const invested = values.spot + values.longTerm + values.trend;
    const allocated = invested + values.reserve;
    const remaining = capital - allocated;
    const spotPct = capital ? values.spot / capital * 100 : 0;
    set("total-capital", money(capital)); set("allocation-total", `本金 ${money(capital)}`);
    set("invested-total", money(invested)); set("invested-ratio", `${pct(invested, capital)} 已投入（不含 U 倉）`);
    set("reserve-value", money(values.reserve)); set("reserve-ratio", `${pct(values.reserve, capital)} 占總本金`);
    set("spot-ratio", `${spotPct.toFixed(1)}%`);
    const minimum = Number(config.SPOT_MINIMUM_PERCENT ?? 70);
    const spotState = document.getElementById("spot-state");
    spotState.textContent = spotPct >= minimum ? `已達 ${minimum}% 最低配置` : `低於 ${minimum}% 下限`;
    spotState.className = `metric-foot ${spotPct >= minimum ? "positive" : "warning"}`;
    const total = capital || 1;
    document.getElementById("bar-track").innerHTML = positions.map(p => `<span class="bar-segment ${p.color}" style="width:${Math.min(100, values[p.key] / total * 100)}%" title="${p.name} ${pct(values[p.key], capital)}"></span>`).join("");
    document.getElementById("legend").innerHTML = positions.map(p => `<div class="legend-item"><span class="legend-dot ${p.color}"></span><span>${p.name}</span><b>${pct(values[p.key], capital)}</b></div>`).join("");
    document.getElementById("positions").innerHTML = positions.map(p => `<div class="position-row"><div class="position-name"><span class="position-icon ${p.color}">${p.icon}</span><span><b>${p.name}</b><small>${p.description}</small></span></div><div class="position-value"><b>${money(values[p.key])}</b><span>${pct(values[p.key], capital)}</span></div></div>`).join("");
    set("unallocated-value", money(Math.max(0, remaining))); set("unallocated-ratio", pct(Math.max(0, remaining), capital));
    if (remaining < 0) { set("unallocated-value", `超出 ${money(Math.abs(remaining))}`); document.getElementById("unallocated-ratio").textContent = "填報金額高於本金"; }
    const dateText = data.noEntries ? "尚無資料" : data.date ? `更新於 ${data.date}` : data.isDemo ? "範例資料" : "已載入試算表";
    set("updated", dateText);
    if (data.noEntries) set("data-status", "試算表連線成功，請在試算表新增第一筆資金資料");
    else if (data.isDemo) set("data-status", "目前顯示範例資料");
    else set("data-status", `已同步試算表 · ${new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`);
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    const button = document.getElementById("refresh-button");
    button.disabled = true;
    button.textContent = "同步中…";
    try {
      lastData = await loadData();
      render(lastData);
    } catch (error) {
      set("data-status", lastData ? "更新失敗，畫面保留上次成功資料；請檢查試算表權限或網路" : "讀取試算表失敗，請檢查共用權限和網路連線");
      console.error("試算表同步失敗", error);
    } finally {
      refreshing = false;
      button.disabled = false;
      button.textContent = "↻ 更新";
    }
  }
  const form = config.FORM_URL;
  if (form) { const link = document.getElementById("form-link"); link.href = form; link.classList.add("visible"); }
  document.getElementById("refresh-button").addEventListener("click", refresh);
  refresh();
  window.setInterval(refresh, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
