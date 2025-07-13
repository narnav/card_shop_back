import axios from "axios";
import dayjs from "dayjs";
import chalk from "chalk";
import Table from "cli-table3";
import dotenv from "dotenv";
import fs from "fs";
import readline from "readline";
import express from "express";

dotenv.config();

// -----------------------------------------------------------------------------
// Config & helpers
// -----------------------------------------------------------------------------
const CACHE_FILE = "prices.cache.json";
const PAGE_SIZE = 8;  // Increased for better readability
const PORT = process.env.PORT || 4000; // API port

const fmt = (v) => (parseFloat(v) ? `$${parseFloat(v).toFixed(2)}` : "-");
const pct = (now, prev) => (prev && prev !== 0 ? ((now - prev) / prev) * 100 : null);

const rarityColors = {
  "Common": chalk.white,
  "Rare": chalk.blue,
  "Super Rare": chalk.magenta,
  "Ultra Rare": chalk.yellow,
  "Secret Rare": chalk.cyan,
  "Ghost Rare": chalk.green,
  "Prismatic Secret Rare": chalk.hex("#FFD700"),
  "Quarter Century Secret Rare": chalk.hex("#FFA500"),
};

const conditionColors = {
  "Mint": chalk.green,
  "Near Mint": chalk.hex("#7CFC00"),
  "Lightly Played": chalk.yellow,
  "Moderately Played": chalk.hex("#FFA500"),
  "Heavily Played": chalk.red,
  "Damaged": chalk.redBright,
  "Unopened": chalk.cyan,
};

function loadPrevPrices() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  const json = JSON.parse(fs.readFileSync(CACHE_FILE));
  const lastKey = Object.keys(json).sort().pop();
  return json[lastKey] || {};
}

function saveTodayPrices(dateStr, rows) {
  const map = Object.fromEntries(rows.map((r) => [r.Set, r.TCGNow]));
  const obj = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE)) : {};
  obj[dateStr] = map;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
}

