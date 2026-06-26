import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { LotRecord } from "@auction/db";
import { LotCard } from "./lot-card";

const lot: LotRecord = {
  id: "lot-1",
  saleId: "sale-1",
  lotNumber: 3,
  title: "Coastal Morning",
  description: "Provenance on request.",
  images: ["https://picsum.photos/seed/lot-3/800/1000"],
  estimateLow: 5_000_000,
  estimateHigh: 9_000_000,
  startingPrice: 2_500_000,
  reserve: 5_000_000,
  closesAt: new Date("2026-07-08T00:00:00.000Z"),
  status: "live",
  consignorId: null,
  createdAt: new Date("2026-06-20T00:00:00.000Z"),
};

describe("LotCard", () => {
  it("shows the lot number and title", () => {
    render(<LotCard lot={lot} />);
    expect(screen.getByText("Coastal Morning")).toBeInTheDocument();
    expect(screen.getByText(/Lot 3/)).toBeInTheDocument();
  });

  it("shows the estimate range formatted in rupiah", () => {
    render(<LotCard lot={lot} />);
    const estimate = screen.getByText(/Rp\s?5\.000\.000\s*[–-]\s*Rp\s?9\.000\.000/);
    expect(estimate).toBeInTheDocument();
  });

  it("renders the first image with the title as alt text", () => {
    render(<LotCard lot={lot} />);
    expect(screen.getByAltText("Coastal Morning")).toBeInTheDocument();
  });

  it("links to the lot page", () => {
    render(<LotCard lot={lot} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/lots/lot-1");
  });
});
