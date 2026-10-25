import { z } from "zod";

/** Ghana phone numbers: 0XXXXXXXXX or +233XXXXXXXXX (spaces/dashes allowed). */
export const ghanaPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .refine((value) => /^(?:\+233|0)\d{9}$/.test(value), "Enter a valid Ghana phone number, e.g. 024 123 4567.");

export const emailField = z.email("Enter a valid email address.").max(254).trim();

export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use at most 128 characters.");

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(80),
    email: emailField,
    phone: z.union([z.literal(""), ghanaPhone]).optional(),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({ password: passwordField, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
