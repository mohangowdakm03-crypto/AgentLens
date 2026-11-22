
import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({
      error: "Invalid response from backend health endpoint",
    }));

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "Backend health check timed out" : "Backend is unreachable" },
      { status: timedOut ? 504 : 503 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
