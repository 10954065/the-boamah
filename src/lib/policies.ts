import type { StoreSettings } from "@/generated/prisma/client";

/**
 * Policy pages. Text saved in Admin → Settings always wins; the privacy
 * policy and terms below are the shop's published defaults until then.
 * Delivery and returns depend on business decisions, so they have no default.
 *
 * Format: blank lines separate paragraphs, "## " starts a heading, "- " a
 * list item, and [label](/path) links to another page on this site.
 */
export const POLICY_PAGES = {
  delivery: { title: "Delivery information", field: "deliveryPolicy" },
  returns: { title: "Returns & refunds", field: "returnsPolicy" },
  privacy: { title: "Privacy policy", field: "privacyPolicy" },
  terms: { title: "Terms & conditions", field: "termsPolicy" },
} as const;

export type PolicySlug = keyof typeof POLICY_PAGES;
type PolicyField = (typeof POLICY_PAGES)[PolicySlug]["field"];

export function isPolicySlug(slug: string): slug is PolicySlug {
  return slug in POLICY_PAGES;
}

/** The text to publish for a policy page, or null if it has not been written yet. */
export function policyText(settings: Pick<StoreSettings, PolicyField>, slug: PolicySlug): string | null {
  const saved = settings[POLICY_PAGES[slug].field]?.trim();
  return saved || DEFAULT_POLICIES[slug] || null;
}

const PRIVACY_POLICY = `Last updated: 30 October 2026

The Boamah's Online Grocery Shop ("we", "us") runs this website. This policy explains what personal information we collect when you shop with us, why we collect it, who we share it with and the choices you have. We handle personal information in line with Ghana's Data Protection Act, 2012 (Act 843).

## Information we collect
- Contact details: your name, phone number and email address, which you give at checkout. You do not need an account or a password to shop with us.
- Delivery details: the recipient's name and phone number, town or city, area, street address or landmark, any extra directions such as a GhanaPost GPS address, and the delivery area you choose.
- Order details: the products, quantities and prices in your orders, any coupon used, your delivery or pickup choice, delivery instructions and the progress of each order.
- Payment details: the payment method, amount, status and payment reference. Card and Mobile Money details are entered on Paystack's secure pages. We never see or store them.
- Marketing choices: your email address if you sign up for offers, and when you agreed.
- Technical information: records our servers keep to run the site safely, such as your IP address, browser type and the time of requests. We use these to keep the site running and to stop misuse.

## How we use your information
- To take, prepare, deliver and track your orders, and to contact you about them.
- To take payments and process refunds through our payment provider.
- To send service messages by email or text, such as order confirmations, payment receipts and order updates.
- To send offers and news, only if you have agreed. You can stop these at any time.
- To keep the site secure, prevent fraud and misuse, and meet our legal and accounting duties.

## Who we share it with
We do not sell your personal information. We share only what is needed with:
- Paystack, which processes online payments.
- Our email and text message providers, which deliver our messages to you.
- Our website hosting, database and file storage providers, which store the site and its data for us.
- Our staff and delivery riders, who see the order and delivery details needed to prepare and deliver your order.
- Public authorities, where the law requires us to.

Some of these providers may store or process data outside Ghana. Where that happens, we use providers that protect it with appropriate safeguards.

## Cookies and similar storage
We use only the cookies the shop needs to work:
- a cart cookie that remembers your basket;
- an order cookie that lets you view an order you placed on the same device.

Your browser also keeps a short list of products you viewed recently. It stays on your device and is not sent to us. We do not use advertising or tracking cookies.

## How long we keep it
- Orders and payment records: for as long as the law requires us to keep business and tax records.
- Marketing consent: until you ask us to stop.

When we no longer need information, we delete it or make it anonymous.

## Keeping it safe
Connections to the site are encrypted and staff can only see the information their role needs. No system is completely secure, so please tell us straight away if you think your information has been misused.

## Your rights
Under the Data Protection Act you can ask us to:
- tell you what personal information we hold about you and give you a copy;
- correct information that is wrong or out of date;
- delete information we no longer need to keep;
- stop using your information for marketing.

To do any of these, please [contact us](/contact). If you are not satisfied with how we handle your information, you can complain to the Data Protection Commission of Ghana.

## Children
The shop is meant for adults. If you are under 18, please shop with a parent or guardian.

## Changes to this policy
We may update this policy from time to time. The date at the top shows when it last changed. If we make important changes, we will tell you on the site or by email.

## Contact us
For questions about this policy or your personal information, please [contact us](/contact).`;

