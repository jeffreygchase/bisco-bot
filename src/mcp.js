/**
 * MCP client — calls the discobiscuits.net MCP server
 *
 * The MCP server at process.env.MCP_SERVER_URL exposes 16 tools.
 * This module handles the HTTP transport layer.
 */

const MCP_URL = process.env.MCP_SERVER_URL;

export async function callMcp(toolName, params = {}) {
  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BiscoBot/0.1.0 (github.com/jeffreygchase/bisco-bot)',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }

    return data.result;

  } catch (err) {
    console.error(`MCP call failed for ${toolName}:`, err);
    return { error: err.message };
  }
}
