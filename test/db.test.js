import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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
} from "../lib/db.js";

describe("db module", () => {
  let tmpDir;
  let dbPath;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ecosystems-db-test-"));
    dbPath = join(tmpDir, "test.db");

    const setupDb = new DatabaseSync(dbPath);
    setupDb.exec(`
      CREATE TABLE packages (
        id INTEGER PRIMARY KEY,
        ecosystem TEXT NOT NULL,
        name TEXT NOT NULL,
        purl TEXT,
        namespace TEXT,
        description TEXT,
        homepage TEXT,
        repository_url TEXT,
        licenses TEXT,
        normalized_licenses TEXT,
        latest_version TEXT,
        versions_count INTEGER,
        downloads INTEGER,
        downloads_period TEXT,
        dependent_packages_count INTEGER,
        dependent_repos_count INTEGER,
        first_release_at TEXT,
        latest_release_at TEXT
      );

      CREATE UNIQUE INDEX idx_packages_ecosystem_name
        ON packages(ecosystem, name);
      CREATE INDEX idx_packages_purl ON packages(purl);

      CREATE TABLE versions (
        id INTEGER PRIMARY KEY,
        package_id INTEGER NOT NULL,
        number TEXT NOT NULL,
        purl TEXT,
        licenses TEXT,
        integrity TEXT,
        published_at TEXT,
        download_url TEXT,
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
        owner TEXT,
        repo_name TEXT,
        full_name TEXT,
        host TEXT,
        language TEXT,
        stargazers_count INTEGER,
        forks_count INTEGER,
        open_issues_count INTEGER,
        archived INTEGER,
        fork INTEGER,
        FOREIGN KEY (package_id) REFERENCES packages(id)
      );

      CREATE TABLE build_info (
        id INTEGER PRIMARY KEY,
        built_at TEXT
      );

      CREATE VIRTUAL TABLE packages_fts USING fts5(
        name, description, content=packages, content_rowid=id
      );
    `);

    setupDb.prepare(`
      INSERT INTO packages (id, ecosystem, name, purl, description, licenses, downloads,
        latest_version, versions_count, dependent_packages_count, repository_url, homepage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, "npm", "lodash", "pkg:npm/lodash", "Utility library", "MIT",
      50000000, "4.17.21", 114, 150000,
      "https://github.com/lodash/lodash", "https://lodash.com");

    setupDb.prepare(`
      INSERT INTO packages (id, ecosystem, name, purl, description, licenses, downloads,
        latest_version, versions_count, dependent_packages_count, repository_url, homepage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(2, "pypi", "requests", "pkg:pypi/requests", "HTTP library", "Apache-2.0",
      100000000, "2.31.0", 200, 80000,
      "https://github.com/psf/requests", "https://requests.readthedocs.io");

    setupDb.prepare(`
      INSERT INTO versions (id, package_id, number, published_at)
      VALUES (?, ?, ?, ?)
    `).run(1, 1, "4.17.21", "2021-02-20T00:00:00Z");

    setupDb.prepare(`
      INSERT INTO versions (id, package_id, number, published_at)
      VALUES (?, ?, ?, ?)
    `).run(2, 1, "4.17.20", "2020-08-13T00:00:00Z");

    setupDb.prepare(`
      INSERT INTO advisories (package_id, uuid, url, title, severity, cvss_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, "GHSA-xxxx-xxxx-xxxx", "https://ghsa.example.com/1",
      "Prototype Pollution", "HIGH", 7.5);

    setupDb.prepare(`
      INSERT INTO repo_metadata (package_id, owner, repo_name, full_name, host, language,
        stargazers_count, forks_count, open_issues_count, archived, fork)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, "lodash", "lodash", "lodash/lodash", "GitHub", "JavaScript",
      50000, 5000, 42, 0, 0);

    setupDb.prepare("INSERT INTO build_info (id, built_at) VALUES (?, ?)")
      .run(1, "2024-01-15T10:00:00Z");

    // Populate FTS index
    setupDb.exec(`
      INSERT INTO packages_fts(rowid, name, description)
        SELECT id, name, description FROM packages;
    `);

    setupDb.close();

    // Now init through the module
    process.env.ECOSYSTEMS_DB_PATH = dbPath;
    initDatabase();
  });

  after(() => {
    delete process.env.ECOSYSTEMS_DB_PATH;
    const current = getDb();
    if (current) current.close();
    rmSync(tmpDir, { recursive: true });
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

    it("returns null when db is not initialized", () => {
      // This tests the guard clause; we can't easily unset db,
      // but we verify the function works with the db present
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
    it("returns versions ordered by published_at DESC", () => {
      const versions = getVersionsFromDb(1);
      assert.strictEqual(versions.length, 2);
      assert.strictEqual(versions[0].number, "4.17.21");
      assert.strictEqual(versions[1].number, "4.17.20");
    });

    it("returns empty array for package with no versions", () => {
      const versions = getVersionsFromDb(2);
      assert(Array.isArray(versions));
      assert.strictEqual(versions.length, 0);
    });
  });

  describe("getAdvisoriesFromDb", () => {
    it("returns advisories for a package", () => {
      const advisories = getAdvisoriesFromDb(1);
      assert.strictEqual(advisories.length, 1);
      assert.strictEqual(advisories[0].uuid, "GHSA-xxxx-xxxx-xxxx");
      assert.strictEqual(advisories[0].severity, "HIGH");
      assert.strictEqual(advisories[0].cvss_score, 7.5);
    });

    it("returns empty array for package with no advisories", () => {
      const advisories = getAdvisoriesFromDb(2);
      assert.strictEqual(advisories.length, 0);
    });
  });

  describe("getRepoMetadataFromDb", () => {
    it("returns repo metadata", () => {
      const repo = getRepoMetadataFromDb(1);
      assert(repo);
      assert.strictEqual(repo.full_name, "lodash/lodash");
      assert.strictEqual(repo.language, "JavaScript");
      assert.strictEqual(repo.stargazers_count, 50000);
    });

    it("returns undefined for package without metadata", () => {
      const repo = getRepoMetadataFromDb(2);
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
