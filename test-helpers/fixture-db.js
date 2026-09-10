import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createDatabase } from "@ecosyste-ms/critical";

export const LODASH_ID = 1;
export const REQUESTS_ID = 2;

/**
 * Builds a small, deterministic database in a fresh temp directory, using the
 * same createDatabase() that builds the shipped one -- so the fixture cannot
 * drift from the schema production queries run against.
 * Returns { path, cleanup }; callers must call cleanup().
 */
export function createFixtureDb() {
  const dir = mkdtempSync(join(tmpdir(), "ecosystems-db-test-"));
  const path = join(dir, "test.db");

  const db = createDatabase(path);

  const insertPackage = db.prepare(`
    INSERT INTO packages (id, ecosystem, name, purl, description, licenses, downloads,
      latest_version, versions_count, dependent_packages_count, repository_url, homepage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPackage.run(LODASH_ID, "npm", "lodash", "pkg:npm/lodash", "Utility library",
    "MIT", 50000000, "4.17.21", 114, 150000,
    "https://github.com/lodash/lodash", "https://lodash.com");

  insertPackage.run(REQUESTS_ID, "pypi", "requests", "pkg:pypi/requests", "HTTP library",
    "Apache-2.0", 100000000, "2.31.0", 200, 80000,
    "https://github.com/psf/requests", "https://requests.readthedocs.io");

  const insertVersion = db.prepare(
    "INSERT INTO versions (package_id, number) VALUES (?, ?)"
  );
  // Neither insertion nor table order ("4.9.0" > "4.17.21" as text) matches the
  // newest-first order callers expect, so the sorting has to be tested.
  for (const number of ["4.9.0", "4.17.20", "4.17.21"]) {
    insertVersion.run(LODASH_ID, number);
  }

  db.prepare(`
    INSERT INTO advisories (package_id, uuid, url, title, severity, cvss_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(LODASH_ID, "GHSA-xxxx-xxxx-xxxx", "https://ghsa.example.com/1",
    "Prototype Pollution", "HIGH", 7.5);

  db.prepare(`
    INSERT INTO repo_metadata (package_id, owner, repo_name, full_name, host, language,
      stargazers_count, forks_count, open_issues_count, archived, fork)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(LODASH_ID, "lodash", "lodash", "lodash/lodash", "GitHub", "JavaScript",
    50000, 5000, 42, 0, 0);

  db.prepare(`
    INSERT INTO build_info (id, built_at, package_count, version_count, advisory_count)
    VALUES (1, ?, ?, ?, ?)
  `).run("2024-01-15T10:00:00Z", 2, 3, 1);

  db.close();

  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
