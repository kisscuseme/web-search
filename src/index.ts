#!/usr/bin/env node
import axios from "axios";
import * as cheerio from "cheerio";
import express, { Request, Response } from "express";

const app = express();
app.use(express.json());

app.post("/mcp", async (req: Request, res: Response) => {
  const duckduckgo_search = async ({
    query,
    limit,
  }: {
    query: string;
    limit?: number;
  }) => {
    try {
      const response = await axios.get("https://html.duckduckgo.com/html/", {
        params: { q: query },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      const $ = cheerio.load(response.data);
      const results: { title: string; url: string; description: string }[] = [];
      const max = Math.min(limit ?? 5, 10);

      $(".result").each((i, element) => {
        if (i >= max) return false;
        const titleElement = $(element).find(".result__title");
        const linkElement = $(element).find(".result__title a");
        const snippetElement = $(element).find(".result__snippet");
        const url = linkElement.attr("href");
        if (
          titleElement.length &&
          linkElement.length &&
          url &&
          url.startsWith("http")
        ) {
          results.push({
            title: titleElement.text().trim(),
            url,
            description: snippetElement.text().trim() || "",
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
  };
  const searchRes = await duckduckgo_search({ query: req.params.query });
  if (searchRes.isError) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
    });
    return;
  } else {
    res.status(200).json({
      jsonrpc: "2.0",
      error: null,
      data: searchRes.content,
    });
    return;
  }
});

// GET /mcp는 SSE 스트림 미지원(405)
app.get("/mcp", (req: Request, res: Response) => {
  res.status(405).send("Method Not Allowed");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.error(`Web Search MCP HTTP server running on port ${PORT}`);
});
