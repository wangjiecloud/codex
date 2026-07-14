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

const SECIDS = "1.000001,0.399001,0.399006,1.000300,1.000016,1.000688,1.000047";
const FIELDS = "f2,f3,f4,f12,f14,f15,f16,f17,f18,f47,f48";

/**
 * 直接从 Next.js 层调东方财富实时行情（用 Node.js https 模块绕过 undici TLS 限制）
 * 返回 A 股宽基指数实时快照：{ code, name, price, changePct, changeAmt, high, low, open, prevClose, volume, amount }
 */
export async function GET() {
  try {
    const url =
      `https://push2.eastmoney.com/api/qt/ulist.np/get` +
      `?fltt=2&invt=2&fields=${FIELDS}&secids=${SECIDS}`;

    const body = await httpsGet(url);
    const json = JSON.parse(body);
    const items: Record<string, unknown>[] = json?.data?.diff ?? [];

    const result = items.map((it) => ({
      code: it.f12 as string,
      name: it.f14 as string,
      price: Number(it.f2) || 0,
      changePct: Number(it.f3) || 0,
      changeAmt: Number(it.f4) || 0,
      high: Number(it.f15) || 0,
      low: Number(it.f16) || 0,
      open: Number(it.f17) || 0,
      prevClose: Number(it.f18) || 0,
      volume: Number(it.f47) || 0,
      amount: Number(it.f48) || 0,
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
