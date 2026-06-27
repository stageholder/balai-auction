import "server-only";

// Re-export the Prisma singleton and all repositories for Server Components.
// The "server-only" import above makes any client-component import a build error.
export { prisma } from "@auction/db";
export * from "@auction/db";
