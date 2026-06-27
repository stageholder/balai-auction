import { DEPARTMENTS, type Department } from "@auction/core";

/** The departments that actually have at least one published sale, in the
 *  canonical DEPARTMENTS order. Drives the home rail so it never links to an
 *  empty department. */
export function activeDepartments(
  sales: { category: string | null }[]
): Department[] {
  const present = new Set(
    sales.map((s) => s.category).filter((c): c is string => c !== null)
  );
  return DEPARTMENTS.filter((d) => present.has(d.slug));
}
