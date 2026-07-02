/**
 * Demo dataset seed. Re-runnable: resets the catalogue (sales/lots/bids/invoices/
 * payouts/watchlist/consignment-requests) and rebuilds a rich, presentable set —
 * a live sale, two scheduled sales, and two closed sales whose results are produced
 * by the REAL engine (appendBid → closeLot → invoice), plus a consignor whose sold
 * lots are settled and paid (payouts populated) and a few Sell-with-us requests.
 *
 * Login accounts are created separately by `pnpm seed:admin` (Supabase auth);
 * the users here are domain-only records that own bids / consignments.
 *
 * Images are local, themed files under apps/web/public/seed/ (served at /seed/*.jpg),
 * so the catalogue renders offline with no remote-image dependency.
 */
import type { IncrementTable } from "@auction/core";
import { prisma } from "./client";
import { createSale, updateSaleStatus } from "./repositories/sales";
import { createLot } from "./repositories/lots";
import { appendBid } from "./repositories/bids";
import { closeLot } from "./repositories/close";
import { markInvoicePaid } from "./repositories/invoices";
import {
  setConsignorKycStatus,
  setConsignorAml,
  setConsignorPayoutAccount,
} from "./repositories/users";
import { createConsignmentRequest } from "./repositories/consignment-requests";
import type { LotStatus, UserRole } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const INCREMENTS: IncrementTable = [
  { upTo: 5_000_000, step: 100_000 },
  { upTo: 20_000_000, step: 250_000 },
  { upTo: 100_000_000, step: 1_000_000 },
  { upTo: null, step: 5_000_000 },
];

async function resetCatalogue(): Promise<void> {
  await prisma.payout.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.watchlist.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.consignmentRequest.deleteMany();
}

async function ensureUser(email: string, role: UserRole): Promise<{ id: string }> {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    if (existing.role !== role) {
      await prisma.user.update({ where: { id: existing.id }, data: { role } });
    }
    return { id: existing.id };
  }
  return prisma.user.create({ data: { email, role } });
}

interface LotSpec {
  title: string;
  image: string; // file under /public/seed (no extension)
  low: number;
  high: number;
  /** When set on a closed sale, drives a realistic hammer through the engine. */
  hammer?: number;
  status?: LotStatus;
}

async function makeSale(opts: {
  title: string;
  description: string;
  category: string;
  status: "scheduled" | "live" | "closed";
  startsAt: Date;
  endsAt: Date;
}) {
  return createSale(prisma, {
    title: opts.title,
    description: opts.description,
    category: opts.category,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    buyersPremiumPct: 20,
    taxPct: 11,
    sellerCommissionPct: 10,
    incrementTable: INCREMENTS,
    status: opts.status === "closed" ? "live" : opts.status, // closed set after lots resolve
  });
}

/** A MediaAsset descriptor for a local /public/seed image (not Supabase). */
function localSeedImage(url: string) {
  return {
    bucket: "seed",
    path: url,
    url,
    contentType: "image/jpeg",
    sizeBytes: 0,
    originalName: null,
  };
}

async function addLot(
  saleId: string,
  n: number,
  spec: LotSpec,
  lotsCloseAt: Date,
  consignorId?: string
) {
  return createLot(prisma, {
    saleId,
    lotNumber: n,
    title: spec.title,
    description:
      "Provenance and a full condition report are available on request. " +
      "Estimates do not include the buyer's premium.",
    media: [localSeedImage(`/seed/${spec.image}.jpg`)],
    estimateLow: spec.low,
    estimateHigh: spec.high,
    startingPrice: Math.round(spec.low * 0.5),
    reserve: spec.low,
    closesAt: lotsCloseAt,
    consignorId: consignorId ?? null,
    status: spec.status,
  });
}

