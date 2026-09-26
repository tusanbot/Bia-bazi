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
  return telegramWebApp()?.initDataUnsafe?.start_param ?? "";
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
