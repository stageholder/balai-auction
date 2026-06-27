import { describe, it, expect } from "vitest";
import { activeDepartments } from "./departments-view";

describe("activeDepartments", () => {
  it("returns only departments present in the sales, in DEPARTMENTS order", () => {
    const sales = [
      { category: "watches" },
      { category: null },
      { category: "wine" },
      { category: "watches" }, // duplicate
      { category: "not-a-real-slug" }, // ignored (not in DEPARTMENTS)
    ];
    const result = activeDepartments(sales).map((d) => d.slug);
    // canonical DEPARTMENTS order has paintings, asian-art, watches, jewellery, wine, …
    expect(result).toEqual(["watches", "wine"]);
  });

  it("returns empty when no sale has a known department", () => {
    expect(activeDepartments([{ category: null }, { category: "bogus" }])).toEqual([]);
  });
});
