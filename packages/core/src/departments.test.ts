import { describe, it, expect } from "vitest";
import {
  DEPARTMENTS,
  departmentLabel,
  isDepartmentSlug,
} from "./departments";

describe("departments", () => {
  it("has unique, non-empty slugs and labels", () => {
    expect(DEPARTMENTS.length).toBeGreaterThan(0);
    const slugs = DEPARTMENTS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const d of DEPARTMENTS) {
      expect(d.slug).toMatch(/^[a-z-]+$/);
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it("isDepartmentSlug recognises known slugs only", () => {
    expect(isDepartmentSlug("watches")).toBe(true);
    expect(isDepartmentSlug("not-a-department")).toBe(false);
    expect(isDepartmentSlug("")).toBe(false);
  });

  it("departmentLabel maps slug → label, else null", () => {
    expect(departmentLabel("watches")).toBe("Watches");
    expect(departmentLabel("bogus")).toBeNull();
    expect(departmentLabel(null)).toBeNull();
  });
});
