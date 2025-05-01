#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const server = new McpServer({
  name: "web-search",
  version: "0.1.0",
});

server.tool(
  "search",
  {
    query: z.string().describe("Search query"),
    limit: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe("Maximum number of results to return (default: 5)"),
  },
  async ({ query, limit }: { query: string; limit?: number }) => {
    try {
      const response = await axios.get("https://www.google.com/search", {
        params: { q: query },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      const $ = cheerio.load(response.data);
      const results: { title: string; url: string; description: string }[] = [];
      const max = Math.min(limit ?? 5, 10);

      $("div.g").each((i, element) => {
        if (i >= max) return false;
        const titleElement = $(element).find("h3");
        const linkElement = $(element).find("a");
        const snippetElement = $(element).find(".VwiC3b");
        const url = linkElement.attr("href");
        if (
          titleElement.length &&
          linkElement.length &&
          url &&
          url.startsWith("http")
        ) {
          results.push({
            title: titleElement.text(),
            url,
            description: snippetElement.text() || "",
          });
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Search error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// HTTP 서버 및 MCP Streamable HTTP Transport 세션 관리
const app = express();
app.use(express.json());

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // 기존 세션 재사용
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // 새로운 세션 생성
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });
    // 세션 종료 시 정리
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET /mcp는 SSE 스트림 미지원(405)
app.get("/mcp", (req: Request, res: Response) => {
  res.status(405).send("Method Not Allowed");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.error(`Web Search MCP HTTP server running on port ${PORT}`);
});
