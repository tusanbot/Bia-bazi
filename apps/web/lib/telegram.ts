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

const telegramAuthCache: { initData: string } = { initData: "" };

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function rawTelegramInitData(): string {
  if (typeof window === "undefined") return telegramAuthCache.initData;

  const appInitData = window.Telegram?.WebApp?.initData ?? "";
  if (appInitData) {
    telegramAuthCache.initData = appInitData;
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
      telegramAuthCache.initData = value;
      return value;
    }
  }

  return telegramAuthCache.initData;
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
  // initDataUnsafe.user is display metadata only. It is not an authentication
  // credential. Only expose a user parsed from signed initData.
  return userFromInitData(telegramInitData());
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

function loadTelegramScript(): Promise<void> {
  if (typeof window === "undefined" || window.Telegram?.WebApp) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src^="https://telegram.org/js/telegram-web-app.js"]'
  );
  if (existing) {
    return new Promise(resolve => {
      if (window.Telegram?.WebApp) {
        resolve();
        return;
      }
      const done = () => resolve();
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", done, { once: true });
      window.setTimeout(done, 2500);
    });
  }

  return new Promise(resolve => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js?63";
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export function initTelegram() {
  const app = telegramWebApp();
  app?.ready?.();
  app?.expand?.();
  rawTelegramInitData();
}

async function ensureTelegramWebAppLoaded(timeoutMs = 4000): Promise<void> {
  if (telegramWebApp()) return;

  await loadTelegramScript();
  if (telegramWebApp()) return;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (telegramWebApp()) return;
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
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
  if (typeof window === "undefined") return "";

  await ensureTelegramWebAppLoaded(Math.min(timeoutMs, 4000));

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const initData = telegramInitData();
    if (initData) return initData;
    initTelegram();
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return telegramInitData();
}
