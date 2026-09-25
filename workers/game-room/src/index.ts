export class GameRoom {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/state") {
      const data = await this.state.storage.get("room");
      return Response.json(data ?? null);
    }

    if (request.method === "POST" && url.pathname === "/state") {
      const body = await request.json();
      await this.state.storage.put("room", body);
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }
}