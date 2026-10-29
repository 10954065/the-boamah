# Using the till

The till is the shop counter's selling screen. It sells the same products as
the website, with the same photos, prices and stock, and every sale takes the
stock off the website straight away.

**Address:** https://the-boamah-production.up.railway.app (going to `/pos` on
the shop's website forwards there). Use Chrome or Edge on the counter PC or
tablet.

**Who can use it:** staff with the **Cashier** role (till only), Store Managers
and Super Admins. A Super Admin gives someone the role in *Admin → Staff* after
they have registered a normal account.

## Start of the day: open a shift

1. Sign in with your own account.
2. Count the cash in the drawer and enter it as the opening float.
3. Press **Open the till**.

Only one shift runs on a till at a time. If someone else's shift is still open,
they (or a manager) must close it first; a manager can close it from the same
screen.

## Selling

- **Scan** a barcode, or type part of a product name in the search box and
  press Enter. Typing anywhere on the screen goes into the search box, so a
  scanner works without clicking first. **F2** jumps to the search box.
- **Tap** a product to add one. Tap again, or use **+** and **−**, to change
  the quantity; tap the number to type it.
- **Weighed goods** (sold per kg or litre) ask for the weight, to the gram.
- Sale and bulk prices apply by themselves, exactly as on the website.
- Products whose barcode is not set yet can still be found by name. Add the
  barcode in *Admin → Products → (product) → Barcode*; a USB scanner can type
  it in.

## Taking payment

Press **Charge** (or **F4**).

- **Cash:** enter what the customer handed over, or tap a quick amount. The
  change to give shows in large print.
- **Mobile money:** the amount is filled in; enter the **transaction ID** from
  the payment message. It is required.
- **Card:** the amount is filled in; the approval code from the card machine's
  slip is optional.
- **Split payment:** enter the first part (for example mobile money), press
  **Add as part payment**, then take the rest by another method.

Press **Complete sale**. The receipt shows on screen with **Print** and **New
sale**. **Last receipt** in the top bar prints a copy again (marked as a copy).

## Receipt printer

Any receipt printer that Windows or Android can print to works.

1. In the till, open **Printer** and choose the paper roll: 80 mm (most counter
   printers) or 58 mm (small and portable ones).
2. Press **Print a test receipt**. In the print window choose the receipt
   printer, set its paper size to the roll, and turn margins off.
3. Tick **Print every receipt straight away** if you want the print window to
   open after each sale.

## If the internet drops

The top bar shows **Online** or **Offline**. A sale that has been paid but has
not reached the shop's system stays on the till and is sent by itself when the
connection returns (or press **Try again**). Do not cancel it: the customer has
paid. Selling fully offline, with many sales waiting, comes in the next update.

## End of the day: close the shift

1. Finish or clear the sale on screen, then press **Close shift**.
2. Count and enter: the cash in the drawer (including the float), the mobile
   money received (from the mobile money statement) and the card total (from
   the card machine's end of day slip).
3. Press **Close the shift**. The report shows what the sales should have
   brought in against what you counted, method by method, as **Exact**,
   **Over by** or **Short by**. Print it for the manager.
