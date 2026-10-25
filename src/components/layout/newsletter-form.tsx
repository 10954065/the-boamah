"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { subscribeNewsletter } from "@/actions/newsletter";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/input";

export function NewsletterForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await subscribeNewsletter({ email, consent });
      if (result.ok) {
        setMessage({ tone: "ok", text: result.message ?? "Subscribed." });
        setEmail("");
        setConsent(false);
        toast.success(result.message);
      } else {
        setMessage({ tone: "error", text: result.error });
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <label htmlFor={`${id}-email`} className="sr-only">
        Email address for offers and news
      </label>
      <div className="flex gap-2">
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="border-brand-600 bg-brand-900/40 text-white placeholder:text-brand-200"
          required
        />
        <Button type="submit" variant="gold" disabled={pending}>
          Subscribe
        </Button>
      </div>
      <label className="flex items-start gap-2 text-xs text-brand-100">
        <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />
        I agree to receive occasional emails about offers and new products. I can unsubscribe at any time.
      </label>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-xs text-gold-300" : "text-xs text-brand-100"}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
