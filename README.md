# U-Like — EV Inventory & Sales

A mobile-friendly inventory and sales system for your 5 EV shops, built with plain HTML/CSS/JS and Firebase Firestore (no build step, no framework).

## 1. One-time Firebase setup

Your project (`ulike-27111`) config is already wired into [js/firebase-init.js](js/firebase-init.js). You still need to:

1. In the [Firebase console](https://console.firebase.google.com/project/ulike-27111/firestore), open **Firestore Database** and click **Create database** if you haven't already (choose *Production mode*, pick the region closest to you — e.g. `asia-south1`).
2. Deploy the security rules in [firestore.rules](firestore.rules):
   ```
   npm install -g firebase-tools   # once
   firebase login
   firebase use ulike-27111
   firebase deploy --only firestore:rules
   ```
   These rules allow open read/write with no login, matching the "no login, single admin" setup you asked for. Anyone with your Firebase config could read/write your data — keep the URL private. If you ever want a login screen added later, this is the one thing that changes.

## 2. Running it locally

Because the app uses native JS modules, opening `index.html` directly (`file://…`) will be blocked by the browser. Serve it over `http://` instead, e.g.:

```
npx serve .
# or
python -m http.server 8000
```

Then open the printed local address in your browser.

## 3. Publishing it (Firebase Hosting)

```
firebase deploy --only hosting
```

This deploys the whole folder as-is. You (and anyone with the link) can then open it from a phone or desktop browser.

## 4. What's inside

- **Dashboard** — live stock counts, low-stock alerts, today's/this month's revenue, recent activity.
- **EV Inventory** — add EV stock (each addition also creates its bundled battery + charger), edit, transfer between shops, delete.
- **Batteries & Chargers** — individually tracked units by wattage (48W/60W/72W), with cost & selling price, add/transfer/delete.
- **Spare Parts** — centrally managed parts with reorder levels, restock ledger, full stock-movement history per part.
- **Sales** — log an EV sale (choose battery wattage + count, auto-checks stock availability), a standalone battery/charger sale, or a spare part sale; download a PDF invoice for any sale.
- **Transfers** — history of every stock movement between shops.
- **Reports** — inventory by shop, sales & revenue by brand/payment method (with CSV export), stock movement history, and a full low-stock report.
- **Locations & Brands** — edit your 5 shops and the EV brands each carries; this is seeded once on first run with the shops/brands you gave me (Jadcherla & Mahabubnagar carrying Zelio + EKO Tejas, plus the MAC, Goeen and VED Motors showrooms) — edit freely from this screen.

The top bar's location dropdown ("All locations" vs a specific shop) filters every screen — that's your centralized vs. per-shop view.

## 5. Notes on the data model

- EVs, batteries and chargers are tracked as **individual units** (not just quantities), each with its own cost/selling price — this is what makes per-unit margin and low-stock-per-wattage tracking possible.
- Every EV you add automatically creates one bundled battery unit + one bundled charger unit (the "basic" set it ships with). At sale time you choose the battery wattage and count (3/5/8); the system pulls that many battery units plus one charger of that wattage from stock (preferring the EV's own bundled units first) and marks them sold together with the EV — a sale is always a single bundle, never just the vehicle alone.
- Spare parts are one shared, centrally managed pool (not per-shop), with a running in/out ledger.