const TERMS = `Last updated: 30 October 2026

These terms apply when you use the website of The Boamah's Online Grocery Shop ("we", "us") and when you buy from us. By placing an order, you agree to them. Our [Privacy policy](/policies/privacy), [Delivery information](/policies/delivery) and [Returns & refunds](/policies/returns) pages also form part of these terms.

## Your details
- You do not need an account to shop with us. Please give accurate details at checkout.
- You must be 18 or older to place an order, or have permission from a parent or guardian.
- We may refuse or cancel an order that involves fraud or abuse, or breaks these terms.

## Products and prices
- Prices are shown in Ghana cedis (GH₵). Before you place an order, checkout shows the full amount you will pay, including any delivery fee and discount.
- Photos are for illustration. Manufacturers sometimes change packaging, so a product may look slightly different from its photo.
- Prices and availability can change at any time. The price that applies is the one shown when you place your order.
- If a product is listed at an obviously wrong price, we may cancel that item and refund anything you paid for it.

## Placing an order
- Your order is an offer to buy. It is accepted when we confirm it on your order page or by email.
- We check stock when you place your order, but an item can occasionally become unavailable. If we cannot supply an item, we will tell you and refund it.
- We may decline or cancel an order, for example if we cannot deliver to the address, a product is unavailable or we suspect fraud. If you have paid, we refund the cancelled part in full.

## Payment
- You can pay online with Mobile Money or card through Paystack, or by cash on delivery where we offer it.
- An online order is held for a limited time while you complete payment. If payment is not completed in time, the order is cancelled automatically.
- An order is treated as paid only once we have confirmed the payment with Paystack.
- For cash on delivery, please pay the full order total when your order arrives.

## Coupons
Coupons can only be used under their stated conditions, such as a minimum spend, dates and usage limits. They cannot be exchanged for cash and may be withdrawn at any time.

## Delivery and pickup
- We deliver to the areas listed on our [Delivery information](/policies/delivery) page. The delivery fee, any minimum order and the estimated delivery time are shown at checkout.
- Delivery times are estimates. Please make sure someone is available at the address to receive the order.
- Where pickup is offered, we will tell you where and when to collect your order.
- Responsibility for the goods passes to you when they are delivered or collected.

## Cancellations, returns and refunds
- If you need to cancel an order, please [contact us](/contact) as soon as possible. We can usually cancel orders that have not yet been prepared.
- Returns and refunds are covered by our [Returns & refunds](/policies/returns) policy. Refunds of online payments are made through Paystack to the original payment method.

## Using the website
- Please do not misuse the site, for example by trying to gain unauthorised access, interfering with how it works or placing orders you do not intend to pay for.
- The site's content, design and logo belong to us or our licensors. Some product photos are used under licence; see [Image credits](/credits).

## Our responsibility
- We take reasonable care in preparing and delivering your order. Nothing in these terms limits any rights you have under the laws of Ghana that cannot be excluded.
- We are not responsible for losses that could not reasonably have been foreseen, or for delays caused by events outside our reasonable control, such as severe weather, road closures or network outages.
- Where the law allows, our total responsibility for an order is limited to the amount you paid for it.

## Changes to these terms
We may update these terms from time to time. The date at the top shows when they last changed. The terms in force when you place an order apply to that order.

## Governing law
These terms are governed by the laws of the Republic of Ghana, and the courts of Ghana will deal with any dispute. Orders placed on this website are electronic transactions under the Electronic Transactions Act, 2008 (Act 772).

## Contact us
If you have a question about these terms, please [contact us](/contact).`;

const DEFAULT_POLICIES: Partial<Record<PolicySlug, string>> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS,
};
