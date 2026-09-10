// @ecosyste-ms/critical decompresses its bundled database into node_modules on
// first import, without an atomic rename. `node --test` runs files in parallel,
// so on a cold install several processes race that decompression and one reads a
// half-written file. Run once via `pretest` so the file is complete beforehand.
import "@ecosyste-ms/critical";
