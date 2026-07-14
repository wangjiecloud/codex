import { NextResponse } from "next/server";
import https from "https";

const EM_HEADERS = {
  "Referer": "https://finance.eastmoney.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: EM_HEADERS,
        timeout: 8000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/**
 * 直接从 Next.js 层调东方财富分时接口（用 Node.js https 模块绕过 undici TLS 限制）
 * 返回上证指数当日分时走势：{ time, price, preClose }[]
 */
export async function GET() {
  try {
    const url =
      "https://push2.eastmoney.com/api/qt/stock/trends2/get" +
      "?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11" +
      "&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscca=1";

    const body = await httpsGet(url);
    const json = JSON.parse(body);
    const data = json?.data ?? {};
    const preClose = Number(data.preClose) || 0;
    const raw: string[] = data.trends ?? [];

    const result: { time: string; price: number; preClose: number }[] = [];
    for (const item of raw) {
      const parts = String(item).split(",");
      if (parts.length < 3) continue;
      const t = (parts[0].split(" ").pop() ?? parts[0]).trim();
      const price = Number(parts[2]);
      if (price <= 0) continue;
      result.push({ time: t, price, preClose });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
