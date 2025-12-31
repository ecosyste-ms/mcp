import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { ecosystemToRegistry, parsePurl } from "../lib/registries.js";

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
    db = new Database(dbPath);

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
