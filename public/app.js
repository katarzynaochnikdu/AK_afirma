"use strict";

const MONTHS_PL = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const fmtInt = (n) => Math.round(n).toLocaleString("pl-PL");
const fmtMoney = (n) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  return `${MONTHS_PL[Number(m) - 1]} ${y}`;
}

/** Lista miesiecy 'YYYY-MM' od `from` do `to` wlacznie. */
function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const $ = (id) => document.getElementById(id);
const state = { months: [] };

async function json(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function init() {
  const status = await json("/api/status");
  const badge = $("sourceBadge");
  if (status.dataSource === "mock") {
    badge.textContent = "DANE PRZYKŁADOWE";
    badge.classList.add("mock");
  } else {
    badge.textContent = "afaktury.pl (na żywo)";
  }
  $("status").textContent =
    `Pozycji w bazie: ${fmtInt(status.lines)} · ostatnia synchronizacja: ${status.lastSync ? new Date(status.lastSync).toLocaleString("pl-PL") : "—"} · kod pozycji: ${status.productCodeField}`;

  state.months = await json("/api/months");
  const products = await json("/api/products");

  const fromSel = $("fromMonth"), toSel = $("toMonth"), prodSel = $("product");
  for (const ym of state.months) {
    fromSel.append(new Option(monthLabel(ym), ym));
    toSel.append(new Option(monthLabel(ym), ym));
  }
  if (state.months.length) {
    fromSel.value = state.months[0];
    toSel.value = state.months[state.months.length - 1];
  }
  for (const p of products) {
    prodSel.append(new Option(`${p.name || "(bez nazwy)"} — ${p.code}`, p.code));
  }

  fromSel.onchange = toSel.onchange = prodSel.onchange = render;
  $("syncBtn").onclick = doSync;
  render();
}

async function doSync() {
  const btn = $("syncBtn");
  btn.disabled = true;
  btn.textContent = "Synchronizuję…";
  try {
    await json("/api/sync", { method: "POST" });
    // przeladuj miesiace/produkty po synchronizacji
    location.reload();
  } catch (e) {
    alert("Błąd synchronizacji: " + e.message);
    btn.disabled = false;
    btn.textContent = "Odśwież dane";
  }
}

async function render() {
  const from = $("fromMonth").value || (state.months[0] || "");
  const to = $("toMonth").value || (state.months[state.months.length - 1] || "");
  const product = $("product").value;
  if (!from || !to) return;

  const params = new URLSearchParams({ from, to });
  if (product) params.set("product", product);
  const cells = await json("/api/report?" + params.toString());

  const cols = monthRange(from, to);
  buildTiles(cells, cols);
  buildChart(cells, cols, product);
  buildTable(cells, cols);
}

function buildTiles(cells, cols) {
  const totalQty = cells.reduce((s, c) => s + c.qty, 0);
  const totalNetto = cells.reduce((s, c) => s + c.netto, 0);
  const titles = new Set(cells.map((c) => c.productCode));
  $("tileQty").textContent = fmtInt(totalQty);
  $("tileTitles").textContent = fmtInt(titles.size);
  $("tileMonths").textContent = fmtInt(cols.length);
  $("tileNetto").textContent = fmtMoney(totalNetto);
}

function buildChart(cells, cols, product) {
  const byMonth = new Map(cols.map((c) => [c, 0]));
  for (const c of cells) {
    const ym = `${c.year}-${String(c.month).padStart(2, "0")}`;
    if (byMonth.has(ym)) byMonth.set(ym, byMonth.get(ym) + c.qty);
  }
  $("chartTitle").textContent = product
    ? `Sprzedaż w miesiącach — ${product}`
    : "Sprzedaż w miesiącach (wszystkie pozycje)";

  const data = cols.map((ym) => ({ ym, v: byMonth.get(ym) || 0 }));
  const W = Math.max(cols.length * 64, 320), H = 240, pad = 28;
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const bw = (W - pad * 2) / data.length;
  const y = (v) => H - pad - (v / maxV) * (H - pad * 2);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;
  svg += `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--line)"/>`;
  data.forEach((d, i) => {
    const x = pad + i * bw + bw * 0.15;
    const w = bw * 0.7;
    const top = y(Math.max(0, d.v));
    const h = Math.abs(y(d.v) - y(0));
    svg += `<rect class="bar" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="3"/>`;
    svg += `<text class="bar-value" x="${(x + w / 2).toFixed(1)}" y="${(top - 5).toFixed(1)}" text-anchor="middle">${fmtInt(d.v)}</text>`;
    svg += `<text class="bar-label" x="${(x + w / 2).toFixed(1)}" y="${H - pad + 16}" text-anchor="middle">${MONTHS_PL[Number(d.ym.split("-")[1]) - 1]}</text>`;
  });
  svg += `</svg>`;
  $("chart").innerHTML = svg;
}

function buildTable(cells, cols) {
  const thead = document.querySelector("#pivot thead");
  const tbody = document.querySelector("#pivot tbody");
  const empty = $("empty");
  const table = $("pivot");

  if (cells.length === 0) {
    thead.innerHTML = "";
    tbody.innerHTML = "";
    table.hidden = true;
    empty.hidden = false;
    return;
  }
  table.hidden = false;
  empty.hidden = true;

  // pivot: rows = produkt, cols = miesiace
  const rows = new Map(); // code -> {name, code, cells:Map<ym,qty>, total}
  for (const c of cells) {
    const ym = `${c.year}-${String(c.month).padStart(2, "0")}`;
    let r = rows.get(c.productCode);
    if (!r) { r = { code: c.productCode, name: c.productName, cells: new Map(), total: 0 }; rows.set(c.productCode, r); }
    r.cells.set(ym, (r.cells.get(ym) || 0) + c.qty);
    r.total += c.qty;
    if (!r.name && c.productName) r.name = c.productName;
  }
  const rowList = [...rows.values()].sort((a, b) => b.total - a.total);

  thead.innerHTML =
    `<tr><th>Pozycja</th><th>Kod</th>${cols.map((c) => `<th>${monthLabel(c)}</th>`).join("")}<th class="total">Razem</th></tr>`;

  const colTotals = cols.map(() => 0);
  let grand = 0;
  tbody.innerHTML = rowList
    .map((r) => {
      const tds = cols
        .map((ym, i) => {
          const v = r.cells.get(ym) || 0;
          colTotals[i] += v;
          return `<td>${v ? fmtInt(v) : "·"}</td>`;
        })
        .join("");
      grand += r.total;
      return `<tr><td>${r.name || "(bez nazwy)"}</td><td class="code">${r.code}</td>${tds}<td class="total">${fmtInt(r.total)}</td></tr>`;
    })
    .join("");

  let tfoot = table.querySelector("tfoot");
  if (!tfoot) { tfoot = document.createElement("tfoot"); table.append(tfoot); }
  tfoot.innerHTML =
    `<tr><td>Razem</td><td></td>${colTotals.map((t) => `<td>${fmtInt(t)}</td>`).join("")}<td class="total">${fmtInt(grand)}</td></tr>`;
}

init().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", `<p style="color:red">Błąd inicjalizacji: ${e.message}</p>`);
});
