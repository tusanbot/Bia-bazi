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

let cachedInitData = "";

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function rawTelegramInitData(): string {
  if (typeof window === "undefined") return "";

  const appInitData = window.Telegram?.WebApp?.initData ?? "";
  if (appInitData) {
    cachedInitData = appInitData;
    return appInitData;
  }

  const sources = [
    window.location.hash.replace(/^#/, ""),
    window.location.search.replace(/^\?/, "")
  ];

  for (const source of sources) {
    if (!source) continue;
    const params = new URLSearchParams(source);
    const value = params.get("tgWebAppData");
    if (value) {
      cachedInitData = value;
      return value;
    }
  }

  return cachedInitData;
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
  return rawTelegramInitData();
}

export function telegramUser(): TelegramUser | null {
  // initDataUnsafe.user is display metadata only. It is NOT an authentication
  // credential and must never make the UI think the user is authenticated.
  // The server verifies the signed initData, so only expose a user when that
  // signed payload is actually present.
  const initData = telegramInitData();
  return userFromInitData(initData);
}

export type TelegramAuthDiagnostics = {
  hasTelegramObject: boolean;
  hasWebApp: boolean;
  hasInitData: boolean;
  initDataLength: number;
  hasUnsafeUser: boolean;
  hasRawInitData: boolean;
  hasStartParam: boolean;
  host: string;
};

export function telegramAuthDiagnostics(): TelegramAuthDiagnostics {
  if (typeof window === "undefined") {
    return {
      hasTelegramObject: false,
      hasWebApp: false,
      hasInitData: false,
      initDataLength: 0,
      hasUnsafeUser: false,
      hasRawInitData: false,
      hasStartParam: false,
      host: ""
    };
  }

  const app = telegramWebApp();
  const initData = telegramInitData();
  const rawInitData = rawTelegramInitData();
  const startParam = telegramStartParam();

  return {
    hasTelegramObject: Boolean(window.Telegram),
    hasWebApp: Boolean(app),
    hasInitData: Boolean(initData),
    initDataLength: initData.length,
    hasUnsafeUser: Boolean(app?.initDataUnsafe?.user),
    hasRawInitData: Boolean(rawInitData),
    hasStartParam: Boolean(startParam),
    host: window.location.host
  };
}

export async function ensureTelegramAuth(timeoutMs = 8000): Promise<string> {
  const initData = await waitForTelegramInitData(timeoutMs);
  if (initData) return initData;

  const d = telegramAuthDiagnostics();
  const context =
    d.hasWebApp && d.hasUnsafeUser
      ? "Telegram.WebApp باز شده ولی initData امضاشده دریافت نشده است."
      : d.hasTelegramObject
        ? "اسکریپت تلگرام بارگذاری شده اما WebApp احراز هویت‌شده در دسترس نیست."
        : "این صفحه خارج از Telegram WebApp اجرا شده است.";

  throw new Error(
    `احراز هویت تلگرام در دسترس نیست. ${context} لطفاً بازی را از لینک Mini App داخل تلگرام باز کنید.`
  );
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

export function telegramHeaders(initData?: string): HeadersInit {
  const value = initData || telegramInitData();
  return value ? { "x-telegram-init-data": value } : {};
}

export function initTelegram() {
  const app = telegramWebApp();
  app?.ready?.();
  app?.expand?.();
  rawTelegramInitData();
}

export async function waitForTelegram(timeoutMs = 6000): Promise<TelegramWebApp | null> {
  if (typeof window === "undefined") return null;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const app = telegramWebApp();
    if (app) {
      app.ready?.();
      app.expand?.();
    }
    if (telegramInitData()) return app;
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return telegramWebApp();
}

export async function waitForTelegramInitData(timeoutMs = 8000): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const initData = telegramInitData();
    if (initData) return initData;
    initTelegram();
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return telegramInitData();
}
