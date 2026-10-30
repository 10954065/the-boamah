# Using the till

The till is the shop counter's selling screen. It sells the same products as
the website, with the same photos, prices and stock, and every sale takes the
stock off the website straight away.

**Address:** your private till link. The Super Admin finds it under
*Admin → Staff → Private links*. Open it once on each device: without it the
till's pages look as if they do not exist. Use Chrome or Edge on the counter PC
or tablet.

**Who can use it:** staff with the **Cashier** role (till only), Store Managers
and Super Admins. The Super Admin adds staff in *Admin → Staff* and gives them a
temporary password. Nobody can register for themselves.

## Set up the counter device once

1. Open the till link in Chrome or Edge and sign in.
2. Install it as an app: on a PC, press the install icon at the right of the
   address bar (or *Menu → Install The Boamah's till*); on an Android tablet,
   *Menu → Add to Home screen*. It then opens full screen from its own icon.
3. Keep the till open for a minute while online. It saves the till, the
   product list and the product photos on the device, so it keeps working when
   the internet drops.

Do not clear the browser's data for the till's address: sales waiting to be
sent are kept there.

If the till shows *We couldn't find that page*, open the till link again. The
device's pass lasts 90 days from its last visit, and it also ends if the links
are changed. Forgot your password? Use **Forgot your password?** on the sign in
page, or ask the Super Admin to reset it. Five wrong passwords pause an account;
a reset lifts the pause.

## Start of the day: open a shift

1. Sign in with your own account.
2. Count the cash in the drawer and enter it as the opening float.
3. Press **Open the till**.

Only one shift runs on a till at a time. If someone else's shift is still open,
they (or a manager) must close it first; a manager can close it from the same
screen.

## Selling

- The screen stays clear until you look something up. **Scan** a barcode, or
  type part of a product name and the matches pop up with their photos. Typing
  anywhere on the screen goes into the search box, so a scanner works without
  clicking first. **F2** jumps to the search box.
- **Tap** a match to add one, or press Enter when only one matches. Can't
  spell it? Tap a category to open it, and tap it again to close it.
- Each product on the sale shows on the screen with its photo and how many, so
  you can **check it against the goods** on the counter. The newest has a gold
  ring. Tap a card to change how many, or use **+** and **−** in the sale.
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

## Putting a sale on hold

When a customer steps away (to fetch something, or to find money), press
**Hold** above the sale, type who it is for if you like (for example *Ama, blue
bag*) and serve the next customer.

- **On hold** in the top bar shows how many sales are waiting. Press it, then
  **Pick up** to bring one back. Finish or clear the sale on screen first.
- Nothing is paid or taken off stock while a sale is on hold. Prices are checked
  again when it is picked up, and anything no longer sold is left out (the till
  says which).
- Any cashier on this till can pick up a held sale. The till holds 20 at most;
  **Discard** the ones nobody is coming back for.
- Holding works with no internet.

## Sales this shift and copies of receipts

**Sales** in the top bar lists this shift's sales, newest first, with the
refunds paid out in the shift. Sales still waiting to be sent are marked.

- Tap a sale to see it, then **Print a copy** (marked as a copy).
- **Find a receipt** finds any sale by its number, even from an earlier day:
  type *231* for T1-000231, or the full number.
- The full list needs the internet. With no connection the till shows the sales
  still waiting on it.

## Voiding a sale

A void cancels a whole sale from the shift that is open now, for example one
rung up by mistake or one the customer changed their mind about at the counter.

1. Open **Sales**, tap the sale, press **Void sale**.
2. Choose or type the reason.
3. A manager approves: a manager signed in on the till approves by themselves;
   otherwise the manager types their own email and password on the till. They
   are checked once and not kept.
4. Press **Void the sale** and give the money back the way the customer paid. The
   till shows how much by each method.

Every item goes back into stock and the sale no longer counts in the shift. A
sale from an earlier shift, or one that has had items returned, cannot be
voided: return the items instead. Voids need the internet.

## Returns and refunds

1. Open **Sales**, find the receipt (the customer's receipt number) and press
   **Return items**.
2. Enter how much of each item is coming back, or press **All**. Untick **Fit to
   sell again** for anything damaged or past its date; it is refunded but not
   put back into stock.
3. Choose how the money goes back: cash from the drawer, mobile money (enter the
   transaction ID of the refund) or card (refund it on the card machine).
4. Choose or type the reason, and a manager approves (as for a void).
5. Press **Refund**. Give the amount shown and print the refund slip for the
   customer.

The customer gets back what they paid for those items, never more. The refund
is paid out of the shift open now, so the shift report takes it off what is
expected in the drawer. Returns need the internet.

## Receipt printer

Any receipt printer that Windows or Android can print to works.

1. In the till, open **Printer** and choose the paper roll: 80 mm (most counter
   printers) or 58 mm (small and portable ones).
2. Press **Print a test receipt**. In the print window choose the receipt
   printer, set its paper size to the roll, and turn margins off.
3. Tick **Print every receipt straight away** if you want the print window to
   open after each sale.

## If the internet drops

Carry on selling. The top bar shows **Online**, **Offline**, or **No
connection** (the device has a network but cannot reach the shop's system).

- **Sales:** each paid sale is saved on the till first. With no connection the
  receipt shows straight away with *Saved on this till*, and the sale goes to
  the shop's system by itself once the connection is back, oldest first.
- **What is waiting:** the top bar shows a count such as **3 to send**. Press
  it to see the list, when it last tried, and **Send now**.
- **Prices and stock:** the till uses the product list it saved last; the
  banner says what time that list is from. Stock on the website catches up as
  soon as the sales are sent.
- **Reloading or restarting the device** is fine: the till opens from the
  device with the same shift and the sales still waiting.
- **Opening and closing shifts** also work offline. A shift closed offline
  shows a report worked out from the sales made on this till, marked *Worked
  out on the till while offline*; the shop's system checks it once the close
  is sent.
- **Signing in and out needs the internet.** If a cashier signs out with sales
  still waiting, those sales stay on the till and are sent the next time that
  cashier signs in here.
- **Voids, returns and the full sales list need the internet.** Holding sales
  and printing the receipts of sales waiting on the till do not.
- **Three days at most.** A till that has not reached the shop's system for 3
  days stops selling and asks to be connected. Nothing waiting on it is lost.
- **One window.** The till runs in one window or tab at a time on a device. If
  it is opened twice, the second window offers to take over.

**Not accepted:** if the shop's system refuses something sent later (for
example the till was switched off, or a manager closed the shift while the till
was offline), it shows in red as **not accepted** with the reason. The money
was taken, so it stays on the till for a manager: put the reason right, then
press **Try again**. Removing it for good needs the internet and a manager's
approval, and the shop's system keeps a record of what was removed (managers
see it under *Admin → Till review*).

**Receipt number changed:** if two devices were ever used as the same till, a
sale sent later can find its receipt number already taken. It is then saved
under the next free number and the till says so (for example *Receipt
T1-000123 was saved as T1-000130*). Give each device its own till to avoid
this.

## End of the day: close the shift

1. Finish or clear the sale on screen, then press **Close shift**.
2. Count and enter: the cash in the drawer (including the float), the mobile
   money received (from the mobile money statement) and the card total (from
   the card machine's end of day slip).
3. Press **Close the shift**. The report shows what the sales should have
   brought in, less any refunds, against what you counted, method by method, as
   **Exact**, **Over by** or **Short by**. Voided sales are listed but not
   counted. Print it for the manager.

## For managers: the till in the admin

*Admin → Shop till* (Store Managers and Super Admins):

- **Till sales**: the end of day report for today or any days you choose:
  takings (sales less refunds) by payment method and by cashier, voids, best
  sellers and day by day. **Print** prints it on ordinary paper. Every sale
  opens to its items, the price charged against the shelf price, payments,
  returns and stock changes.
- **Till shifts**: each shift's expected amounts against what was counted.
- **Till review**: what a manager should look at: counts that did not balance,
  sales that sold more than the recorded stock or were charged at another price,
  voids, refunds, and anything removed from a till. Check each one, add a note
  if useful, and press **Mark as looked at**.
