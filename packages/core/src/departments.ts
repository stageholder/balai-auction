export interface Department {
  slug: string;
  label: string;
  blurb: string;
  description: string;
}

/** Curated auction departments. Sale-level; forward-compatible to a real
 *  Department table in a later phase. */
export const DEPARTMENTS: Department[] = [
  {
    slug: "paintings",
    label: "Paintings & Fine Art",
    blurb: "Old Masters to contemporary canvases.",
    description:
      "From Old Master pictures to post-war and contemporary painting, our Paintings & Fine Art sales bring significant works to market. Every lot is catalogued with provenance, condition, and estimate.",
  },
  {
    slug: "asian-art",
    label: "Asian Art",
    blurb: "Classical and modern works from across Asia.",
    description:
      "Ceramics, paintings, and works of art spanning the classical and modern traditions of China, Japan, Southeast Asia, and beyond — offered across dedicated Asian Art sales.",
  },
  {
    slug: "watches",
    label: "Watches",
    blurb: "Fine and collectible timepieces.",
    description:
      "Vintage and modern wristwatches from the houses that define collecting — catalogued by reference, condition, and provenance, with estimates set by specialists.",
  },
  {
    slug: "jewellery",
    label: "Jewellery",
    blurb: "Signed jewels, gemstones, and period pieces.",
    description:
      "Signed jewels, important coloured stones, and period pieces — each lot described with its materials, measurements, and provenance ahead of sale.",
  },
  {
    slug: "wine",
    label: "Wine & Spirits",
    blurb: "Fine wine and rare spirits by the case and bottle.",
    description:
      "Fine wine and rare spirits offered by the case and the bottle, with provenance and storage detailed so collectors can bid with confidence.",
  },
  {
    slug: "books",
    label: "Books & Manuscripts",
    blurb: "Rare books, manuscripts, and printed matter.",
    description:
      "Rare books, autograph manuscripts, maps, and printed matter — catalogued with collation and condition for collectors and institutions alike.",
  },
  {
    slug: "design",
    label: "Design & Decorative Arts",
    blurb: "Furniture, objects, and twentieth-century design.",
    description:
      "Furniture, lighting, ceramics, and decorative objects from the historical to the twentieth-century design canon, presented with maker and period attributions.",
  },
  {
    slug: "collectibles",
    label: "Collectibles",
    blurb: "Memorabilia, curiosities, and collecting categories.",
    description:
      "Memorabilia, curiosities, and the categories that don't sit in a single department — a home for the unexpected and the keenly collected.",
  },
];

const BY_SLUG = new Map(DEPARTMENTS.map((d) => [d.slug, d]));

export function isDepartmentSlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export function departmentLabel(slug: string | null): string | null {
  if (slug === null) return null;
  return BY_SLUG.get(slug)?.label ?? null;
}

export function getDepartment(slug: string): Department | null {
  return BY_SLUG.get(slug) ?? null;
}
