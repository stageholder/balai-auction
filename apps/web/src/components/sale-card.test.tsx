import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { SaleRecord } from "@auction/db";
import { SaleCard } from "./sale-card";

const sale: SaleRecord = {
  id: "sale-1",
  title: "Modern & Contemporary Art",
  description: "A curated selection.",
  startsAt: new Date("2026-07-01T00:00:00.000Z"),
  endsAt: new Date("2026-07-08T00:00:00.000Z"),
  buyersPremiumPct: 20,
  taxPct: 11,
  incrementTable: [{ upTo: null, step: 100_000 }],
  status: "scheduled",
  createdAt: new Date("2026-06-20T00:00:00.000Z"),
};

describe("SaleCard", () => {
  it("shows the sale title", () => {
    render(<SaleCard sale={sale} />);
    expect(screen.getByText("Modern & Contemporary Art")).toBeInTheDocument();
  });

  it("links to the sale page", () => {
    render(<SaleCard sale={sale} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/sales/sale-1");
  });
});
