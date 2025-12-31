#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { fetchAPI, VERSION, API_BASE } from "./lib/api.js";
import { ecosystemToRegistry, parsePurl } from "./lib/registries.js";
import { McpError, invalidEcosystem, invalidInput } from "./lib/errors.js";
import {
  initDatabase,
  getDb,
  getPackageFromDb,
  getPackageByPurl,
  getVersionsFromDb,
  getAdvisoriesFromDb,
  getRepoMetadataFromDb,
  searchPackagesInDb,
  getBuildInfo,
  getEcosystemCounts,
} from "./lib/db.js";
import {
  formatPackage,
  formatAdvisories,
  formatRepo,
  formatVersions,
  formatSearchResults,
  formatNumber,
} from "./lib/formatters.js";
import { tools } from "./lib/tools.js";

async function getPackage(ecosystem, name) {
  const local = getPackageFromDb(ecosystem, name);
  if (local) return { source: "local", ...local };

  const registry = ecosystemToRegistry(ecosystem);
  if (!registry) throw invalidEcosystem(ecosystem);

  const encodedName = encodeURIComponent(name);
  const data = await fetchAPI(`/registries/${registry}/packages/${encodedName}`);
  return { source: "api", data };
}

async function lookupPackage(args) {
  if (args.purl) {
    const local = getPackageByPurl(args.purl);
    if (local) return { source: "local", ...local };

    const parsed = parsePurl(args.purl);
    if (parsed) {
      return getPackage(parsed.ecosystem, parsed.name);
    }

    const results = await fetchAPI("/packages/lookup", { purl: args.purl });
    return { source: "api", data: results };
  }

  if (args.ecosystem && args.name) {
    return getPackage(args.ecosystem, args.name);
  }

  if (args.repository_url) {
    const results = await fetchAPI("/packages/lookup", {
      repository_url: args.repository_url,
    });
    return { source: "api", data: results };
  }

  throw invalidInput("Provide ecosystem+name, purl, or repository_url");
}

