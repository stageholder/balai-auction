import { describe, it, expect } from "vitest";
import {
  DEPARTMENTS,
  departmentLabel,
  isDepartmentSlug,
  getDepartment,
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

describe("department editorial copy", () => {
  it("every department has a non-empty blurb and description", () => {
    for (const d of DEPARTMENTS) {
      expect(d.blurb.trim().length).toBeGreaterThan(0);
      expect(d.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("getDepartment returns the entry for a known slug, else null", () => {
    expect(getDepartment("watches")?.label).toBe("Watches");
    expect(getDepartment("bogus")).toBeNull();
  });
});