// -----------------------------------------------------------------------------
// Fetch card info from YGOPRODeck
// -----------------------------------------------------------------------------
async function fetchCardInfo(name) {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}&misc=yes`;
  const { data } = await axios.get(url);
  return data.data;
}

// -----------------------------------------------------------------------------
// Build enhanced rows with set names
// -----------------------------------------------------------------------------
function buildRows(card, prevMap) {
  const seen = new Set();
  const results = [];
  const bundle = card.card_prices?.[0] || {};

  for (const set of card.card_sets || []) {
    const code = set.set_code;
    if (seen.has(code)) continue;
    seen.add(code);

    const tcgNow = parseFloat(set.set_price || 0);
    const tcgPrev = parseFloat(prevMap[code] || 0);

    const ebay = parseFloat(bundle.ebay_price || 0);
    const amzn = parseFloat(bundle.amazon_price || 0);
    const csinc = parseFloat(bundle.coolstuffinc_price || 0);

    const vend = [tcgNow, ebay, amzn, csinc].filter((v) => v > 0);
    const avg = vend.length ? vend.reduce((a, b) => a + b, 0) / vend.length : 0;

    results.push({
      Rarity: set.set_rarity || "N/A",
      Set: code,
      SetName: set.set_name || "Unknown Set",
      TCGNow: tcgNow,
      TCGPrev: tcgPrev || null,
      eBay: ebay,
      Amazon: amzn,
      CSInc: csinc,
      Avg: avg,
      Condition: set.set_condition || "Unknown",
    });
  }

  // Sort by TCG price descending (highest first)
  return results.sort((a, b) => (b.TCGNow || 0) - (a.TCGNow || 0));
}

// -----------------------------------------------------------------------------
// Data‑first helper (used by CLI & API)
// -----------------------------------------------------------------------------
export async function getCardData(cardName) {
  const cardList = await fetchCardInfo(cardName);
  const base = cardList[0];

  // Merge printings and images
  base.card_sets = cardList.flatMap((c) => c.card_sets || []);
  base.card_images = cardList.flatMap((c) => c.card_images || []);

  const prevPrices = loadPrevPrices();
  const rows = buildRows(base, prevPrices);

  // Persist cache only for CLI usage (API never mutates CACHE_FILE)
  return { header: base, rows };
}

// -----------------------------------------------------------------------------
// Printing helpers (CLI only)
// -----------------------------------------------------------------------------
function printHeader(card) {
  console.log(chalk.bold.yellow("\n" + "=".repeat(60)));
  console.log(chalk.bold.yellow(`🃏  ${card.name}`));
  console.log(chalk.gray(`${card.type} | ${card.race} | ${card.attribute || ""}`));
  console.log(chalk.gray("-".repeat(60)));

  if (card.desc) {
    console.log(chalk.italic(card.desc));
    console.log(chalk.gray("-".repeat(60)));
  }

  if (card.card_prices?.[0]) {
    const pr = card.card_prices[0];
    const t = new Table({
      head: [chalk.bold("Vendor"), chalk.bold("Price")],
      colAligns: ["left", "right"],
      style: { head: ["yellow"], border: ["gray"] },
    });

    t.push([chalk.cyan("TCGplayer"), chalk.bold(fmt(pr.tcgplayer_price))]);
    t.push([chalk.magenta("eBay"), fmt(pr.ebay_price)]);
    t.push([chalk.red("Amazon"), fmt(pr.amazon_price)]);
    t.push([chalk.blue("CoolStuffInc"), fmt(pr.coolstuffinc_price)]);

    console.log(chalk.bold.yellow("\n💲 Current Market Prices"));
    console.log(t.toString());
  }
}

function printTablePage(rows, page, totalPages) {
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, rows.length);
  const pageRows = rows.slice(start, end);

  const tbl = new Table({
    head: [
      chalk.bold("Rarity"), 
      chalk.bold("Set Code"), 
      chalk.bold("Set Name"), 
      chalk.bold("TCG Price"), 
      chalk.bold("Vendor Prices"),
      chalk.bold("Condition")
    ],
    colAligns: ["left", "center", "left", "right", "left", "left"],
    colWidths: [18, 12, 25, 15, 25, 20],
    style: { head: ["yellow"], border: ["gray"] },
    wordWrap: true,
  });

  pageRows.forEach((r) => {
    const rarityColor = rarityColors[r.Rarity] || chalk.white;
    const conditionColor = conditionColors[r.Condition] || chalk.white;
    
    // Color price based on trend
    let priceDisplay = fmt(r.TCGNow);
    if (r.TCGPrev !== null && r.TCGPrev !== undefined) {
      if (r.TCGNow > r.TCGPrev) {
        priceDisplay = chalk.green(priceDisplay);
      } else if (r.TCGNow < r.TCGPrev) {
        priceDisplay = chalk.red(priceDisplay);
      }
    }
    
    // Format vendor prices
    const vendorPrices = [
      `eBay: ${fmt(r.eBay)}`,
      `Amazon: ${fmt(r.Amazon)}`,
      `CSInc: ${fmt(r.CSInc)}`
    ].join("\n");

    tbl.push([
      rarityColor(r.Rarity),
      chalk.bold(r.Set),
      r.SetName,
      priceDisplay,
      vendorPrices,
      conditionColor(r.Condition || "Unknown")
    ]);
  });

  console.log(chalk.bold.yellow(`\n📦 Printings (${start + 1}-${end} of ${rows.length})`));
  console.log(tbl.toString());
  console.log(chalk.gray(`Page ${page + 1} of ${totalPages} | ▲/▼ to navigate | Q to quit`));
}

// -----------------------------------------------------------------------------
// Pagination controls (CLI)
// -----------------------------------------------------------------------------
function setupPagination(rows) {
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  let currentPage = 0;

  if (rows.length <= PAGE_SIZE) {
    printTablePage(rows, 0, 1);
    return;
  }

  function updateDisplay() {
    console.clear();
    printTablePage(rows, currentPage, totalPages);
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  updateDisplay();

  process.stdin.on("keypress", (str, key) => {
    if (key.name === "q" || key.name === "escape") {
      process.exit(0);
    } else if (key.name === "up" && currentPage > 0) {
      currentPage--;
      updateDisplay();
    } else if (key.name === "down" && currentPage < totalPages - 1) {
      currentPage++;
      updateDisplay();
    }
  });
}

// -----------------------------------------------------------------------------
// CLI entry
// -----------------------------------------------------------------------------
export async function showCardReport(cardName = "Dark Magician") {
  try {
    const { header, rows } = await getCardData(cardName);

    printHeader(header);
    setupPagination(rows);

    // Save snapshot for next‑day delta comparison
    saveTodayPrices(dayjs().format("YYYY-MM-DD"), rows);
  } catch (err) {
    console.error(chalk.red("❌ " + err.message));
  }
}

// -----------------------------------------------------------------------------
// Lightweight JSON API (Express)
// -----------------------------------------------------------------------------
function startApiServer() {
  const app = express();

  app.get("/api/card/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const { header, rows } = await getCardData(name);
      res.json({
        card: {
          id: header.id,
          name: header.name,
          type: header.type,
          race: header.race,
          attribute: header.attribute,
          desc: header.desc,
          prices: header.card_prices?.[0] || {},
          images: header.card_images || [],
        },
        printings: rows,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(chalk.green(`📡  Yugioh Market API is live → http://localhost:${PORT}/api/card/{CARD_NAME}`));
  });
}

// -----------------------------------------------------------------------------
// Module bootstrap
// -----------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const cliArgs = process.argv.slice(2).join(" ");
  const defaultCard = cliArgs || "Dark Magician";

  // 1) Run CLI report (same behavior as before)
  showCardReport(defaultCard);

  // 2) Start API unless user opts out
  if (process.env.ENABLE_API !== "false") {
    startApiServer();
  }
}