async function main(): Promise<void> {
  await resetCatalogue();

  // Domain-only users that own bids / consignments (not login accounts).
  const collectorA = await ensureUser("a.collector@demo.balai", "buyer");
  const collectorB = await ensureUser("b.collector@demo.balai", "buyer");
  const consignor = await ensureUser("v.delacroix@demo.balai", "consignor");
  await setConsignorKycStatus(prisma, consignor.id, "approved");
  await setConsignorAml(prisma, consignor.id, { amlStatus: "cleared" });
  await setConsignorPayoutAccount(prisma, consignor.id, {
    bankCode: "BCA",
    accountNumber: "1234567890",
    accountHolder: "Valerie Delacroix",
  });

  // Drive a closed lot to a sold/paid result through the real engine.
  async function sellAndPay(lotId: string, hammerTarget: number): Promise<void> {
    // Two proxy bids: B underbids, A wins; hammer ≈ B's max + one increment.
    await appendBid(prisma, {
      lotId,
      bidderId: collectorB.id,
      maxAmount: hammerTarget,
      amount: hammerTarget,
    });
    await appendBid(prisma, {
      lotId,
      bidderId: collectorA.id,
      maxAmount: Math.round(hammerTarget * 1.25),
      amount: Math.round(hammerTarget * 1.25),
    });
    const result = await closeLot(prisma, lotId, new Date());
    if (result.outcome !== "sold") {
      console.warn(`  ! lot ${lotId} expected sold, got ${result.outcome}`);
      return;
    }
    const invoice = await prisma.invoice.findUnique({ where: { lotId } });
    if (invoice) await markInvoicePaid(prisma, invoice.id);
  }

  let salesCount = 0;
  let lotsCount = 0;

  // ── 1. LIVE — Modern & Contemporary Art (paintings) ──────────────────────
  {
    const closeAt = new Date(now + 6 * DAY);
    const sale = await makeSale({
      title: "Modern & Contemporary Art",
      description:
        "A curated evening sale of modern and contemporary works on paper and canvas.",
      category: "paintings",
      status: "live",
      startsAt: new Date(now - DAY),
      endsAt: closeAt,
    });
    const lots: LotSpec[] = [
      { title: "Untitled (Composition in Ochre)", image: "paintings-1", low: 18_000_000, high: 28_000_000, status: "live" },
      { title: "Figure in Repose", image: "paintings-2", low: 35_000_000, high: 55_000_000, status: "live" },
      { title: "Coastal Morning, Bali", image: "paintings-3", low: 12_000_000, high: 18_000_000, status: "live" },
      { title: "Still Life with Mangosteen", image: "paintings-4", low: 22_000_000, high: 32_000_000, status: "live" },
      { title: "Abstraction No. 7", image: "paintings-5", low: 8_000_000, high: 14_000_000, status: "queued" },
      { title: "Portrait of a Collector", image: "paintings-6", low: 60_000_000, high: 90_000_000, status: "queued" },
    ];
    let n = 0;
    for (const spec of lots) {
      n += 1;
      const lot = await addLot(sale.id, n, spec, closeAt);
      lotsCount += 1;
      if (n === 1) {
        await appendBid(prisma, { lotId: lot.id, bidderId: collectorA.id, maxAmount: 14_000_000, amount: 14_000_000 });
        await appendBid(prisma, { lotId: lot.id, bidderId: collectorB.id, maxAmount: 16_000_000, amount: 16_000_000 });
      }
      if (n === 2) {
        await appendBid(prisma, { lotId: lot.id, bidderId: collectorB.id, maxAmount: 30_000_000, amount: 30_000_000 });
      }
    }
    salesCount += 1;
  }

  // ── 2. SCHEDULED — Important Watches ─────────────────────────────────────
  {
    const closeAt = new Date(now + 12 * DAY);
    const sale = await makeSale({
      title: "Important Watches",
      description:
        "Fine wristwatches from the great houses — Rolex, Patek Philippe, Audemars Piguet and more.",
      category: "watches",
      status: "scheduled",
      startsAt: new Date(now + 5 * DAY),
      endsAt: closeAt,
    });
    const lots: LotSpec[] = [
      { title: "Rolex Cosmograph Daytona, Stainless Steel", image: "watches-1", low: 180_000_000, high: 260_000_000 },
      { title: "Patek Philippe Calatrava, Yellow Gold", image: "watches-2", low: 220_000_000, high: 320_000_000 },
      { title: "Omega Speedmaster Professional 'Moonwatch'", image: "watches-3", low: 60_000_000, high: 90_000_000 },
      { title: "Audemars Piguet Royal Oak", image: "watches-4", low: 350_000_000, high: 500_000_000 },
      { title: "Cartier Tank Louis, Yellow Gold", image: "watches-5", low: 90_000_000, high: 140_000_000 },
      { title: "Vintage Heuer Carrera Chronograph", image: "watches-6", low: 70_000_000, high: 110_000_000 },
    ];
    let n = 0;
    for (const spec of lots) {
      n += 1;
      await addLot(sale.id, n, { ...spec, status: "queued" }, closeAt);
      lotsCount += 1;
    }
    salesCount += 1;
  }

  // ── 3. CLOSED — Magnificent Jewels (results) ─────────────────────────────
  {
    const closeAt = new Date(now - 2 * DAY);
    const sale = await makeSale({
      title: "Magnificent Jewels",
      description:
        "Signed jewels and important coloured stones from a private collection.",
      category: "jewellery",
      status: "closed",
      startsAt: new Date(now - 9 * DAY),
      endsAt: closeAt,
    });
    const lots: LotSpec[] = [
      { title: "Diamond Solitaire Ring, 3.2 carats", image: "jewellery-1", low: 200_000_000, high: 300_000_000, hammer: 260_000_000 },
      { title: "Emerald and Diamond Necklace", image: "jewellery-2", low: 320_000_000, high: 480_000_000, hammer: 400_000_000 },
      { title: "Burmese Sapphire Earrings", image: "jewellery-3", low: 150_000_000, high: 220_000_000, hammer: 185_000_000 },
      { title: "Natural Pearl Strand", image: "jewellery-4", low: 90_000_000, high: 140_000_000 }, // unsold
      { title: "Gold and Diamond Bracelet", image: "jewellery-5", low: 60_000_000, high: 90_000_000, hammer: 78_000_000 },
      { title: "Cabochon Gemstone Brooch", image: "jewellery-6", low: 40_000_000, high: 70_000_000 }, // unsold
    ];
    let n = 0;
    for (const spec of lots) {
      n += 1;
      const lot = await addLot(sale.id, n, spec, closeAt, consignor.id);
      lotsCount += 1;
      if (spec.hammer) await sellAndPay(lot.id, spec.hammer);
      else await closeLot(prisma, lot.id, new Date()); // no bids → unsold
    }
    await updateSaleStatus(prisma, sale.id, "closed");
    salesCount += 1;
  }

  // ── 4. CLOSED — Fine Asian Art (results) ─────────────────────────────────
  {
    const closeAt = new Date(now - 9 * DAY);
    const sale = await makeSale({
      title: "Fine Asian Art",
      description:
        "Imperial porcelain, jade carvings and gilt bronzes spanning five centuries.",
      category: "asian-art",
      status: "closed",
      startsAt: new Date(now - 16 * DAY),
      endsAt: closeAt,
    });
    const lots: LotSpec[] = [
      { title: "Blue and White 'Dragon' Vase, Qing Dynasty", image: "asian-1", low: 150_000_000, high: 220_000_000, hammer: 190_000_000 },
      { title: "Famille Rose Porcelain Bowl", image: "asian-2", low: 80_000_000, high: 120_000_000, hammer: 105_000_000 },
      { title: "Carved Jade Mountain", image: "asian-3", low: 60_000_000, high: 100_000_000 }, // unsold
      { title: "Gilt Bronze Figure of Buddha, Ming Dynasty", image: "asian-4", low: 200_000_000, high: 300_000_000, hammer: 250_000_000 },
      { title: "Celadon Glazed Censer", image: "asian-5", low: 40_000_000, high: 70_000_000 }, // unsold
    ];
    let n = 0;
    for (const spec of lots) {
      n += 1;
      const lot = await addLot(sale.id, n, spec, closeAt, consignor.id);
      lotsCount += 1;
      if (spec.hammer) await sellAndPay(lot.id, spec.hammer);
      else await closeLot(prisma, lot.id, new Date());
    }
    await updateSaleStatus(prisma, sale.id, "closed");
    salesCount += 1;
  }

  // ── 5. SCHEDULED — Finest & Rarest Wines ─────────────────────────────────
  {
    const closeAt = new Date(now + 19 * DAY);
    const sale = await makeSale({
      title: "Finest and Rarest Wines",
      description:
        "Blue-chip Burgundy, Bordeaux and Champagne from impeccable cellars.",
      category: "wine",
      status: "scheduled",
      startsAt: new Date(now + 12 * DAY),
      endsAt: closeAt,
    });
    const lots: LotSpec[] = [
      { title: "Domaine de la Romanée-Conti 2015 (3 bottles)", image: "wine-1", low: 80_000_000, high: 120_000_000 },
      { title: "Château Pétrus 2010 (6 bottles)", image: "wine-2", low: 150_000_000, high: 220_000_000 },
      { title: "Krug Clos du Mesnil 2006 (3 bottles)", image: "wine-3", low: 60_000_000, high: 90_000_000 },
      { title: "Penfolds Grange 1998 (12 bottles)", image: "wine-4", low: 70_000_000, high: 110_000_000 },
      { title: "Château d'Yquem 1990 (6 bottles)", image: "wine-5", low: 40_000_000, high: 70_000_000 },
    ];
    let n = 0;
    for (const spec of lots) {
      n += 1;
      await addLot(sale.id, n, { ...spec, status: "queued" }, closeAt);
      lotsCount += 1;
    }
    salesCount += 1;
  }

  // ── Sell-with-us inquiries (staff triage queue) ──────────────────────────
  await createConsignmentRequest(prisma, {
    name: "Amelia Hartono",
    email: "amelia.hartono@example.com",
    phone: "+62 812 1111 2222",
    category: "paintings",
    itemTitle: "Oil painting attributed to a listed Indonesian modernist",
    itemDescription:
      "Inherited canvas, roughly 80×60cm, signed lower right. Seeking an estimate.",
    sellerEstimate: 50_000_000,
  });
  await createConsignmentRequest(prisma, {
    name: "Bramantyo W.",
    email: "bram.w@example.com",
    phone: null,
    category: "watches",
    itemTitle: "Rolex Submariner, 1970s, with papers",
    itemDescription: "Full set, recently serviced. Considering consignment next season.",
    sellerEstimate: null,
  });
  await createConsignmentRequest(prisma, {
    name: "Clara Tanuwidjaja",
    email: "clara.t@example.com",
    phone: "+62 813 3333 4444",
    category: "jewellery",
    itemTitle: "Pair of diamond ear clips",
    itemDescription: "Approx. 2ct total, with a vintage box. Would like a valuation.",
    sellerEstimate: 30_000_000,
  });

  // Give every lot a small multi-image gallery (its own image + two siblings
  // from the same sale) so the lot page gallery + hover-zoom has thumbnails.
  const allSales = await prisma.sale.findMany({ select: { id: true } });
  for (const s of allSales) {
    const lots = await prisma.lot.findMany({
      where: { saleId: s.id },
      orderBy: { lotNumber: "asc" },
      select: {
        id: true,
        media: { orderBy: { sortOrder: "asc" }, select: { url: true } },
      },
    });
    const pool = lots
      .map((l) => l.media[0]?.url ?? null)
      .filter((x): x is string => !!x);
    if (pool.length === 0) continue;
    for (let i = 0; i < lots.length; i++) {
      const gallery = [pool[(i + 1) % pool.length], pool[(i + 2) % pool.length]]
        .filter((v): v is string => typeof v === "string")
        .filter((v) => v !== pool[i]) // don't duplicate the lot's own lead image
        .filter((v, idx, a) => a.indexOf(v) === idx);
      const lotId = lots[i]?.id;
      if (lotId && gallery.length > 0) {
        // The lead image is already sortOrder 0; append the siblings after it.
        await prisma.mediaAsset.createMany({
          data: gallery.map((url, idx) => ({
            lotId,
            kind: "lot_image" as const,
            ...localSeedImage(url),
            sortOrder: idx + 1,
          })),
        });
      }
    }
  }

  console.log(
    `Seeded ${salesCount} sales / ${lotsCount} lots ` +
      `(1 live, 2 scheduled, 2 closed with realized prices), ` +
      `consignor payouts, and 3 Sell-with-us requests.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
