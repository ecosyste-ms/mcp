import { DatabaseSync } from "node:sqlite";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { databasePath as bundledDbPath } from "@ecosyste-ms/critical";

let db = null;

function findDatabasePath() {
  // A configured path is authoritative: use exactly that file, or no database at
  // all. Falling through to the bundled copy silently ignores the setting.
  const configured = process.env.ECOSYSTEMS_DB_PATH?.trim();
  if (configured !== undefined) {
    if (configured === "" || configured.toLowerCase() === "none") return null;
    if (existsSync(configured)) return configured;
    console.error(`ECOSYSTEMS_DB_PATH does not exist: ${configured}`);
    return null;
  }

  const paths = [
    join(process.cwd(), "critical-packages.db"),
    join(homedir(), ".ecosystems", "critical-packages.db"),
    bundledDbPath,
  ];

  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function initDatabase() {
  const dbPath = findDatabasePath();
  if (dbPath) {
    try {
      const candidate = new DatabaseSync(dbPath, { readOnly: true });
      // Opening reads no data, so a truncated file opens fine and then fails on
      // every query. Read a row here to fall back to the API instead.
      candidate.prepare("SELECT id FROM packages LIMIT 1").get();
      db = candidate;
      console.error(`Using database: ${dbPath}`);
      return db;
    } catch (err) {
      console.error(`Failed to open ${dbPath}: ${err.message}`);
    }
  }
  console.error("No local database found, using API only");
  return null;
}

export function getDb() {
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

const PACKAGE_COLUMNS = `id, ecosystem, name, purl, namespace, description, homepage,
  repository_url, licenses, normalized_licenses, latest_version,
  versions_count, downloads, downloads_period, dependent_packages_count,
  dependent_repos_count, first_release_at, latest_release_at`;

export function getPackageFromDb(ecosystem, name) {
  if (!db) return null;
  return db
    .prepare(`SELECT ${PACKAGE_COLUMNS} FROM packages WHERE ecosystem = ? AND name = ?`)
    .get(ecosystem, name);
}

export function getPackageByPurl(purl) {
  if (!db) return null;
  return db
    .prepare(`SELECT ${PACKAGE_COLUMNS} FROM packages WHERE purl = ?`)
    .get(purl);
}

// critical's versions table only stores package_id and number -- there's no
// published_at to order by, so versions are sorted newest-first by comparing
// dotted numeric release segments instead.
function compareVersionNumbers(a, b) {
  const partsA = a.split(/[.\-+]/);
  const partsB = b.split(/[.\-+]/);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = Number(partsA[i]);
    const numB = Number(partsB[i]);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      if (numA !== numB) return numB - numA;
    } else {
      const segA = partsA[i] ?? "";
      const segB = partsB[i] ?? "";
      if (segA !== segB) return segA < segB ? 1 : -1;
    }
  }
  return 0;
}

export function getVersionsFromDb(packageId) {
  if (!db) return null;
  const versions = db
    .prepare(`SELECT number FROM versions WHERE package_id = ?`)
    .all(packageId);
  return versions.sort((a, b) => compareVersionNumbers(a.number, b.number));
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
