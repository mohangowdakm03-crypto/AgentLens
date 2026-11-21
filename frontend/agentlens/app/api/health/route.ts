
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "http://127.0.0.1:8000/api/health",
      { cache: "no-store" }
    );

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { error: "Backend is unreachable" },
      { status: 503 }
    );
  }
}
