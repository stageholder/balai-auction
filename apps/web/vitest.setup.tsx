import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

// next/image renders an <img> in tests; map it to a plain img so RTL queries work.
vi.mock("next/image", () => ({
  default: ({ src, alt, fill, ...rest }: any) => {
    const resolved = typeof src === "string" ? src : (src?.src ?? "");
    return <img src={resolved} alt={alt} {...rest} />;
  },
}));

// next/link renders an <a> wrapping its children.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
