const PROTOCOL_VERSION = "2025-03-26";
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

export function createServer(serverInfo, capabilities) {
  const handlers = new Map();

  function setRequestHandler(method, handler) {
    handlers.set(method, handler);
  }

  async function handleMessage(message) {
    // Notifications have no id -- ignore them
    if (message.id === undefined) return null;

    const { id, method, params } = message;

    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
          capabilities,
          serverInfo,
        },
      };
    }

    const handler = handlers.get(method);
    if (!handler) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: METHOD_NOT_FOUND,
          message: `Method not found: ${method}`,
        },
      };
    }

    try {
      const result = await handler({ method, params });
      return { jsonrpc: "2.0", id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: INTERNAL_ERROR,
          message: err.message,
        },
      };
    }
  }

  function start() {
    let buffer = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", async (chunk) => {
      buffer += chunk;
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);
          const response = await handleMessage(message);
          if (response) {
            process.stdout.write(JSON.stringify(response) + "\n");
          }
        } catch {
          // Malformed JSON -- ignore per JSON-RPC spec for notifications
        }
      }
    });
  }

  return { setRequestHandler, start };
}
