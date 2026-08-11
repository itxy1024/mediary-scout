import { connection, NextResponse, type NextRequest } from "next/server";
import { saveSelectedResource } from "../../../../lib/save-selected-resource";

export async function POST(request: NextRequest) {
  await connection();
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== "string" || !body.token || body.token.length > 32_000) {
    return NextResponse.json(
      { status: "error", message: "资源选择已失效，请重新检索。" },
      { status: 400 },
    );
  }

  const result = await saveSelectedResource(body.token);
  return NextResponse.json(result, { status: result.status === "queued" ? 200 : 400 });
}
