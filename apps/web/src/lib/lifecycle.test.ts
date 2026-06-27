import { describe, it, expect } from "vitest";
import { partitionSalesByLifecycle, type LifecycleSale } from "./lifecycle";

function s(
  id: string,
  status: string,
  startsAt: string,
  endsAt: string
): LifecycleSale {
  return { id, status, startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
}

describe("partitionSalesByLifecycle", () => {
  const sales = [
    s("u2", "scheduled", "2026-08-01", "2026-08-05"),
    s("live1", "live", "2026-07-01", "2026-07-10"),
    s("p1", "closed", "2026-05-01", "2026-05-05"),
    s("u1", "scheduled", "2026-07-20", "2026-07-25"),
    s("p2", "closed", "2026-06-01", "2026-06-05"),
    s("draftish", "draft", "2026-09-01", "2026-09-05"),
  ];

  it("splits by lifecycle", () => {
    const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);
    expect(liveNow.map((x) => x.id)).toEqual(["live1"]);
    expect(upcoming.map((x) => x.id)).toEqual(["u1", "u2"]); // soonest first
    expect(past.map((x) => x.id)).toEqual(["p2", "p1"]); // most recent first
  });

  it("ignores statuses that are neither live/scheduled/closed", () => {
    const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);
    const all = [...liveNow, ...upcoming, ...past].map((x) => x.id);
    expect(all).not.toContain("draftish");
  });
});
