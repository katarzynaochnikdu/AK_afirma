import * as path from "path";
import express from "express";
import { loadConfig } from "../config";
import { SalesRepository } from "../storage/repository";
import { AfakturyClient } from "../afaktury/client";
import { syncFromMock, syncFromApi } from "../sync/sync";

const cfg = loadConfig();
const repo = new SalesRepository(cfg.dbPath);

// Auto-seed: pusta baza -> dane przykladowe, zeby dashboard od razu cos pokazal.
if (repo.count() === 0) {
  console.log("[server] Baza pusta — wypelniam danymi przykladowymi (mock).");
  syncFromMock(repo, cfg.productCodeField, (m) => console.log(`[seed] ${m}`));
}

const app = express();
app.use(express.json());

app.get("/api/status", (_req, res) => {
  res.json({
    hasCredentials: cfg.hasCredentials,
    productCodeField: cfg.productCodeField,
    lines: repo.count(),
    lastSync: repo.getSyncState("lastSync") || null,
    dataSource: cfg.hasCredentials ? "api" : "mock",
  });
});

app.get("/api/products", (_req, res) => {
  res.json(repo.products());
});

app.get("/api/months", (_req, res) => {
  res.json(repo.months());
});

app.get("/api/report", (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const productCode =
    typeof req.query.product === "string" && req.query.product ? req.query.product : undefined;
  res.json(repo.monthlyReport({ from, to, productCode }));
});

// Recznie wyzwalana synchronizacja. ?mock=1 wymusza dane przykladowe.
app.post("/api/sync", async (req, res) => {
  try {
    const forceMock = req.query.mock === "1" || !cfg.hasCredentials;
    if (forceMock) {
      const s = syncFromMock(repo, cfg.productCodeField);
      return res.json({ ok: true, ...s });
    }
    const client = new AfakturyClient(cfg.afaktury);
    const s = await syncFromApi(repo, client, {
      field: cfg.productCodeField,
      dateBegin: typeof req.query.from === "string" ? req.query.from : undefined,
      dateEnd: typeof req.query.to === "string" ? req.query.to : undefined,
    });
    res.json({ ok: true, ...s });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

app.use(express.static(path.resolve("public")));

app.listen(cfg.port, () => {
  console.log(`[server] Dashboard: http://localhost:${cfg.port}`);
  console.log(
    `[server] Zrodlo danych: ${cfg.hasCredentials ? "API afaktury.pl" : "DANE PRZYKLADOWE (mock)"}`
  );
});
