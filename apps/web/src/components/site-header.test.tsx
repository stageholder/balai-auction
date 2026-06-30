import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SiteHeader } from "./site-header";
import { SITE } from "@/lib/site";

describe("SiteHeader", () => {
  it("renders the wordmark linking home", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: SITE.name });
    expect(link).toHaveAttribute("href", "/");
  });

  it("shows the tagline", () => {
    render(<SiteHeader />);
    expect(screen.getByText(SITE.tagline)).toBeInTheDocument();
  });

  it("exposes the primary nav links to their targets", () => {
    render(<SiteHeader />);
    const expected: [string, string][] = [
      ["Auctions", "/auctions"],
      ["Results", "/auctions?lifecycle=past"],
      ["Departments", "/departments"],
      ["Sell", "/sell"],
    ];
    for (const [name, href] of expected) {
      const links = screen.getAllByRole("link", { name });
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toHaveAttribute("href", href);
    }
  });

  it("keeps the search GET form reachable", () => {
    render(<SiteHeader />);
    const search = screen.getByRole("search");
    expect(search).toHaveAttribute("action", "/search");
    expect(search).toHaveAttribute("method", "get");
    expect(
      screen.getByRole("searchbox", { name: /search the catalogue/i }),
    ).toHaveAttribute("name", "q");
  });

  it("offers a mobile menu disclosure alongside the desktop nav", () => {
    render(<SiteHeader />);
    // One inline nav (desktop) + one collapsed disclosure nav (mobile).
    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(
      2,
    );
  });
});
