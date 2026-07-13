import { loadConfig } from "../config";
import { SalesRepository } from "../storage/repository";
import { AfakturyClient } from "../afaktury/client";
import { syncFromMock, syncFromApi } from "./sync";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const cfg = loadConfig();
  const repo = new SalesRepository(cfg.dbPath);
  const log = (m: string) => console.log(`[sync] ${m}`);

  const useMock = hasFlag("mock") || !cfg.hasCredentials;

  if (useMock) {
    if (!cfg.hasCredentials && !hasFlag("mock")) {
      log("Brak klucza API (AFAKTURY_ID/KEY) — uzywam danych przykladowych (mock).");
      log("Uzupelnij .env, aby pobrac prawdziwe dane z afaktury.pl.");
    }
    const s = syncFromMock(repo, cfg.productCodeField, log);
    log(`OK (${s.source}): ${s.lines} pozycji.`);
    return;
  }

  const client = new AfakturyClient(cfg.afaktury);
  const s = await syncFromApi(
    repo,
    client,
    { field: cfg.productCodeField, dateBegin: arg("from"), dateEnd: arg("to") },
    log
  );
  log(`OK (${s.source}): ${s.documents} dokumentow, ${s.lines} pozycji.`);
}

main().catch((err) => {
  console.error("[sync] BLAD:", err.message);
  process.exit(1);
});
