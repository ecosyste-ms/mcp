export const tools = [
  {
    name: "get_package",
    description:
      "Get package info: license, latest version, description, downloads, dependencies count. Use when asked about a specific package.",
    inputSchema: {
      type: "object",
      properties: {
        ecosystem: {
          type: "string",
          description: "npm, pypi, rubygems, cargo, go, maven, nuget, packagist, hex, pub, etc.",
        },
        name: { type: "string", description: "Package name" },
      },
      required: ["ecosystem", "name"],
    },
  },
  {
    name: "lookup_package",
    description:
      "Find packages by PURL (pkg:npm/lodash) or GitHub URL. Use when given a package URL or repo link instead of ecosystem+name.",
    inputSchema: {
      type: "object",
      properties: {
        purl: {
          type: "string",
          description: "Package URL, e.g. pkg:npm/lodash, pkg:pypi/requests",
        },
        ecosystem: { type: "string", description: "Package ecosystem" },
        name: { type: "string", description: "Package name" },
        repository_url: {
          type: "string",
          description: "GitHub/GitLab URL to find associated packages",
        },
      },
    },
  },
  {
    name: "get_package_versions",
    description:
      "List package versions with release dates. Use for version history, release timeline, or finding when a version was published.",
    inputSchema: {
      type: "object",
      properties: {
        ecosystem: { type: "string", description: "Package ecosystem" },
        name: { type: "string", description: "Package name" },
      },
      required: ["ecosystem", "name"],
    },
  },
  {
    name: "get_package_advisories",
    description:
      "Check security vulnerabilities and CVEs for a package. Use for security audits, vulnerability checks, or when asked if a package is safe.",
    inputSchema: {
      type: "object",
      properties: {
        ecosystem: { type: "string", description: "Package ecosystem" },
        name: { type: "string", description: "Package name" },
      },
      required: ["ecosystem", "name"],
    },
  },
  {
    name: "get_package_repository",
    description:
      "Get GitHub stats: stars, forks, language, open issues. Use when asked about popularity, maintenance, or source repo.",
    inputSchema: {
      type: "object",
      properties: {
        ecosystem: { type: "string", description: "Package ecosystem" },
        name: { type: "string", description: "Package name" },
      },
      required: ["ecosystem", "name"],
    },
  },
  {
    name: "get_package_dependents",
    description:
      "List packages that depend on this one (reverse dependencies). Use to gauge adoption or find usage examples.",
    inputSchema: {
      type: "object",
      properties: {
        ecosystem: { type: "string", description: "Package ecosystem" },
        name: { type: "string", description: "Package name" },
        page: { type: "number", description: "Page number" },
        per_page: { type: "number", description: "Results per page (max 100)" },
      },
      required: ["ecosystem", "name"],
    },
  },
  {
    name: "search_packages",
    description:
      "Find packages by keyword across all ecosystems. Use when looking for packages that do something specific.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_registries",
    description:
      "List supported package registries and ecosystems with package counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_database_info",
    description:
      "Show local database stats: total packages, ecosystems breakdown, build date. Use to verify data availability.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "health_check",
    description:
      "Check server health: database connectivity, API availability. Use to diagnose connection issues.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];
