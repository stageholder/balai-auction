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
});
