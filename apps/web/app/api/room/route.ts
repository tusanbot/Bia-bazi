import { NextRequest, NextResponse } from "next/server";

const GAME_ROOM_URL = process.env.GAME_ROOM_URL;

async function forward(request: NextRequest) {
  if (!GAME_ROOM_URL) {
    return NextResponse.json(
      { error: "GAME_ROOM_URL is not configured" },
      { status: 503 }
    );
  }

  const room = request.nextUrl.searchParams.get("room");
  if (!room) {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }

  const target = new URL(GAME_ROOM_URL);
  target.searchParams.set("room", room);

  const init: RequestInit = {
    method: request.method,
    headers: { "content-type": "application/json" }
  };

  if (request.method !== "GET") {
    init.body = await request.text();
  }

  const response = await fetch(target, init);
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json" }
  });
}

export async function GET(request: NextRequest) {
  return forward(request);
}

export async function POST(request: NextRequest) {
  return forward(request);
}