async function handleToolCall(name, args) {
  switch (name) {
    case "get_package": {
      const pkg = await getPackage(args.ecosystem, args.name);
      if (pkg.source === "local") {
        return formatPackage(pkg);
      }
      return formatPackage(pkg.data);
    }

    case "lookup_package": {
      const result = await lookupPackage(args);
      if (result.source === "local") {
        return formatPackage(result);
      }
      if (Array.isArray(result.data)) {
        return result.data.map(formatPackage).join("\n\n---\n\n");
      }
      return formatPackage(result.data);
    }

    case "get_package_versions": {
      const pkg = getPackageFromDb(args.ecosystem, args.name);
      if (pkg) {
        const versions = getVersionsFromDb(pkg.id);
        return `Versions for ${args.ecosystem}/${args.name}:\n${formatVersions(versions)}`;
      }

      const registry = ecosystemToRegistry(args.ecosystem);
      if (!registry) throw invalidEcosystem(args.ecosystem);

      const encodedName = encodeURIComponent(args.name);
      const versions = await fetchAPI(
        `/registries/${registry}/packages/${encodedName}/versions`
      );
      return `Versions for ${args.ecosystem}/${args.name}:\n${formatVersions(versions)}`;
    }

    case "get_package_advisories": {
      const pkg = getPackageFromDb(args.ecosystem, args.name);
      if (pkg) {
        const advisories = getAdvisoriesFromDb(pkg.id);
        const header = `Security advisories for ${args.ecosystem}/${args.name}: ${advisories.length} found\n\n`;
        return header + formatAdvisories(advisories);
      }

      const registry = ecosystemToRegistry(args.ecosystem);
      if (!registry) throw invalidEcosystem(args.ecosystem);
      const encodedName = encodeURIComponent(args.name);
      const pkgData = await fetchAPI(`/registries/${registry}/packages/${encodedName}`);
      const advisories = pkgData?.advisories || [];
      const header = `Security advisories for ${args.ecosystem}/${args.name}: ${advisories.length} found\n\n`;
      return header + formatAdvisories(advisories);
    }

    case "get_package_repository": {
      const pkg = getPackageFromDb(args.ecosystem, args.name);
      if (pkg) {
        const repo = getRepoMetadataFromDb(pkg.id);
        return `Repository for ${args.ecosystem}/${args.name}:\n${formatRepo(repo, pkg.repository_url)}`;
      }

      const pkgData = await getPackage(args.ecosystem, args.name);
      return `Repository for ${args.ecosystem}/${args.name}:\n${formatRepo(pkgData.data?.repo_metadata, pkgData.data?.repository_url)}`;
    }

    case "get_package_dependents": {
      const registry = ecosystemToRegistry(args.ecosystem);
      if (!registry) throw invalidEcosystem(args.ecosystem);

      const encodedName = encodeURIComponent(args.name);
      const dependents = await fetchAPI(
        `/registries/${registry}/packages/${encodedName}/dependent_packages`,
        { page: args.page, per_page: args.per_page }
      );
      return { source: "api", dependents };
    }

    case "search_packages": {
      if (!getDb()) {
        return "Search requires local database. No database loaded.";
      }

      const results = searchPackagesInDb(args.query, args.limit || 20);
      return `Search results for "${args.query}":\n\n${formatSearchResults(results)}`;
    }

    case "list_registries": {
      const registries = await fetchAPI("/registries");
      const sorted = registries.sort((a, b) => b.packages_count - a.packages_count);
      const shown = sorted.slice(0, 30);
      const lines = shown.map((r) =>
        `${r.ecosystem}: ${r.name} (${formatNumber(r.packages_count)} packages)`
      );
      if (registries.length > 30) {
        lines.push(`... and ${registries.length - 30} more registries`);
      }
      return `Available registries:\n\n${lines.join("\n")}`;
    }

    case "get_database_info": {
      if (!getDb()) {
        return "No local database loaded. Using API fallback for all queries.";
      }

      const buildInfo = getBuildInfo();
      const ecosystems = getEcosystemCounts();

      const total = ecosystems.reduce((sum, e) => sum + e.count, 0);
      const ecoLines = ecosystems.map((e) => `  ${e.ecosystem}: ${e.count}`).join("\n");

      return `Local database loaded:\n  Total packages: ${total}\n  Built: ${buildInfo?.built_at || "unknown"}\n\nPackages by ecosystem:\n${ecoLines}`;
    }

    case "health_check": {
      const checks = [];
      let healthy = true;

      // Check database
      const db = getDb();
      if (db) {
        try {
          const result = db.prepare("SELECT COUNT(*) as count FROM packages").get();
          checks.push(`Database: OK (${result.count} packages)`);
        } catch (err) {
          checks.push(`Database: ERROR - ${err.message}`);
          healthy = false;
        }
      } else {
        checks.push("Database: NOT LOADED (using API fallback)");
      }

      // Check API
      try {
        const start = Date.now();
        await fetchAPI("/registries/npmjs.org", {}, 5000);
        const duration = Date.now() - start;
        checks.push(`API: OK (${duration}ms)`);
      } catch (err) {
        checks.push(`API: ERROR - ${err.message}`);
        healthy = false;
      }

      const status = healthy ? "HEALTHY" : "DEGRADED";
      return `Status: ${status}\nVersion: ${VERSION}\n\n${checks.join("\n")}`;
    }

    default:
      throw invalidInput(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  {
    name: "ecosystems-packages",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleToolCall(name, args || {});
    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorText = error instanceof McpError
      ? error.toString()
      : `Error: ${error.message}`;
    return {
      content: [
        {
          type: "text",
          text: errorText,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  initDatabase();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ecosystems MCP server running on stdio");
}

main().catch(console.error);
