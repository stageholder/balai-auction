import type { IncrementTable } from "@auction/core";
import { prisma } from "./client";
import { createSale } from "./repositories/sales";
import { createLot } from "./repositories/lots";

const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

const day = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const startsAt = new Date(Date.now() + day);
  const endsAt = new Date(Date.now() + 8 * day);

  const sale = await createSale(prisma, {
    title: "Modern & Contemporary Art",
    description:
      "A curated selection of modern and contemporary works on paper and canvas.",
    startsAt,
    endsAt,
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });

  const lots = [
    { title: "Untitled (Study in Ochre)", low: 8_000_000, high: 12_000_000 },
    { title: "Figure in Repose", low: 15_000_000, high: 25_000_000 },
    { title: "Coastal Morning", low: 5_000_000, high: 9_000_000 },
    { title: "Still Life with Mangosteen", low: 20_000_000, high: 30_000_000 },
    { title: "Abstraction No. 7", low: 3_000_000, high: 6_000_000 },
    { title: "Portrait of a Collector", low: 40_000_000, high: 60_000_000 },
  ];

  let n = 0;
  for (const lot of lots) {
    n += 1;
    await createLot(prisma, {
      saleId: sale.id,
      lotNumber: n,
      title: lot.title,
      description:
        "Provenance available on request. Condition report on the lot page.",
      images: [`https://picsum.photos/seed/lot-${n}/800/1000`],
      estimateLow: lot.low,
      estimateHigh: lot.high,
      startingPrice: Math.round(lot.low / 2),
      reserve: lot.low,
      closesAt: endsAt,
    });
  }

  console.log(`Seeded sale "${sale.title}" with ${lots.length} lots.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
