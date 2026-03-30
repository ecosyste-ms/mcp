import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "..", "index.js");

function startServer() {
  const proc = spawn("node", [SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ECOSYSTEMS_DB_PATH: "" },
  });

  let buffer = "";
  const pending = new Map(); // id -> { resolve, reject, timer }
  const unmatched = []; // responses/notifications without a waiter

  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.trim()) continue;

      const msg = JSON.parse(line);
      const id = msg.id;

      if (id !== undefined && pending.has(id)) {
        const { resolve, timer } = pending.get(id);
        pending.delete(id);
        clearTimeout(timer);
        resolve(msg);
      } else {
        unmatched.push(msg);
      }
    }
  });

  function send(message) {
    proc.stdin.write(JSON.stringify(message) + "\n");
  }

  function request(message, timeoutMs = 5000) {
    send(message);
    const id = message.id;
    if (id === undefined) return Promise.resolve(null);

    // Check if already received
    const idx = unmatched.findIndex((m) => m.id === id);
    if (idx !== -1) {
      return Promise.resolve(unmatched.splice(idx, 1)[0]);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for response to id=${id}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
  }

  function close() {
    proc.stdin.end();
    proc.kill();
  }

  return { send, request, close, proc, unmatched };
}

async function initServer(server) {
  const response = await server.request({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  });

  server.send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  return response;
}

describe("MCP protocol", () => {
  let server;

  before(async () => {
    server = startServer();
  });

  after(() => {
    server.close();
  });

  describe("initialization", () => {
    it("responds to initialize with server info and capabilities", async () => {
      const response = await initServer(server);

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 0);
      assert(response.result);
      assert(response.result.protocolVersion);
      assert(response.result.serverInfo);
      assert.strictEqual(response.result.serverInfo.name, "ecosystems-packages");
      assert(response.result.serverInfo.version);
      assert(response.result.capabilities);
      assert(response.result.capabilities.tools);
    });
  });

  describe("tools/list", () => {
    it("returns list of tools", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 1);
      assert(Array.isArray(response.result.tools));
      assert(response.result.tools.length > 0);

      const toolNames = response.result.tools.map((t) => t.name);
      assert(toolNames.includes("get_package"));
      assert(toolNames.includes("search_packages"));
      assert(toolNames.includes("health_check"));

      for (const tool of response.result.tools) {
        assert(tool.name, "tool has name");
        assert(tool.description, "tool has description");
        assert(tool.inputSchema, "tool has inputSchema");
      }
    });
  });

  describe("tools/call", () => {
    it("calls get_database_info and returns text content", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_database_info",
          arguments: {},
        },
      });

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 2);
      assert(response.result);
      assert(Array.isArray(response.result.content));
      assert.strictEqual(response.result.content[0].type, "text");
      assert(response.result.content[0].text.length > 0);
    });

    it("returns error content for unknown tool", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "nonexistent_tool",
          arguments: {},
        },
      });

      assert.strictEqual(response.id, 3);
      assert(response.result);
      assert.strictEqual(response.result.isError, true);
      assert(response.result.content[0].text.includes("Unknown tool"));
    });

    it("calls search_packages and returns text content", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "search_packages",
          arguments: { query: "lodash" },
        },
      });

      assert.strictEqual(response.id, 4);
      assert(response.result);
      assert(Array.isArray(response.result.content));
      assert.strictEqual(response.result.content[0].type, "text");
    });

    it("returns error for invalid ecosystem", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "get_package",
          arguments: { ecosystem: "fakesystem", name: "whatever" },
        },
      });

      assert.strictEqual(response.id, 5);
      assert.strictEqual(response.result.isError, true);
      assert(response.result.content[0].text.includes("fakesystem"));
    });
  });

  describe("unknown methods", () => {
    it("returns method not found error for unknown method", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: 6,
        method: "nonexistent/method",
      });

      assert.strictEqual(response.id, 6);
      assert(response.error);
      assert.strictEqual(response.error.code, -32601);
    });
  });

  describe("notifications", () => {
    it("does not respond to notifications (no id)", async () => {
      server.send({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 999 },
      });

      // Send a real request to verify the server is still alive
      const response = await server.request({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/list",
      });

      assert.strictEqual(response.id, 7);
      assert(response.result.tools);
    });
  });

  describe("message format", () => {
    it("preserves request id types (number)", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: 42,
        method: "tools/list",
      });

      assert.strictEqual(response.id, 42);
    });

    it("preserves request id types (string)", async () => {
      const response = await server.request({
        jsonrpc: "2.0",
        id: "abc-123",
        method: "tools/list",
      });

      assert.strictEqual(response.id, "abc-123");
    });
  });
});
