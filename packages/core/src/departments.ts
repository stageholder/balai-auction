export interface Department {
  slug: string;
  label: string;
}

/** Curated auction departments. Sale-level; forward-compatible to a real
 *  Department table in a later phase. */
export const DEPARTMENTS: Department[] = [
  { slug: "paintings", label: "Paintings & Fine Art" },
  { slug: "asian-art", label: "Asian Art" },
  { slug: "watches", label: "Watches" },
  { slug: "jewellery", label: "Jewellery" },
  { slug: "wine", label: "Wine & Spirits" },
  { slug: "books", label: "Books & Manuscripts" },
  { slug: "design", label: "Design & Decorative Arts" },
  { slug: "collectibles", label: "Collectibles" },
];

const BY_SLUG = new Map(DEPARTMENTS.map((d) => [d.slug, d]));

export function isDepartmentSlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export function departmentLabel(slug: string | null): string | null {
  if (slug === null) return null;
  return BY_SLUG.get(slug)?.label ?? null;
}
