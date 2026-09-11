# SellerChamp Location Mover v2.2.0

This build fixes relocation + Notes behavior by preferring SellerChamp's standard product record when an item can be found by SKU/UPC/ASIN. A full move updates the existing inventory-location record (so the old location is replaced) and prepends `Previously on OLD-LOCATION - ` to `item_remarks`. Catalog Sync remains available as a fallback.

# SellerChamp Location Mover

A phone-friendly warehouse tool for quickly changing inventory locations in SellerChamp.

## What it does

- Scan/type SKU, UPC, ASIN, or SellerChamp catalogue SKU.
- Shows item title, image, current bin(s), and quantity.
- Move a full location to a new bin.
- With SellerChamp Catalog Sync enabled, uses SellerChamp's native inventory `transfer` action and supports partial quantity transfers.
- Without Catalog Sync, falls back to SellerChamp's standard Product Inventory Location API and safely renames a full inventory-location record while preserving its quantity.
- Rapid Move Mode: scan item → scan/type destination → Enter → ready for next item.
- Keeps the SellerChamp API token server-side.
- Optional app PIN.
- Stores recent move history only in that browser/device.

## SellerChamp requirements

Generate an API token in SellerChamp: **Settings → API Settings → Generate API Key**.

Catalog Sync is recommended because SellerChamp's master-product inventory endpoint supports true transfers (`from_location` → `location`) and partial quantities. The app will still do full-location moves using the standard inventory-location endpoint if Catalog Sync is not enabled.

## Deploy on Render

1. Put this entire folder in a GitHub repository.
2. In Render, create a **Blueprint** or a new **Web Service** from the repo. `render.yaml` is included.
3. Add environment variable `SELLERCHAMP_TOKEN` with your SellerChamp API token.
4. Optional: add `APP_PIN` with a PIN you want users to enter before using the app.
5. Deploy.

Do **not** put your SellerChamp API token into any file in the `public` folder.

## Run locally

```bash
npm install
SELLERCHAMP_TOKEN=YOUR_TOKEN npm start
```

Open http://localhost:3000

## Scanner notes

Bluetooth and USB barcode scanners are the most reliable choice because they act like a keyboard and work with the SKU field automatically. Camera scanning uses the browser's BarcodeDetector API where supported.

## API implementation

The server connects to `https://app.sellerchamp.com` and sends your token in SellerChamp's `Token` request header. It uses:

- `/api/master_products` for Catalog Sync lookup.
- `/api/master_product_inventory_locations/update_quantities` for Catalog Sync transfers.
- `/api/products` plus `/api/products/:id/inventory_locations` as the standard-product fallback.
- `PUT /api/products/:id/inventory_locations/:location_id` for full-location moves in fallback mode.


## iPhone camera scanning
Version 1.1 uses ZXing in the browser for camera barcode scanning, including iPhone Safari. The Render site must be served over HTTPS (Render provides this automatically). Camera permission must be allowed in Safari. Bluetooth/USB scanners continue to work as keyboard input.


## Relocation history
On each successful move, the app prepends `Previously on OLD-LOCATION - ` to SellerChamp's `item_remarks` field without replacing the existing remarks. Full-quantity moves relocate the stock from the old bin to the new bin; partial Catalog Sync transfers leave any remaining quantity at the source bin.
