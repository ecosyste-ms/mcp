import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { ecosystemToRegistry, parsePurl } from "../lib/registries.js";
import {
  formatNumber,
  formatPackage,
  formatAdvisories,
  formatRepo,
  formatVersions,
  formatSearchResults,
} from "../lib/formatters.js";
import {
  McpError,
  ErrorCode,
  invalidEcosystem,
  packageNotFound,
  apiError,
  apiTimeout,
  databaseError,
  invalidInput,
} from "../lib/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  const path = join(__dirname, "fixtures", `${name}.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("ecosystemToRegistry", () => {
  it("maps npm to npmjs.org", () => {
    assert.strictEqual(ecosystemToRegistry("npm"), "npmjs.org");
  });

  it("maps pypi to pypi.org", () => {
    assert.strictEqual(ecosystemToRegistry("pypi"), "pypi.org");
  });

  it("maps rubygems to rubygems.org", () => {
    assert.strictEqual(ecosystemToRegistry("rubygems"), "rubygems.org");
  });

  it("is case insensitive", () => {
    assert.strictEqual(ecosystemToRegistry("NPM"), "npmjs.org");
    assert.strictEqual(ecosystemToRegistry("PyPi"), "pypi.org");
  });

  it("returns null for unknown ecosystems", () => {
    assert.strictEqual(ecosystemToRegistry("unknown"), null);
    assert.strictEqual(ecosystemToRegistry(null), null);
  });
});

describe("parsePurl", () => {
  it("parses simple PURLs", () => {
    const result = parsePurl("pkg:npm/lodash");
    assert.deepStrictEqual(result, {
      ecosystem: "npm",
      name: "lodash",
      version: undefined,
    });
  });

  it("parses PURLs with versions", () => {
    const result = parsePurl("pkg:npm/lodash@4.17.21");
    assert.deepStrictEqual(result, {
      ecosystem: "npm",
      name: "lodash",
      version: "4.17.21",
    });
  });

  it("parses scoped npm packages", () => {
    const result = parsePurl("pkg:npm/%40babel/core@7.0.0");
    assert.deepStrictEqual(result, {
      ecosystem: "npm",
      name: "%40babel/core",
      version: "7.0.0",
    });
  });

  it("returns null for invalid PURLs", () => {
    assert.strictEqual(parsePurl("not-a-purl"), null);
    assert.strictEqual(parsePurl("npm/lodash"), null);
  });
});

describe("API fixtures", () => {
  it("registries fixture has expected structure", () => {
    const registries = loadFixture("registries");
    assert(Array.isArray(registries));
    assert(registries.length > 0);
    assert(registries.some((r) => r.name === "npmjs.org"));
  });

  it("npm registry fixture has expected fields", () => {
    const registry = loadFixture("registry-npm");
    assert.strictEqual(registry.name, "npmjs.org");
    assert.strictEqual(registry.ecosystem, "npm");
    assert(registry.packages_count > 0);
  });

  it("lodash package fixture has expected fields", () => {
    const pkg = loadFixture("package-lodash");
    assert.strictEqual(pkg.name, "lodash");
    assert.strictEqual(pkg.ecosystem, "npm");
    assert(pkg.licenses);
    assert(pkg.repository_url);
    assert(pkg.versions_count > 0);
  });

  it("lodash lookup fixture returns array", () => {
    const results = loadFixture("lookup-lodash");
    assert(Array.isArray(results));
    assert(results.length > 0);
    assert.strictEqual(results[0].name, "lodash");
  });

  it("lodash versions fixture has version numbers", () => {
    const versions = loadFixture("versions-lodash");
    assert(Array.isArray(versions));
    assert(versions.length > 0);
    assert(versions[0].number);
    assert(versions[0].published_at);
  });
});

