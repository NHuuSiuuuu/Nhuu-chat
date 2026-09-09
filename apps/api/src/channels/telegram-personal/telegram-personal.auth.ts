export type PasswordPrompt = {
  hint: string | undefined;
  ask: (hint?: string) => Promise<string>;
  submit: (password: string) => void;
};

export function createPasswordPrompt(): PasswordPrompt {
  let resolvePassword: ((password: string) => void) | undefined;
  let passwordPromise: Promise<string> | undefined;

  return {
    hint: undefined,
    ask(hint) {
      this.hint = hint;
      passwordPromise ??= new Promise<string>((resolve) => {
        resolvePassword = resolve;
      });
      return passwordPromise;
    },
    submit(password) {
      resolvePassword?.(password);
      resolvePassword = undefined;
      passwordPromise = undefined;
    }
  };
}

export function isRetryableTelegramPasswordError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "errorMessage" in error &&
    error.errorMessage === "PASSWORD_HASH_INVALID";
}

export function shouldReusePendingQr(status: "waiting" | "password_required"): boolean {
  return status === "waiting";
}
