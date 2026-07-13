"use strict";
// Panel wydawcy — wersja STATYCZNA (GitHub Pages). Dane z window.DEMO_DATA (fikcyjne).

const DATA = window.DEMO_DATA || { months: [], quarters: [], authors: [], books: [], cells: [] };

/* ============ Pomocnicze ============ */
const MONTHS_PL = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const $ = (id) => document.getElementById(id);
const fmtInt = (n) => Math.round(n).toLocaleString("pl-PL");
const fmtMoney = (n) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zl = (n) => `${fmtMoney(n)} zł`;
const monthLabel = (ym) => `${MONTHS_PL[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const monthShort = (ym) => MONTHS_PL[Number(ym.slice(5)) - 1];

const bookByCode = new Map(DATA.books.map((b) => [b.code, b]));
const authorById = new Map(DATA.authors.map((a) => [a.id, a]));
const booksByAuthor = new Map(DATA.authors.map((a) => [a.id, DATA.books.filter((b) => b.authorId === a.id)]));
const slotColor = (slot) => getComputedStyle(document.documentElement).getPropertyValue(`--s${slot}`).trim();

function cellsFor({ months, code, authorId } = {}) {
  const mset = months ? new Set(months) : null;
  return DATA.cells.filter((c) => {
    if (mset && !mset.has(c.ym)) return false;
    if (code && c.code !== code) return false;
    if (authorId && bookByCode.get(c.code)?.authorId !== authorId) return false;
    return true;
  });
}
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

/* ============ Motyw ============ */
$("themeToggle").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("demo-theme", next);
  render(); // przerysuj wykresy z kolorami nowego motywu
});

/* ============ Tooltip ============ */
const tip = $("tooltip");
function bindTips(svg) {
  svg.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      tip.innerHTML = el.getAttribute("data-tip");
      tip.hidden = false;
      const pad = 12;
      let x = e.clientX + pad, y = e.clientY + pad;
      const r = tip.getBoundingClientRect();
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
      if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    });
    el.addEventListener("mouseleave", () => { tip.hidden = true; });
  });
}

/* Slupek z zaokraglonym tylko gornym koncem (kotwiczony do osi) */
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
/* Slupek poziomy z zaokraglonym prawym koncem */
function hbarPath(x, y, w, h, r) {
  r = Math.min(r, h / 2, w);
  return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
}

/* ============ Zakladki ============ */
const VIEWS = ["sprzedaz", "autorzy", "rozliczenia"];
let activeView = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "sprzedaz";
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    activeView = t.dataset.view;
    location.hash = activeView;
    render();
  });
});

/* ============ Filtry: Sprzedaz ============ */
for (const ym of DATA.months) {
  $("fromMonth").append(new Option(monthLabel(ym), ym));
  $("toMonth").append(new Option(monthLabel(ym), ym));
}
$("fromMonth").value = DATA.months[0];
$("toMonth").value = DATA.months[DATA.months.length - 1];
for (const b of DATA.books) {
  const a = authorById.get(b.authorId);
  $("bookFilter").append(new Option(`${b.title} — ${a ? a.name : ""}`, b.code));
}
["fromMonth", "toMonth", "bookFilter"].forEach((id) => $(id).addEventListener("change", render));

/* ============ Filtry: Rozliczenia ============ */
for (const q of DATA.quarters) $("qSelect").append(new Option(q.label, q.id));
$("qSelect").value = DATA.quarters[DATA.quarters.length - 1]?.id || "";
for (const a of DATA.authors) $("aSelect").append(new Option(a.name, a.id));
["qSelect", "aSelect"].forEach((id) => $(id).addEventListener("change", () => { mailVisible = false; render(); }));

let mailVisible = false;
$("mailBtn").addEventListener("click", () => {
  mailVisible = !mailVisible;
  render();
  if (mailVisible) $("mailPreview").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ============ WIDOK: SPRZEDAZ ============ */
function monthRange(from, to) {
  return DATA.months.filter((m) => m >= from && m <= to);
}

function renderSprzedaz() {
  const from = $("fromMonth").value, to = $("toMonth").value, code = $("bookFilter").value || undefined;
  const months = monthRange(from, to);
  const cells = cellsFor({ months, code });

  const qty = sum(cells, (c) => c.sold - c.ret);
  const netto = sum(cells, (c) => c.netto);
  const rebate = sum(cells, (c) => c.rebate);
  const gross = sum(cells, (c) => c.gross);
  const returns = sum(cells, (c) => c.ret);
  $("tQty").textContent = fmtInt(qty);
  $("tNetto").textContent = fmtMoney(netto);
  $("tRebate").textContent = fmtMoney(rebate);
  $("tRebatePct").textContent = gross ? `${((rebate / gross) * 100).toFixed(1).replace(".", ",")}% wartości przed rabatem` : "";
  $("tReturns").textContent = fmtInt(returns);

  // wykres miesieczny (egzemplarze)
  const byM = new Map(months.map((m) => [m, { qty: 0, netto: 0, rebate: 0 }]));
  for (const c of cells) {
    const b = byM.get(c.ym);
    b.qty += c.sold - c.ret; b.netto += c.netto; b.rebate += c.rebate;
  }
  const book = code ? bookByCode.get(code) : null;
  $("chartTitle").textContent = book ? `Sprzedaż w miesiącach — ${book.title}` : "Sprzedaż w miesiącach (wszystkie tytuły)";

  const data = months.map((m) => ({ m, ...byM.get(m) }));
  const W = Math.max(months.length * 66, 340), H = 250, padL = 10, padB = 30, padT = 24;
  const maxV = Math.max(1, ...data.map((d) => d.qty));
  const bw = (W - padL * 2) / data.length;
  const y = (v) => H - padB - (v / maxV) * (H - padB - padT);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sprzedaż miesięczna">`;
  svg += `<line class="axis-line" x1="${padL}" y1="${H - padB}" x2="${W - padL}" y2="${H - padB}"/>`;
  data.forEach((d, i) => {
    const x = padL + i * bw + bw * 0.2, w = bw * 0.6, top = y(d.qty), h = H - padB - top;
    const tipHtml = `<b>${monthLabel(d.m)}</b><br>Egzemplarze: <b>${fmtInt(d.qty)}</b><br>Netto po rabatach: ${zl(d.netto)}<br>Rabaty: ${zl(d.rebate)}`;
    svg += `<path class="bar" d="${barPath(x, top, w, Math.max(h, 1), 4)}" data-tip="${tipHtml.replace(/"/g, "&quot;")}"/>`;
    svg += `<text class="bar-value" x="${x + w / 2}" y="${top - 6}" text-anchor="middle">${fmtInt(d.qty)}</text>`;
    svg += `<text class="bar-label" x="${x + w / 2}" y="${H - padB + 16}" text-anchor="middle">${monthShort(d.m)}</text>`;
  });
  svg += `</svg>`;
  $("chartMonthly").innerHTML = svg;
  bindTips($("chartMonthly"));

  // pivot: tytul x miesiac
  const thead = document.querySelector("#pivot thead");
  const tbody = document.querySelector("#pivot tbody");
  const table = $("pivot");
  if (!cells.length) {
    thead.innerHTML = ""; tbody.innerHTML = ""; table.hidden = true; $("pivotEmpty").hidden = false;
    const tf = table.querySelector("tfoot"); if (tf) tf.innerHTML = "";
    return;
  }
  table.hidden = false; $("pivotEmpty").hidden = true;

  const rows = new Map();
  for (const c of cells) {
    let r = rows.get(c.code);
    if (!r) { r = { code: c.code, m: new Map(), qty: 0, netto: 0 }; rows.set(c.code, r); }
    const q = c.sold - c.ret;
    r.m.set(c.ym, (r.m.get(c.ym) || 0) + q);
    r.qty += q; r.netto += c.netto;
  }
  const rowList = [...rows.values()].sort((a, b) => b.qty - a.qty);

  thead.innerHTML = `<tr><th>Tytuł</th>${months.map((m) => `<th>${monthShort(m)} ${m.slice(2, 4)}</th>`).join("")}<th class="total">Egz.</th><th class="total">Netto (zł)</th></tr>`;
  const colT = months.map(() => 0);
  let gq = 0, gn = 0;
  tbody.innerHTML = rowList.map((r) => {
    const b = bookByCode.get(r.code);
    const tds = months.map((m, i) => {
      const v = r.m.get(m) || 0; colT[i] += v;
      return `<td>${v ? fmtInt(v) : "·"}</td>`;
    }).join("");
    gq += r.qty; gn += r.netto;
    return `<tr><td>${b ? b.title : r.code}</td>${tds}<td class="total">${fmtInt(r.qty)}</td><td class="total">${fmtMoney(r.netto)}</td></tr>`;
  }).join("");
  let tfoot = table.querySelector("tfoot");
  if (!tfoot) { tfoot = document.createElement("tfoot"); table.append(tfoot); }
  tfoot.innerHTML = `<tr><td>Razem</td>${colT.map((t) => `<td>${fmtInt(t)}</td>`).join("")}<td>${fmtInt(gq)}</td><td>${fmtMoney(gn)}</td></tr>`;
}

