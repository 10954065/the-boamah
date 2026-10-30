import { AuthShell } from "@/components/auth/auth-shell";

/** Staff sign in and forgotten passwords, on the shop's address behind the admin link. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell place="admin">{children}</AuthShell>;
}
