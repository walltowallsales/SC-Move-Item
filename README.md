# SellerChamp Location Mover v2.32.0

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
On each successful move, the app prepends `Previously on OLD-LOCATION - ` to the actual SellerChamp listing-card **Notes** field when that field is exposed by the product API. Because SellerChamp does not publicly document that Notes field, v2.4 discovers its real API key from the live product response and verifies the saved value. `item_remarks` is no longer used for this history. Full-quantity moves relocate the stock from the old bin to the new bin; partial Catalog Sync transfers leave any remaining quantity at the source bin.


## v2.32.0
After lookup, shows a larger product photo, prominent SKU, title, every returned inventory location with quantity, and automatically focuses the 3. New Location field for immediate scanner/keyboard input.

## v2.32.0
- Temporarily removes all Notes updating from the move workflow.
- Shows a move-complete confirmation dialog with SKU, title, old location, new location, and quantity.
- Tapping OK clears the item and returns focus to the item SKU/barcode scan field.
- Adds SellerChamp Product and SellerChamp Batch navigation buttons beneath the title.


## v2.32.0
Fixed SellerChamp Products navigation, removed both camera scan buttons/scanner code, and removed the Standard SellerChamp location label.


## v2.32.0
SellerChamp Product button now opens the exact product by SellerChamp product ID instead of attempting a SKU search.


## v2.32.0
SellerChamp Product button now uses the proven app2 Products-list SKU filter pattern: /products?product[query]=SKU, so the Products page opens with that SKU filtered instead of opening the product detail page.


## v2.32.0
When an item has a standard SellerChamp inventory location with Qty 0, the location list offers a Delete Location button. Deletion requires confirmation and the server rechecks SellerChamp immediately before deleting; if quantity is no longer zero, deletion is refused.


## v2.32.0
Zero-quantity cleanup now uses SellerChamp's inventory-location PUT update with quantity_available=0 and delete_if_empty=true, then verifies the location disappeared. Removed the obsolete camera-scanning help sentence.


## v2.32.0
Adds permanent Google Sheets logging for successful location moves and zero-quantity location removals. Also removes the Notes update from the move workflow.


## v2.32.0
Fixes the v2.13 move regression: SKU/title are now read from the move request before Google Sheets logging. Google logging is isolated so it cannot make an already-successful SellerChamp move appear failed.


## v2.32.0
Fixes Google Sheets audit rows missing SKU and Product Title by sending those values from the browser with every successful move/cleanup request.


## v2.32.0
Resolves a scanned SKU against SellerChamp marketplace Manifests/Product Listings. The Batch button now opens the exact originating manifest when found. If Products has no location but an unsubmitted manifest listing does, the app displays the batch listing location and quantity. Batch-only locations are display-only until a documented safe update route is available.


## v2.32.0
Strengthens marketplace Batch/Manifest lookup using SellerChamp's documented GET manifests and GET product_listings-for-manifest endpoints. Supports listing location/item_location and quantity fields, shows the resolved batch name in the UI, and adds a safe diagnostic endpoint that never exposes the SellerChamp token.


## v2.32.0
The SellerChamp Batch button now opens the resolved manifest with the scanned SKU supplied as the batch search query (`q`). It also copies the SKU to the clipboard as a fallback in case SellerChamp ignores the query parameter on a particular UI version.


## v2.32.0
Fixes the SellerChamp Batch deep-link search. v2.18's plain `q` parameter created a `Q:` filter chip but did not execute the batch item search. v2.19 uses the resource-scoped `product_listing[query]` parameter instead, matching SellerChamp's resource-scoped search convention.

## v2.32.0
Adds a separate verified Batch/Manifest location-move path. Batch moves update the existing product listing's item_location through SellerChamp's documented POST product_listings add-or-update endpoint, then re-read the listing and only report success after SellerChamp confirms the destination. Partial Batch moves are blocked for safety.

## v2.32.0
Fixes Batch-authority routing: when Products has no inventory location and the displayed location/quantity comes from the resolved Batch listing, the lookup now explicitly switches the item to `mode: batch`. The Move button is enabled for Batch items and routes to the verified Batch product-listing update added in v2.20. Full quantity remains mandatory. Also collapses an exact duplicated destination scan such as `C0513C0513` to `C0513` before moving.

