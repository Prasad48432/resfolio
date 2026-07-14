"use server";

export type WaitlistState =
  | { status: "idle" }
  | { status: "success"; email: string }
  | { status: "error"; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Stub action: validates the email server-side and reports success.
 * No email-capture backend exists yet — wire this up to a real service
 * (database insert, ESP API call, etc.) before launch.
 */
export async function joinWaitlist(
  _prevState: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    return { status: "error", message: "Please use a valid email address." };
  }

  return { status: "success", email };
}
