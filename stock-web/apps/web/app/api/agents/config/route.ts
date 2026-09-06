import * as fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import * as os from "os";
import * as path from "path";

interface MsModelCapabilities {
  toolcall?: boolean;
  [k: string]: unknown;
}

interface MsModelEntry {
  id: string;
  name: string;
  capabilities?: MsModelCapabilities;
  [k: string]: unknown;
}

interface MsJsonNew {
  models: Record<string, MsModelEntry>;
}

interface MsModelOld {
  name: string;
  model: string;
  capabilities?: string[];
}

interface MsJsonOld {
  models: MsModelOld[];
}

function parseTomlModel(content: string): string {
  for (const line of content.split("\n")) {
    const m = line.match(/^model\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return "hw-glm-5";
}

export async function GET() {
  // 读取 ms.json 模型列表
  const msPath = path.join(os.homedir(), ".config", "opencode", "ms.json");
  let models: { name: string; model: string }[] = [];
  if (fs.existsSync(msPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(msPath, "utf-8"));
      if (Array.isArray(raw.models)) {
        // 旧格式：models 为数组
        const ms = raw as MsJsonOld;
        models = ms.models
          .filter((m) => !m.capabilities || m.capabilities.includes("tool_use"))
          .map((m) => ({ name: m.name, model: m.model }));
      } else {
        // 新格式：models 为对象（以模型 ID 为 key）
        const ms = raw as MsJsonNew;
        models = Object.values(ms.models)
          .filter((m) => !m.capabilities || m.capabilities.toolcall !== false)
          .map((m) => ({ name: m.name, model: m.id }));
      }
    } catch {
      /* ignore */
    }
  }

  // 读取当前选中模型（来自 config.toml）
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  let currentModel = "hw-glm-5";
  if (fs.existsSync(configPath)) {
    try {
      currentModel = parseTomlModel(fs.readFileSync(configPath, "utf-8"));
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ models, currentModel });
}

// 切换模型：写入 ~/.codex/config.toml
export async function POST(req: NextRequest) {
  const { model } = (await req.json()) as { model: string };
  if (!model)
    return NextResponse.json({ error: "model required" }, { status: 400 });

  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  if (!fs.existsSync(configPath)) {
    return NextResponse.json(
      { error: "config.toml not found" },
      { status: 404 },
    );
  }

  try {
    let content = fs.readFileSync(configPath, "utf-8");
    // 替换 model = "..." 行
    if (/^model\s*=\s*"[^"]*"/m.test(content)) {
      content = content.replace(/^model\s*=\s*"[^"]*"/m, `model = "${model}"`);
    } else {
      content = `model = "${model}"\n` + content;
    }
    fs.writeFileSync(configPath, content, "utf-8");
    return NextResponse.json({ ok: true, model });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