## v2.32.0
Safety release. Batch lookup remains enabled, including the authoritative Batch location/quantity and SellerChamp Batch button, but MOVE ITEM is disabled whenever the source location came from an unsubmitted Batch. The server independently rejects Batch move requests as a second safety layer, preventing cached/older browser code from accidentally creating or incrementing a duplicate Batch listing. Normal SellerChamp inventory-location moves remain enabled.

## v2.32.0
For Batch-sourced items the main action button now displays `BATCH MOVE DISABLED` followed by `OPEN SELLERCHAMP BATCH INSTEAD` on a second line. Tapping it opens the exact resolved SellerChamp Batch and copies the SKU as a fallback. It never calls the Batch write API; the v2.22 server-side Batch-write safety block remains. Normal items still show MOVE ITEM.

## v2.32.0
Adds an Update Qty button beside each standard SellerChamp inventory location under “2. Current locations & quantities.” It asks for the new total quantity, confirms the old/new values, updates the existing inventory-location record, re-reads SellerChamp to verify the exact quantity, then logs the adjustment to the shared Google Sheet. Batch quantity updates remain disabled and must be performed in SellerChamp; no Batch write endpoint is used.

## v2.32.0
Batch-sourced locations now also show an Update Quantity button beneath/alongside the displayed quantity. For safety, this button does not write to the Batch API; it opens the exact resolved SellerChamp Batch so the quantity can be edited there. The SKU is copied to the clipboard as a fallback. Normal SellerChamp inventory locations retain the direct Update Qty function added in v2.24.

## v2.32.0
Corrects Product-vs-Batch authority. Finding a SKU in a historical Batch no longer forces Batch mode. If SellerChamp Products returns inventory-location records, the app keeps Product mode and allows direct Move Item / Update Qty. Batch mode is now only used as the inventory fallback when Products returns both no inventory locations and zero available quantity, matching the not-yet-submitted case. Batch metadata/button may still be shown for submitted products without changing their write mode. The server-side prohibition on Batch writes remains.

## v2.32.0
Fixes submitted-vs-unsubmitted Batch classification using SellerChamp's documented `quantity_listed` field on manifest product listings. A matching Batch row with `quantity_listed > 0` is treated as submitted. For submitted rows, the lookup follows that listing's exact `product_id`, fetches the Product record and its inventory locations, and keeps Product mode so Move Item / Update Qty can operate on real inventory-location IDs. Draft/unsubmitted rows (`quantity_listed == 0`) continue to use safe Batch fallback and remain blocked from API writes. When duplicate Batch rows match the same SKU, a submitted match is preferred within the returned page. Batch diagnostics now report quantity_listed/list_status/considered_submitted.

## v2.32.0
Separates Product and Batch controls into explicit dynamic workflows. The server now returns `workflow: product|batch`. The browser no longer decides which buttons to show merely because a Batch history exists or because `mode` was changed earlier. Product workflow renders direct Update Qty and Move Item controls. Unsubmitted Batch workflow renders Update Quantity in SellerChamp and Batch Move Disabled / Open SellerChamp Batch Instead. A visible WORKFLOW label was added temporarily to make warehouse testing unambiguous. Batch API writes remain blocked server-side.

## v2.32.0
Performance update: Product inventory is now the fast path. If the Products lookup returns a real writable inventory-location ID, the server returns immediately and skips the expensive manifest/Batch scan. Batch lookup runs only when Products does not provide usable inventory. The dynamic Product-vs-Unsubmitted-Batch controls from v2.28 remain unchanged, and Batch writes remain blocked.

## v2.32.0
Quantity editor improvement/fix. Replaces Safari's JavaScript prompt with an in-app quantity modal using `type=number`, `inputmode=numeric`, and numeric pattern so iPhone opens the number-oriented keyboard. Fixes the `Can't find variable: lookupItem` error after a successful quantity update: the app now refreshes through the existing `/api/lookup` endpoint and `showProduct()`, preserving the fast Products-first lookup path.

## v2.32.0
Field 1 now supports product-title search. Exact SKU/UPC/ASIN lookup remains first and fast. If there is no exact match, the app searches SellerChamp Products by title and displays up to 30 choices; selecting one reruns the normal exact-SKU lookup so all existing Product/Batch workflow and safety behavior remains intact.

## v2.32.0
Fixes partial-title search. SellerChamp's Products endpoint did not reliably filter the `query`/`title` parameters used in v2.31. The app now pages through Products and performs a case-insensitive partial-title match server-side, returning up to 30 choices. Exact SKU/barcode lookup remains unchanged and fast.