/* ============ WIDOK: AUTORZY ============ */
function authorTotals(a, months) {
  const cells = cellsFor({ months, authorId: a.id });
  const qty = sum(cells, (c) => c.sold - c.ret);
  const netto = sum(cells, (c) => c.netto);
  const rebate = sum(cells, (c) => c.rebate);
  const royalty = netto * a.rate;
  return { qty, netto, rebate, royalty, cells };
}

function renderAutorzy() {
  // poziome slupki: netto wg autora (kolor = tozsamosc autora, staly)
  const stats = DATA.authors.map((a) => ({ a, ...authorTotals(a) })).sort((x, y) => y.netto - x.netto);
  const maxN = Math.max(1, ...stats.map((s) => s.netto));
  const rowH = 44, W = 720, padL = 10, labelW = 170;
  const H = stats.length * rowH + 10;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Przychód wg autora">`;
  stats.forEach((s, i) => {
    const y0 = 5 + i * rowH;
    const w = Math.max(4, ((W - labelW - padL - 110) * s.netto) / maxN);
    const color = slotColor(s.a.slot);
    const tipHtml = `<b>${s.a.name}</b><br>Netto po rabatach: <b>${zl(s.netto)}</b><br>Egzemplarze: ${fmtInt(s.qty)}<br>Rabaty: ${zl(s.rebate)}<br>Tantiemy (${(s.a.rate * 100).toFixed(0)}%): ${zl(s.royalty)}`;
    svg += `<text class="hbar-name" x="${padL}" y="${y0 + 22}">${s.a.name}</text>`;
    svg += `<path d="${hbarPath(labelW, y0 + 8, w, 20, 4)}" fill="${color}" data-tip="${tipHtml.replace(/"/g, "&quot;")}"/>`;
    svg += `<text class="hbar-value" x="${labelW + w + 8}" y="${y0 + 23}">${zl(s.netto)}</text>`;
  });
  svg += `</svg>`;
  $("chartAuthors").innerHTML = svg;
  bindTips($("chartAuthors"));

  // karty autorow
  $("authorCards").innerHTML = stats.map((s) => {
    const a = s.a;
    const color = slotColor(a.slot);
    const initials = a.name.split(" ").map((p) => p[0]).join("");
    const books = (booksByAuthor.get(a.id) || []).map((b) => {
      const bc = cellsFor({ code: b.code });
      const bq = sum(bc, (c) => c.sold - c.ret);
      const bn = sum(bc, (c) => c.netto);
      return { b, bq, bn };
    }).sort((x, y) => y.bn - x.bn);
    const maxBn = Math.max(1, ...books.map((x) => x.bn));
    return `
      <div class="author-card">
        <div class="author-head">
          <div class="avatar" style="background:${color}">${initials}</div>
          <div>
            <div class="author-name">${a.name}</div>
            <div class="author-meta">${books.length} ${books.length === 1 ? "tytuł" : "tytuły"} · stawka tantiem ${(a.rate * 100).toFixed(0)}% netto</div>
          </div>
        </div>
        <div class="author-stats">
          <div class="astat"><div class="v">${fmtInt(s.qty)}</div><div class="l">egzemplarze (netto)</div></div>
          <div class="astat"><div class="v">${fmtMoney(s.netto)}</div><div class="l">przychód netto (zł)</div></div>
          <div class="astat"><div class="v">${fmtMoney(s.rebate)}</div><div class="l">udzielone rabaty (zł)</div></div>
          <div class="astat"><div class="v">${fmtMoney(s.royalty)}</div><div class="l">tantiemy narosłe (zł)</div></div>
        </div>
        <div class="book-rows">
          ${books.map(({ b, bq, bn }) => `
            <div class="book-row">
              <span class="book-title">${b.title}</span>
              <span class="book-nums">${fmtInt(bq)} egz. · ${zl(bn)}</span>
              <span class="meter"><i style="width:${((bn / maxBn) * 100).toFixed(1)}%;background:${color}"></i></span>
            </div>`).join("")}
        </div>
      </div>`;
  }).join("");
}

