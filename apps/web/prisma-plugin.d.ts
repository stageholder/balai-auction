// The plugin ships no type declarations; this is enough for next.config.ts.
declare module "@prisma/nextjs-monorepo-workaround-plugin" {
  export class PrismaPlugin {
    constructor();
    apply(compiler: unknown): void;
  }
}