describe("SQLite database queries", () => {
  let db;
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ecosystems-test-"));
    const dbPath = join(tmpDir, "test.db");
    db = new DatabaseSync(dbPath);

    db.exec(`
      CREATE TABLE packages (
        id INTEGER PRIMARY KEY,
        ecosystem TEXT NOT NULL,
        name TEXT NOT NULL,
        purl TEXT,
        description TEXT,
        licenses TEXT,
        repository_url TEXT,
        downloads INTEGER
      );

      CREATE UNIQUE INDEX idx_packages_ecosystem_name
        ON packages(ecosystem, name);
      CREATE INDEX idx_packages_purl ON packages(purl);

      CREATE TABLE versions (
        id INTEGER PRIMARY KEY,
        package_id INTEGER NOT NULL,
        number TEXT NOT NULL,
        published_at TEXT,
        FOREIGN KEY (package_id) REFERENCES packages(id)
      );

      CREATE TABLE advisories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_id INTEGER NOT NULL,
        uuid TEXT NOT NULL,
        url TEXT,
        title TEXT,
        description TEXT,
        severity TEXT,
        cvss_score REAL,
        published_at TEXT,
        FOREIGN KEY (package_id) REFERENCES packages(id)
      );

      CREATE TABLE repo_metadata (
        package_id INTEGER PRIMARY KEY,
        stargazers_count INTEGER,
        forks_count INTEGER,
        language TEXT,
        full_name TEXT,
        FOREIGN KEY (package_id) REFERENCES packages(id)
      );
    `);

    db.prepare(`
      INSERT INTO packages (id, ecosystem, name, purl, description, licenses, downloads)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      "npm",
      "lodash",
      "pkg:npm/lodash",
      "Lodash utility library",
      "MIT",
      1000000
    );

    db.prepare(`
      INSERT INTO versions (id, package_id, number, published_at)
      VALUES (?, ?, ?, ?)
    `).run(1, 1, "4.17.21", "2021-02-20");

    db.prepare(`
      INSERT INTO advisories (package_id, uuid, title, severity, cvss_score)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, "GHSA-xxxx-xxxx-xxxx", "Prototype Pollution", "HIGH", 7.5);

    db.prepare(`
      INSERT INTO repo_metadata (package_id, stargazers_count, forks_count, language, full_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 50000, 5000, "JavaScript", "lodash/lodash");
  });

  it("finds package by ecosystem and name", () => {
    const row = db
      .prepare("SELECT * FROM packages WHERE ecosystem = ? AND name = ?")
      .get("npm", "lodash");

    assert(row);
    assert.strictEqual(row.name, "lodash");
    assert.strictEqual(row.ecosystem, "npm");
    assert.strictEqual(row.licenses, "MIT");
  });

  it("finds package by PURL", () => {
    const row = db
      .prepare("SELECT * FROM packages WHERE purl = ?")
      .get("pkg:npm/lodash");

    assert(row);
    assert.strictEqual(row.name, "lodash");
  });

  it("returns null for missing packages", () => {
    const row = db
      .prepare("SELECT * FROM packages WHERE ecosystem = ? AND name = ?")
      .get("npm", "nonexistent");

    assert.strictEqual(row, undefined);
  });

  it("gets versions for a package", () => {
    const rows = db
      .prepare("SELECT * FROM versions WHERE package_id = ?")
      .all(1);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].number, "4.17.21");
  });

  it("gets advisories for a package", () => {
    const rows = db
      .prepare("SELECT uuid, severity, title FROM advisories WHERE package_id = ?")
      .all(1);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].uuid, "GHSA-xxxx-xxxx-xxxx");
    assert.strictEqual(rows[0].severity, "HIGH");
  });

  it("gets repo metadata for a package", () => {
    const row = db
      .prepare("SELECT * FROM repo_metadata WHERE package_id = ?")
      .get(1);

    assert(row);
    assert.strictEqual(row.stargazers_count, 50000);
    assert.strictEqual(row.language, "JavaScript");
  });

  after(() => {
    db.close();
    rmSync(tmpDir, { recursive: true });
  });
});

describe("formatNumber", () => {
  it("formats billions", () => {
    assert.strictEqual(formatNumber(1_500_000_000), "1.5B");
  });

  it("formats millions", () => {
    assert.strictEqual(formatNumber(2_300_000), "2.3M");
  });

  it("formats thousands", () => {
    assert.strictEqual(formatNumber(45_600), "45.6K");
  });

  it("formats small numbers as-is", () => {
    assert.strictEqual(formatNumber(999), "999");
  });

  it("returns 0 for falsy values", () => {
    assert.strictEqual(formatNumber(0), "0");
    assert.strictEqual(formatNumber(null), "0");
    assert.strictEqual(formatNumber(undefined), "0");
  });
});

describe("formatPackage", () => {
  it("formats a full package", () => {
    const result = formatPackage({
      ecosystem: "npm",
      name: "lodash",
      description: "Utility library",
      licenses: "MIT",
      latest_version: "4.17.21",
      downloads: 50000000,
      dependent_packages_count: 150000,
      repository_url: "https://github.com/lodash/lodash",
      homepage: "https://lodash.com",
    });

    assert(result.includes("npm/lodash"));
    assert(result.includes("Utility library"));
    assert(result.includes("MIT"));
    assert(result.includes("4.17.21"));
    assert(result.includes("50.0M"));
    assert(result.includes("150.0K packages"));
    assert(result.includes("https://github.com/lodash/lodash"));
    assert(result.includes("https://lodash.com"));
  });

  it("handles missing optional fields", () => {
    const result = formatPackage({
      ecosystem: "npm",
      name: "tiny",
      licenses: null,
      latest_version: null,
      downloads: 0,
    });

    assert(result.includes("npm/tiny"));
    assert(result.includes("Unknown")); // licenses or version
    assert(!result.includes("Repository:"));
    assert(!result.includes("Homepage:"));
  });

  it("uses latest_release_number as fallback", () => {
    const result = formatPackage({
      ecosystem: "pypi",
      name: "requests",
      latest_release_number: "2.31.0",
      downloads: 100,
    });

    assert(result.includes("2.31.0"));
  });
});

describe("formatVersions", () => {
  it("formats version list", () => {
    const result = formatVersions([
      { number: "2.0.0", published_at: "2024-01-15T00:00:00Z" },
      { number: "1.0.0", published_at: "2023-06-01T00:00:00Z" },
    ]);

    assert(result.includes("2.0.0 (2024-01-15)"));
    assert(result.includes("1.0.0 (2023-06-01)"));
  });

  it("handles missing published_at", () => {
    const result = formatVersions([{ number: "1.0.0" }]);
    assert(result.includes("1.0.0 (unknown date)"));
  });

  it("truncates to limit", () => {
    const versions = Array.from({ length: 15 }, (_, i) => ({
      number: `${i}.0.0`,
      published_at: "2024-01-01",
    }));

    const result = formatVersions(versions, 5);
    assert(result.includes("and 10 more versions"));
  });

  it("returns message for empty list", () => {
    assert.strictEqual(formatVersions([]), "No versions found.");
  });
});

describe("formatAdvisories", () => {
  it("formats advisories", () => {
    const result = formatAdvisories([
      {
        severity: "HIGH",
        title: "Prototype Pollution",
        url: "https://ghsa.example.com/1",
      },
    ]);

    assert(result.includes("[HIGH] Prototype Pollution"));
    assert(result.includes("https://ghsa.example.com/1"));
  });

  it("shows uuid when url is missing", () => {
    const result = formatAdvisories([
      { severity: "LOW", title: "Minor issue", uuid: "GHSA-1234" },
    ]);

    assert(result.includes("GHSA-1234"));
  });

  it("shows affected version ranges from API", () => {
    const result = formatAdvisories([
      {
        severity: "CRITICAL",
        title: "RCE",
        url: "https://example.com",
        packages: [
          {
            versions: [
              {
                vulnerable_version_range: "< 2.0.0",
                first_patched_version: "2.0.0",
              },
            ],
          },
        ],
      },
    ]);

    assert(result.includes("Affected: < 2.0.0"));
    assert(result.includes("Fixed in: 2.0.0"));
  });

  it("handles multiple version ranges", () => {
    const result = formatAdvisories([
      {
        severity: "HIGH",
        title: "Bug",
        url: "https://example.com",
        packages: [
          {
            versions: [
              { vulnerable_version_range: ">= 1.0, < 1.5", first_patched_version: "1.5.0" },
              { vulnerable_version_range: ">= 2.0, < 2.3", first_patched_version: "2.3.0" },
            ],
          },
        ],
      },
    ]);

    assert(result.includes("Affected: >= 1.0, < 1.5 OR >= 2.0, < 2.3"));
    assert(result.includes("Fixed in: 1.5.0, 2.3.0"));
  });

  it("truncates to limit", () => {
    const advisories = Array.from({ length: 15 }, (_, i) => ({
      severity: "MEDIUM",
      title: `Issue ${i}`,
      uuid: `GHSA-${i}`,
    }));

    const result = formatAdvisories(advisories, 5);
    assert(result.includes("and 10 more advisories"));
  });

  it("returns message for empty list", () => {
    assert.strictEqual(formatAdvisories([]), "No known security advisories.");
  });
});

describe("formatRepo", () => {
  it("formats full repo metadata", () => {
    const result = formatRepo({
      full_name: "lodash/lodash",
      host: "GitHub",
      language: "JavaScript",
      stargazers_count: 50000,
      forks_count: 5000,
      open_issues_count: 42,
    });

    assert(result.includes("lodash/lodash"));
    assert(result.includes("GitHub"));
    assert(result.includes("JavaScript"));
    assert(result.includes("50.0K"));
    assert(result.includes("5.0K"));
    assert(result.includes("42"));
  });

  it("handles host as object", () => {
    const result = formatRepo({
      full_name: "test/repo",
      host: { name: "GitHub" },
    });

    assert(result.includes("GitHub"));
  });

  it("shows archived and fork status", () => {
    const result = formatRepo({
      full_name: "old/repo",
      archived: true,
      fork: true,
    });

    assert(result.includes("Archived"));
    assert(result.includes("(Fork)"));
  });

  it("falls back to repo URL when no metadata", () => {
    const result = formatRepo(null, "https://github.com/foo/bar");
    assert.strictEqual(result, "Repository: https://github.com/foo/bar");
  });

  it("returns message when nothing available", () => {
    const result = formatRepo(null, null);
    assert.strictEqual(result, "No repository metadata available.");
  });
});

describe("formatSearchResults", () => {
  it("formats results with descriptions", () => {
    const result = formatSearchResults([
      { ecosystem: "npm", name: "express", description: "Web framework" },
      { ecosystem: "npm", name: "koa", description: "Next gen framework" },
    ]);

    assert(result.includes("npm/express - Web framework"));
    assert(result.includes("npm/koa - Next gen framework"));
  });

  it("handles missing descriptions", () => {
    const result = formatSearchResults([
      { ecosystem: "npm", name: "mystery" },
    ]);

    assert(result.includes("npm/mystery"));
    assert(!result.includes(" - "));
  });

  it("truncates long descriptions", () => {
    const result = formatSearchResults([
      { ecosystem: "npm", name: "verbose", description: "A".repeat(200) },
    ]);

    // description should be capped at 80 chars
    const descPart = result.split(" - ")[1];
    assert(descPart.length <= 80);
  });

  it("returns message for empty results", () => {
    assert.strictEqual(formatSearchResults([]), "No packages found.");
  });
});

describe("McpError", () => {
  it("has correct properties", () => {
    const err = new McpError("TEST_CODE", "test message", "details", true);
    assert.strictEqual(err.code, "TEST_CODE");
    assert.strictEqual(err.message, "test message");
    assert.strictEqual(err.details, "details");
    assert.strictEqual(err.retryable, true);
    assert(err instanceof Error);
  });

  it("toString includes all parts", () => {
    const err = new McpError("CODE", "msg", "detail", true);
    const str = err.toString();
    assert(str.includes("[CODE]"));
    assert(str.includes("msg"));
    assert(str.includes("detail"));
    assert(str.includes("may retry"));
  });

  it("toString omits optional parts when absent", () => {
    const err = new McpError("CODE", "msg");
    const str = err.toString();
    assert.strictEqual(str, "[CODE] msg");
  });

  it("toJSON serializes correctly", () => {
    const err = new McpError("CODE", "msg", "detail", false);
    const json = err.toJSON();
    assert.deepStrictEqual(json, {
      code: "CODE",
      message: "msg",
      details: "detail",
      retryable: false,
    });
  });
});

describe("error factory functions", () => {
  it("invalidEcosystem", () => {
    const err = invalidEcosystem("foobar");
    assert.strictEqual(err.code, ErrorCode.INVALID_ECOSYSTEM);
    assert(err.message.includes("foobar"));
  });

  it("packageNotFound", () => {
    const err = packageNotFound("npm", "nonexistent");
    assert.strictEqual(err.code, ErrorCode.PACKAGE_NOT_FOUND);
    assert(err.message.includes("npm/nonexistent"));
  });

  it("apiError marks 5xx as retryable", () => {
    assert.strictEqual(apiError(500, "Internal", "/test").retryable, true);
    assert.strictEqual(apiError(429, "Rate limited", "/test").retryable, true);
    assert.strictEqual(apiError(404, "Not Found", "/test").retryable, false);
  });

  it("apiTimeout is always retryable", () => {
    const err = apiTimeout("/test", 5000);
    assert.strictEqual(err.retryable, true);
    assert(err.message.includes("5000"));
  });

  it("databaseError", () => {
    const err = databaseError("disk full");
    assert.strictEqual(err.code, ErrorCode.DATABASE_ERROR);
    assert(err.message.includes("disk full"));
  });

  it("invalidInput", () => {
    const err = invalidInput("bad arg");
    assert.strictEqual(err.code, ErrorCode.INVALID_INPUT);
  });
});