/* ============ WIDOK: ROZLICZENIA ============ */
function settlementFor(quarterId, authorId) {
  const q = DATA.quarters.find((x) => x.id === quarterId);
  const a = authorById.get(Number(authorId));
  if (!q || !a) return null;
  const rows = (booksByAuthor.get(a.id) || []).map((b) => {
    const cells = cellsFor({ months: q.months, code: b.code });
    const sold = sum(cells, (c) => c.sold);
    const ret = sum(cells, (c) => c.ret);
    const gross = sum(cells, (c) => c.gross);
    const rebate = sum(cells, (c) => c.rebate);
    const netto = sum(cells, (c) => c.netto);
    const royalty = Math.round(netto * a.rate * 100) / 100;
    return { b, sold, ret, gross, rebate, netto, royalty };
  }).filter((r) => r.sold > 0 || r.ret > 0);
  const total = {
    sold: sum(rows, (r) => r.sold), ret: sum(rows, (r) => r.ret),
    gross: sum(rows, (r) => r.gross), rebate: sum(rows, (r) => r.rebate),
    netto: sum(rows, (r) => r.netto), royalty: Math.round(sum(rows, (r) => r.royalty) * 100) / 100,
  };
  return { q, a, rows, total };
}

function settlementTable(s, compact) {
  const head = compact
    ? `<tr><th>Tytuł</th><th>Sprzedane egz.</th><th>Netto po rabatach</th><th>Tantiema</th></tr>`
    : `<tr><th>Tytuł</th><th>ISBN</th><th>Sprzedane</th><th>Zwroty</th><th>Netto przed rabatami</th><th>Rabaty</th><th>Netto po rabatach</th><th>Tantiema</th></tr>`;
  const rows = s.rows.map((r) => compact
    ? `<tr><td>${r.b.title}</td><td>${fmtInt(r.sold - r.ret)}</td><td>${fmtMoney(r.netto)}</td><td>${fmtMoney(r.royalty)}</td></tr>`
    : `<tr><td>${r.b.title}</td><td class="code">${r.b.code}</td><td>${fmtInt(r.sold)}</td><td class="${r.ret ? "neg" : ""}">${r.ret ? "−" + fmtInt(r.ret) : "·"}</td><td>${fmtMoney(r.gross)}</td><td>${r.rebate ? "−" + fmtMoney(r.rebate) : "·"}</td><td>${fmtMoney(r.netto)}</td><td class="total">${fmtMoney(r.royalty)}</td></tr>`
  ).join("");
  const foot = compact
    ? `<tr><td>Razem</td><td>${fmtInt(s.total.sold - s.total.ret)}</td><td>${fmtMoney(s.total.netto)}</td><td>${fmtMoney(s.total.royalty)}</td></tr>`
    : `<tr><td>Razem</td><td></td><td>${fmtInt(s.total.sold)}</td><td class="${s.total.ret ? "neg" : ""}">${s.total.ret ? "−" + fmtInt(s.total.ret) : "·"}</td><td>${fmtMoney(s.total.gross)}</td><td>${s.total.rebate ? "−" + fmtMoney(s.total.rebate) : "·"}</td><td>${fmtMoney(s.total.netto)}</td><td>${fmtMoney(s.total.royalty)}</td></tr>`;
  return `<div class="table-scroll"><table class="num-table"><thead>${head}</thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>`;
}

