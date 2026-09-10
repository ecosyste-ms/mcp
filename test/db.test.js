import { describe, it, before, after } from "node:test";
import assert from "node:assert";

import { createFixtureDb, LODASH_ID, REQUESTS_ID } from "../test-helpers/fixture-db.js";
import {
  initDatabase,
  getDb,
  closeDatabase,
  getPackageFromDb,
  getPackageByPurl,
  getVersionsFromDb,
  getAdvisoriesFromDb,
  getRepoMetadataFromDb,
  searchPackagesInDb,
  getBuildInfo,
  getEcosystemCounts,
} from "../lib/db.js";

describe("db module", () => {
  let fixture;
  let previousDbPath;

  before(() => {
    fixture = createFixtureDb();
    previousDbPath = process.env.ECOSYSTEMS_DB_PATH;
    process.env.ECOSYSTEMS_DB_PATH = fixture.path;
    initDatabase();
  });

  after(() => {
    closeDatabase();
    if (previousDbPath === undefined) {
      delete process.env.ECOSYSTEMS_DB_PATH;
    } else {
      process.env.ECOSYSTEMS_DB_PATH = previousDbPath;
    }
    fixture.cleanup();
  });

  describe("initDatabase / getDb", () => {
    it("opens the database", () => {
      assert(getDb() !== null);
    });
  });

  describe("getPackageFromDb", () => {
    it("finds a package by ecosystem and name", () => {
      const pkg = getPackageFromDb("npm", "lodash");
      assert(pkg);
      assert.strictEqual(pkg.name, "lodash");
      assert.strictEqual(pkg.ecosystem, "npm");
      assert.strictEqual(pkg.licenses, "MIT");
      assert.strictEqual(pkg.latest_version, "4.17.21");
      assert.strictEqual(pkg.downloads, 50000000);
    });

    it("returns undefined for missing packages", () => {
      const pkg = getPackageFromDb("npm", "nonexistent");
      assert.strictEqual(pkg, undefined);
    });

    it("finds packages in other ecosystems", () => {
      const pkg = getPackageFromDb("pypi", "requests");
      assert(pkg);
      assert.strictEqual(pkg.ecosystem, "pypi");
    });
  });

  describe("getPackageByPurl", () => {
    it("finds a package by PURL", () => {
      const pkg = getPackageByPurl("pkg:npm/lodash");
      assert(pkg);
      assert.strictEqual(pkg.name, "lodash");
    });

    it("returns undefined for unknown PURLs", () => {
      const pkg = getPackageByPurl("pkg:npm/nonexistent");
      assert.strictEqual(pkg, undefined);
    });
  });

  describe("getVersionsFromDb", () => {
    it("returns versions newest-first", () => {
      const versions = getVersionsFromDb(LODASH_ID);
      assert.deepStrictEqual(
        versions.map((v) => v.number),
        ["4.17.21", "4.17.20", "4.9.0"]
      );
    });

    it("orders version segments numerically, not lexicographically", () => {
      // "4.9.0" > "4.17.21" as a string; it must still sort last.
      const versions = getVersionsFromDb(LODASH_ID);
      assert.strictEqual(versions.at(-1).number, "4.9.0");
    });

    it("returns empty array for package with no versions", () => {
      const versions = getVersionsFromDb(REQUESTS_ID);
      assert(Array.isArray(versions));
      assert.strictEqual(versions.length, 0);
    });
  });

  describe("getAdvisoriesFromDb", () => {
    it("returns advisories for a package", () => {
      const advisories = getAdvisoriesFromDb(LODASH_ID);
      assert.strictEqual(advisories.length, 1);
      assert.strictEqual(advisories[0].uuid, "GHSA-xxxx-xxxx-xxxx");
      assert.strictEqual(advisories[0].severity, "HIGH");
      assert.strictEqual(advisories[0].cvss_score, 7.5);
    });

    it("returns empty array for package with no advisories", () => {
      const advisories = getAdvisoriesFromDb(REQUESTS_ID);
      assert.strictEqual(advisories.length, 0);
    });
  });

  describe("getRepoMetadataFromDb", () => {
    it("returns repo metadata", () => {
      const repo = getRepoMetadataFromDb(LODASH_ID);
      assert(repo);
      assert.strictEqual(repo.full_name, "lodash/lodash");
      assert.strictEqual(repo.language, "JavaScript");
      assert.strictEqual(repo.stargazers_count, 50000);
    });

    it("returns undefined for package without metadata", () => {
      const repo = getRepoMetadataFromDb(REQUESTS_ID);
      assert.strictEqual(repo, undefined);
    });
  });

  describe("searchPackagesInDb", () => {
    it("finds packages by name", () => {
      const results = searchPackagesInDb("lodash");
      assert(results.length > 0);
      assert.strictEqual(results[0].name, "lodash");
    });

    it("finds packages by description", () => {
      const results = searchPackagesInDb("utility");
      assert(results.length > 0);
      assert.strictEqual(results[0].name, "lodash");
    });

    it("returns empty for no matches", () => {
      const results = searchPackagesInDb("zzzznonexistentzzzz");
      assert.strictEqual(results.length, 0);
    });

    it("respects limit parameter", () => {
      const results = searchPackagesInDb("library", 1);
      assert(results.length <= 1);
    });

    it("treats hyphenated queries as a literal phrase", () => {
      // Unquoted, FTS5 reads the hyphen as NOT and this would throw or mismatch.
      assert.doesNotThrow(() => searchPackagesInDb("better-sqlite3"));
    });
  });

  describe("getBuildInfo", () => {
    it("returns build info", () => {
      const info = getBuildInfo();
      assert(info);
      assert.strictEqual(info.built_at, "2024-01-15T10:00:00Z");
    });
  });

  describe("getEcosystemCounts", () => {
    it("returns counts grouped by ecosystem", () => {
      const counts = getEcosystemCounts();
      assert(Array.isArray(counts));
      assert.strictEqual(counts.length, 2);

      const npm = counts.find((c) => c.ecosystem === "npm");
      const pypi = counts.find((c) => c.ecosystem === "pypi");
      assert.strictEqual(npm.count, 1);
      assert.strictEqual(pypi.count, 1);
    });
  });
});

describe("db module without a database", () => {
  let previousDbPath;

  before(() => {
    previousDbPath = process.env.ECOSYSTEMS_DB_PATH;
    process.env.ECOSYSTEMS_DB_PATH = "none";
    initDatabase();
  });

  after(() => {
    closeDatabase();
    if (previousDbPath === undefined) {
      delete process.env.ECOSYSTEMS_DB_PATH;
    } else {
      process.env.ECOSYSTEMS_DB_PATH = previousDbPath;
    }
  });

  it("does not load a database when explicitly disabled", () => {
    assert.strictEqual(getDb(), null);
  });

  it("returns null from queries instead of throwing", () => {
    assert.strictEqual(getPackageFromDb("npm", "lodash"), null);
    assert.strictEqual(getPackageByPurl("pkg:npm/lodash"), null);
    assert.strictEqual(getVersionsFromDb(LODASH_ID), null);
    assert.strictEqual(getBuildInfo(), null);
  });
});
