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

function rawTelegramInitData(): string {
  if (typeof window === "undefined") return "";

  // Telegram's WebApp bridge normally exposes this as WebApp.initData.
  // Some Android/iOS clients can expose the bridge a little later; the
  // original launch payload is also present in the URL fragment.
  const sources = [
    window.location.hash.replace(/^#/, ""),
    window.location.search.replace(/^\?/, "")
  ];

  for (const source of sources) {
    if (!source) continue;
    const params = new URLSearchParams(source);
    const value = params.get("tgWebAppData");
    if (value) return value;
  }

  return "";
}

function rawTelegramStartParam(): string {
  if (typeof window === "undefined") return "";
  const sources = [
    window.location.hash.replace(/^#/, ""),
    window.location.search.replace(/^\?/, "")
  ];

  for (const source of sources) {
    if (!source) continue;
    const params = new URLSearchParams(source);
    const value = params.get("tgWebAppStartParam");
    if (value) return value;
  }

  return "";
}

function userFromInitData(initData: string): TelegramUser | null {
  if (!initData) return null;
  try {
    const raw = new URLSearchParams(initData).get("user");
    if (!raw) return null;
    return JSON.parse(raw) as TelegramUser;
  } catch {
    return null;
  }
}

export function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function telegramInitData(): string {
  return telegramWebApp()?.initData || rawTelegramInitData();
}

export function telegramUser(): TelegramUser | null {
  return telegramWebApp()?.initDataUnsafe?.user ?? userFromInitData(telegramInitData());
}

export function telegramStartParam(): string {
  const fromTelegram = telegramWebApp()?.initDataUnsafe?.start_param ?? "";
  return fromTelegram || rawTelegramStartParam();
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

export async function waitForTelegram(timeoutMs = 6000): Promise<TelegramWebApp | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const app = telegramWebApp();
    if (app) {
      app.ready?.();
      app.expand?.();
      if (app.initData || rawTelegramInitData()) return app;
    }
    if (rawTelegramInitData()) return app;
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return telegramWebApp();
}

export async function waitForTelegramInitData(timeoutMs = 6000): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const initData = telegramInitData();
    if (initData) return initData;
    initTelegram();
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return telegramInitData();
}
