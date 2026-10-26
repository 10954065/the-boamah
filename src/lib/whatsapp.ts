/**
 * WhatsApp click-to-chat links. wa.me needs the full international number
 * with no "+" or leading zero, so local Ghana numbers (024 123 4567) are
 * rewritten to 233241234567.
 */
export function whatsappDigits(number: string | null | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^\d{8,15}$/.test(digits)) return digits;
  return null;
}

/** https://wa.me link with an optional ready-made message, or null if the number is unusable. */
export function whatsappLink(number: string | null | undefined, message?: string): string | null {
  const digits = whatsappDigits(number);
  if (!digits) return null;
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}
