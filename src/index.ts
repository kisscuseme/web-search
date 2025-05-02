import express, { Request, Response } from "express";
import axios from "axios";
import { parse, HTMLElement } from "node-html-parser";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const response = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );

    const root = parse(response.data);
    const results: SearchResult[] = [];

    root.querySelectorAll(".result").forEach((result: HTMLElement) => {
      const titleElement = result.querySelector(".result__title");
      const snippetElement = result.querySelector(".result__snippet");
      const linkElement = result.querySelector(".result__url");

      if (titleElement && snippetElement && linkElement) {
        results.push({
          title: titleElement.text.trim(),
          link: linkElement.text.trim(),
          snippet: snippetElement.text.trim(),
        });
      }
    });

    return results;
  } catch (error) {
    console.error("Error searching DuckDuckGo:", error);
    throw error;
  }
}

app.get("/mcp", async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await searchDuckDuckGo(query);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`DuckDuckGo MCP server is running on port ${port}`);
});
