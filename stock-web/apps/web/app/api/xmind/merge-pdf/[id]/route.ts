import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const forwardForm = new FormData();
    forwardForm.append("file", file, file.name);

    const sheetTitle = formData.get("sheet_title");
    if (sheetTitle) forwardForm.append("sheet_title", sheetTitle as string);

    const conflictResolution = formData.get("conflict_resolution");
    if (conflictResolution)
      forwardForm.append("conflict_resolution", conflictResolution as string);

    const res = await fetch(`${DATA_SERVICE_URL}/api/xmind/merge-pdf/${id}`, {
      method: "POST",
      body: forwardForm,
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Data service unavailable" },
      { status: 503 },
    );
  }
}
