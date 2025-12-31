import Database from "better-sqlite3";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DB_PATHS = [
  process.env.ECOSYSTEMS_DB_PATH,
  join(process.cwd(), "critical-packages.db"),
  join(homedir(), ".ecosystems", "critical-packages.db"),
].filter(Boolean);

let db = null;

export function initDatabase() {
  for (const dbPath of DB_PATHS) {
    if (existsSync(dbPath)) {
      try {
        db = new Database(dbPath, { readonly: true });
        console.error(`Using database: ${dbPath}`);
        return db;
      } catch (err) {
        console.error(`Failed to open ${dbPath}: ${err.message}`);
      }
    }
  }
  console.error("No local database found, using API only");
  return null;
}

export function getDb() {
  return db;
}

export function getPackageFromDb(ecosystem, name) {
  if (!db) return null;
  return db
    .prepare(`SELECT id, ecosystem, name, purl, namespace, description, homepage,
      repository_url, licenses, normalized_licenses, latest_version,
      versions_count, downloads, downloads_period, dependent_packages_count,
      dependent_repos_count, first_release_at, latest_release_at
      FROM packages WHERE ecosystem = ? AND name = ?`)
    .get(ecosystem, name);
}

export function getPackageByPurl(purl) {
  if (!db) return null;
  return db
    .prepare(`SELECT id, ecosystem, name, purl, namespace, description, homepage,
      repository_url, licenses, normalized_licenses, latest_version,
      versions_count, downloads, downloads_period, dependent_packages_count,
      dependent_repos_count, first_release_at, latest_release_at
      FROM packages WHERE purl = ?`)
    .get(purl);
}

export function getVersionsFromDb(packageId) {
  if (!db) return null;
  return db
    .prepare(`SELECT number, purl, licenses, integrity, published_at, download_url
      FROM versions WHERE package_id = ? ORDER BY published_at DESC`)
    .all(packageId);
}

export function getAdvisoriesFromDb(packageId) {
  if (!db) return null;
  return db
    .prepare(
      "SELECT uuid, url, title, description, severity, cvss_score, published_at FROM advisories WHERE package_id = ?"
    )
    .all(packageId);
}

export function getRepoMetadataFromDb(packageId) {
  if (!db) return null;
  return db
    .prepare(`SELECT owner, repo_name, full_name, host, language,
      stargazers_count, forks_count, open_issues_count, archived, fork
      FROM repo_metadata WHERE package_id = ?`)
    .get(packageId);
}

export function searchPackagesInDb(query, limit = 20) {
  if (!db) return null;
  // Quote the query to handle special FTS5 characters like hyphens
  // FTS5 treats - as NOT operator, so "better-sqlite3" becomes "better NOT sqlite3"
  // Quoting the entire phrase treats it as a literal search
  const quotedQuery = `"${query.replace(/"/g, '""')}"`;
  return db
    .prepare(
      `SELECT p.ecosystem, p.name, p.description, p.licenses, p.downloads,
        p.dependent_packages_count, p.repository_url
       FROM packages p
       JOIN packages_fts fts ON p.id = fts.rowid
       WHERE packages_fts MATCH ?
       LIMIT ?`
    )
    .all(quotedQuery, limit);
}

export function getBuildInfo() {
  if (!db) return null;
  return db.prepare("SELECT * FROM build_info WHERE id = 1").get();
}

export function getEcosystemCounts() {
  if (!db) return null;
  return db
    .prepare(
      "SELECT ecosystem, COUNT(*) as count FROM packages GROUP BY ecosystem ORDER BY count DESC"
    )
    .all();
}
