export interface Env {
  DB: D1Database;
  GAME_ROOM: DurableObjectNamespace;
  WEBAPP_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") return json({ ok: true, service: "bia-bazi-api" });

    if (url.pathname === "/api/auth/telegram" && request.method === "POST") {
      // Telegram Mini App initData validation will be implemented here.
      return json({ ok: false, error: "telegram_auth_not_configured" }, 501);
    }

    if (url.pathname === "/api/games" && request.method === "GET") {
      return json([{ id: "hokm", title: "حکم", emoji: "🃏", players: 4 }]);
    }

    return json({ ok: false, error: "not_found" }, 404);
  }
};