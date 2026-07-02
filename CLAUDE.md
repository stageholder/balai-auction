# auction-web

Christie's-style commercial auction house (Next.js monorepo, pnpm workspaces).

## Ruflo — always use on this project

Ruflo is activated for this project (`.mcp.json` registers the `ruflo` MCP server;
`.claude/settings.json` wires the lifecycle hooks; `.claude/helpers/` holds the hook
scripts). **On every task in this repo, work through ruflo** rather than ad-hoc:

- **Before starting** any multi-file task or feature, check `<system-reminder>` tags
  for `[INTELLIGENCE]` pattern suggestions, then load ruflo MCP tools via ToolSearch.
- **Memory first** — `memory_search` / `recall` before you start (surface prior art,
  decisions, patterns); `memory_store` the durable outcome when you finish.
- **Route work** through `hooks_route` and, for anything spanning ≥2 independent
  workstreams, `swarm_init` + `agent_spawn` (or the ruflo-* specialist subagents:
  `ruflo-core:coder`, `ruflo-core:researcher`, `ruflo-core:reviewer`, etc.).
- **Record decisions** as ADRs (`/adr-create`) when a choice is architecturally
  significant; review changes against accepted ADRs before merging.
- Use the ruflo skills for their domains: `/audit` (security), `/testgen` (tests),
  `/migrate` (DB migrations), `/ruflo-memory`, `/swarm`, `/goals`.

Key MCP tools to reach for: `memory_store`, `memory_search`, `hooks_route`,
`swarm_init`, `agent_spawn`. If a ruflo tool is deferred, load it with ToolSearch
before calling.

## Workflow

Pre-production: commit directly to `main`, no feature branches. Keep changes working,
compelling, and user-complete (Christie's-grade) without over-engineering.
