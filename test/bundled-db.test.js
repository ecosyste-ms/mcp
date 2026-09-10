import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { existsSync } from "fs";
import { databasePath as bundledDbPath } from "@ecosyste-ms/critical";

import {
  initDatabase,
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

// The fixture is built by critical's own createDatabase(), so it proves the
// queries match the builder. This proves they match the database that actually
// ships -- the gap that let getVersionsFromDb query a nonexistent "purl" column.
describe("queries against the bundled critical database", () => {
  let previousDbPath;
  let pkg;

  before(() => {
    previousDbPath = process.env.ECOSYSTEMS_DB_PATH;
    delete process.env.ECOSYSTEMS_DB_PATH;
    initDatabase();
    pkg = getPackageFromDb("npm", "lodash");
  });

  after(() => {
    closeDatabase();
    if (previousDbPath !== undefined) process.env.ECOSYSTEMS_DB_PATH = previousDbPath;
  });

  const cases = {
    getPackageFromDb: () => getPackageFromDb("npm", "lodash"),
    getPackageByPurl: () => getPackageByPurl(pkg.purl),
    getVersionsFromDb: () => getVersionsFromDb(pkg.id),
    getAdvisoriesFromDb: () => getAdvisoriesFromDb(pkg.id),
    getRepoMetadataFromDb: () => getRepoMetadataFromDb(pkg.id),
    searchPackagesInDb: () => searchPackagesInDb("lodash", 3),
    getBuildInfo: () => getBuildInfo(),
    getEcosystemCounts: () => getEcosystemCounts(),
  };

  for (const [name, run] of Object.entries(cases)) {
    it(`${name} runs against the shipped schema`, (t) => {
      if (!existsSync(bundledDbPath)) {
        t.skip("bundled database not available");
        return;
      }
      assert.doesNotThrow(run);
    });
  }
});