function renderRozliczenia() {
  const s = settlementFor($("qSelect").value, $("aSelect").value);
  if (!s) { $("settlementCard").innerHTML = ""; return; }
  const color = slotColor(s.a.slot);
  $("settlementCard").innerHTML = `
    <div class="doc-head">
      <div>
        <p class="doc-title">Rozliczenie tantiem — ${s.q.label}</p>
        <p class="doc-sub">
          Autor: <b style="color:${color}">${s.a.name}</b> · stawka ${(s.a.rate * 100).toFixed(0)}% od przychodu netto po rabatach ·
          okres: ${monthLabel(s.q.months[0])} – ${monthLabel(s.q.months[2])}
        </p>
      </div>
      <span class="chip">symulacja — dane przykładowe</span>
    </div>
    ${s.rows.length ? settlementTable(s, false) : `<p class="empty">Brak sprzedaży w tym kwartale.</p>`}
    <div class="payout">
      <span class="lbl">Do wypłaty dla autora</span>
      <span class="amount">${zl(s.total.royalty)}</span>
      <span class="due">termin płatności: 14 dni od zatwierdzenia rozliczenia</span>
    </div>`;

  // symulacja e-maila
  const mail = $("mailPreview");
  $("mailBtn").textContent = mailVisible ? "✕ Ukryj symulację e-maila" : "✉️ Pokaż symulację e-maila do autora";
  if (!mailVisible) { mail.hidden = true; mail.innerHTML = ""; return; }
  const lastM = s.q.months[2];
  const sendDate = `05.${String((Number(lastM.slice(5)) % 12) + 1).padStart(2, "0")}.${Number(lastM.slice(5)) === 12 ? Number(lastM.slice(0, 4)) + 1 : lastM.slice(0, 4)}`;
  mail.hidden = false;
  mail.innerHTML = `
    <div class="mail-toolbar">
      <span class="mail-dot"></span><span class="mail-dot"></span><span class="mail-dot"></span>
      <span class="mail-app">Nowa wiadomość — podgląd</span>
      <span class="badge mock mail-sim">SYMULACJA AUTOMATYZACJI</span>
    </div>
    <div class="mail-headers">
      <div><span class="h-lbl">Od:</span> <b>${DATA.publisher.name}</b> &lt;${DATA.publisher.mail}&gt;</div>
      <div><span class="h-lbl">Do:</span> <b>${s.a.name}</b> &lt;${s.a.mail}&gt;</div>
      <div><span class="h-lbl">Temat:</span> <b>Rozliczenie tantiem za ${s.q.label} — ${DATA.publisher.name}</b></div>
      <div><span class="h-lbl">Data:</span> ${sendDate}, 08:00 (wysyłka automatyczna)</div>
    </div>
    <div class="mail-body">
      <p>Dzień dobry,</p>
      <p>przesyłamy zestawienie sprzedaży ${s.rows.length === 1 ? "Pani/Pana tytułu" : "Pani/Pana tytułów"} za
         <b>${s.q.label}</b> (${monthLabel(s.q.months[0])} – ${monthLabel(s.q.months[2])}) wraz z naliczonymi tantiemami
         według stawki <b>${(s.a.rate * 100).toFixed(0)}%</b> od przychodu netto po rabatach:</p>
      ${settlementTable(s, true)}
      <p class="mail-total">Łączna kwota tantiem do wypłaty: ${zl(s.total.royalty)}</p>
      <p>Kwota zostanie przelana na rachunek wskazany w umowie w terminie 14 dni.
         Szczegółowe zestawienie (z rabatami i zwrotami) znajduje się w załączniku PDF.</p>
      <p class="mail-sign">Z pozdrowieniami,<br>Dział rozliczeń<br><b>${DATA.publisher.name}</b></p>
    </div>
    <div class="mail-send-row">
      <button class="btn btn-primary" disabled title="Niedostępne w wersji demo">Wyślij</button>
      <button class="btn" disabled title="Niedostępne w wersji demo">Zapisz szkic</button>
      <span class="mail-app">📎 rozliczenie_${s.q.id}_${s.a.name.split(" ")[1].toLowerCase()}.pdf (symulowany załącznik)</span>
    </div>
    <div class="mail-footer">
      Ta wiadomość została wygenerowana automatycznie przez system rozliczeń wydawnictwa.
      To jest <b>symulacja</b> na danych przykładowych — żaden e-mail nie jest wysyłany.
    </div>`;
}

/* ============ Render glowny ============ */
function render() {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === activeView));
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== activeView;
  if (activeView === "sprzedaz") renderSprzedaz();
  else if (activeView === "autorzy") renderAutorzy();
  else renderRozliczenia();
  $("status").textContent =
    `${DATA.publisher.name} (demo) · ${DATA.books.length} tytułów · ${DATA.authors.length} autorów · dane fikcyjne wygenerowane dla prezentacji`;
}

render();
