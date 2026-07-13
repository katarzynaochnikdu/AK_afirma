import * as fs from "fs";
import * as path from "path";
import { generateMockDataset } from "../src/sync/mock";
import { buildProductIndex } from "../src/domain/normalize";
import { buildSalesLines, aggregateMonthly } from "../src/domain/aggregate";

/**
 * Buduje statyczny zestaw danych demo do GitHub Pages (docs/data.js).
 * Cala agregacja liczona raz; strona filtruje po stronie przegladarki.
 */
function main() {
  const { products, invoices, correctives } = generateMockDataset();
  const catalog = buildProductIndex(products);
  const lines = buildSalesLines(invoices, correctives, catalog, { field: "ean" });
  const cells = aggregateMonthly(lines);

  const months = [...new Set(cells.map((c) => `${c.year}-${String(c.month).padStart(2, "0")}`))].sort();
  const prodMap = new Map<string, string>();
  for (const c of cells) if (!prodMap.has(c.productCode)) prodMap.set(c.productCode, c.productName);
  const productList = [...prodMap.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const data = { generatedFor: "demo", months, products: productList, cells };
  const outDir = path.resolve("docs");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "data.js"),
    `// Auto-generowane (npm run build:demo). Dane przykladowe, nie prawdziwe.\nwindow.DEMO_DATA = ${JSON.stringify(data)};\n`,
    "utf8"
  );
  console.log(`docs/data.js: ${cells.length} komorek, ${months.length} miesiecy, ${productList.length} pozycji.`);
}
main();
