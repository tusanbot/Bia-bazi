export type TelegramUser = {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: {
    user?: TelegramUser;
    start_param?: string;
    chat_type?: string;
    chat_instance?: string;
  };
  ready?: () => void;
  expand?: () => void;
  openTelegramLink?: (url: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function telegramInitData(): string {
  return telegramWebApp()?.initData ?? "";
}

export function telegramUser(): TelegramUser | null {
  return telegramWebApp()?.initDataUnsafe?.user ?? null;
}

export function telegramStartParam(): string {
  const fromTelegram = telegramWebApp()?.initDataUnsafe?.start_param ?? "";
  if (fromTelegram) return fromTelegram;

  // Telegram also exposes tgWebAppStartParam as a GET parameter
  // when a Mini App is opened through a direct link with startapp.
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("tgWebAppStartParam") ?? "";
  }

  return "";
}

export function telegramChatInstance(): string {
  return telegramWebApp()?.initDataUnsafe?.chat_instance ?? "";
}

export function telegramChatType(): string {
  return telegramWebApp()?.initDataUnsafe?.chat_type ?? "";
}

export function telegramHeaders(): HeadersInit {
  const initData = telegramInitData();
  return initData ? { "x-telegram-init-data": initData } : {};
}

export function initTelegram() {
  const app = telegramWebApp();
  app?.ready?.();
  app?.expand?.();
}

/**
 * Telegram injects WebApp data asynchronously in some Telegram clients.
 * Never read initData only once during the first React effect; wait briefly
 * for the WebView bridge to become ready.
 */
export async function waitForTelegram(timeoutMs = 4000): Promise<TelegramWebApp | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const app = telegramWebApp();
    if (app) {
      app.ready?.();
      app.expand?.();
      if (app.initData || app.initDataUnsafe?.user?.id) return app;
    }
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return telegramWebApp();
}

export async function waitForTelegramInitData(timeoutMs = 4000): Promise<string> {
  const app = await waitForTelegram(timeoutMs);
  return app?.initData ?? "";
}
