import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/utils";

/** Password resets happen on the shop's main address; the sign-in form links here on the till. */
export default function PosForgotPasswordPage() {
  redirect(siteUrl("/forgot-password"));
}
