'use strict';

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.SELLERCHAMP_TOKEN || '';
const APP_PIN = process.env.APP_PIN || '';
const SC_BASE = 'https://app.sellerchamp.com';

app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function assertConfigured(req, res, next) {
  if (!TOKEN) return res.status(503).json({ error: 'SELLERCHAMP_TOKEN is not configured on the server.' });
  next();
}

function checkPin(req, res, next) {
  if (!APP_PIN) return next();
  const pin = req.get('x-app-pin') || '';
  if (pin !== APP_PIN) return res.status(401).json({ error: 'Incorrect app PIN.' });
  next();
}

app.use('/api', assertConfigured, checkPin);

async function scFetch(endpoint, options = {}) {
  const response = await fetch(`${SC_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Token': TOKEN,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    const err = new Error(`SellerChamp returned ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function normalizeMasterProduct(p) {
  return {
    mode: 'catalog',
    id: p.id,
    sku: p.catalogue_sku || '',
    catalogue_sku: p.catalogue_sku || '',
    upc: p.upc || '',
    asin: p.asin || '',
    title: p.title || '',
    image: p.primary_image || p.images?.[0]?.large_url || p.images?.[0]?.image_url || '',
    quantity_available: Number(p.quantity_available || 0),
    item_remarks: p.item_remarks || '',
    notes_product_id: p.id,
    locations: (p.inventory_locations || []).map(x => ({
      id: x.id || '',
      location: x.location || '',
      quantity_available: Number(x.quantity_available || 0)
    }))
  };
}

function normalizeLegacyProduct(p) {
  return {
    mode: 'legacy',
    id: p.id,
    sku: p.sku || '',
    catalogue_sku: p.custom_catalogue_sku || p.catalog_sku || '',
    upc: p.upc || '',
    asin: p.asin || '',
    title: p.title || '',
    image: p.product_images?.[0]?.large_image_url || p.product_images?.[0]?.original_image_url || '',
    quantity_available: Number(p.quantity_available || 0),
    item_remarks: p.item_remarks || '',
    notes_product_id: p.id,
    locations: (p.inventory_locations || []).map(x => ({
      id: x.id || '',
      location: x.location || '',
      quantity_available: Number(x.quantity_available || 0),
      priority: Number(x.priority || 1),
      delete_if_empty: x.delete_if_empty !== false
    }))
  };
}

async function getLegacyProductForNotes(code) {
  const product = await lookupLegacy(code);
  return product ? {
    id: product.id,
    item_remarks: product.item_remarks || ''
  } : null;
}

async function prependPreviousLocation(notesProductId, oldLocation, knownRemarks = '') {
  if (!notesProductId) {
    return { updated: false, warning: 'No standard SellerChamp listing was found for updating Notes.' };
  }

  let currentRemarks = String(knownRemarks || '');
  try {
    const detail = await scFetch(`/api/products/${encodeURIComponent(notesProductId)}.json`);
    const product = detail.product || detail;
    if (product && typeof product.item_remarks === 'string') currentRemarks = product.item_remarks;
  } catch (e) {
    // The lookup response already supplied remarks; use those if detail fetch is unavailable.
  }

  const prefix = `Previously on ${String(oldLocation).trim()} - `;
  const newRemarks = prefix + currentRemarks;
  await scFetch(`/api/products/${encodeURIComponent(notesProductId)}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: { item_remarks: newRemarks } })
  });
  return { updated: true, item_remarks: newRemarks };
}

async function lookupCatalog(code) {
  const attempts = [
    `/api/master_products?catalogue_sku=${encodeURIComponent(code)}&page=1&page_size=25`,
    `/api/master_products?upc=${encodeURIComponent(code)}&page=1&page_size=25`,
    `/api/master_products?asin=${encodeURIComponent(code)}&page=1&page_size=25`
  ];
  for (const endpoint of attempts) {
    try {
      const data = await scFetch(endpoint);
      const items = data.master_products || [];
      if (items.length) {
        const exact = items.find(p =>
          [p.catalogue_sku, p.upc, p.asin].filter(Boolean).some(v => String(v).toLowerCase() === code.toLowerCase())
        );
        return normalizeMasterProduct(exact || items[0]);
      }
    } catch (e) {
      // Catalog Sync disabled is a normal fallback case.
      if (![400, 404, 422].includes(e.status)) throw e;
    }
  }
  return null;
}

async function lookupLegacy(code) {
  const attempts = [
    `/api/products.json?sku=${encodeURIComponent(code)}&page=1&page_size=25`,
    `/api/products.json?upc=${encodeURIComponent(code)}&page=1&page_size=25`,
    `/api/products.json?asin=${encodeURIComponent(code)}&page=1&page_size=25`
  ];
  for (const endpoint of attempts) {
    try {
      const data = await scFetch(endpoint);
      const items = data.products || [];
      if (items.length) {
        const exact = items.find(p => [p.sku, p.upc, p.asin].filter(Boolean).some(v => String(v).toLowerCase() === code.toLowerCase()));
        const p = exact || items[0];
        // Get authoritative location list because list responses may omit/lag it.
        try {
          const locData = await scFetch(`/api/products/${encodeURIComponent(p.id)}/inventory_locations`);
          p.inventory_locations = locData.inventory_locations || p.inventory_locations || [];
        } catch {}
        return normalizeLegacyProduct(p);
      }
    } catch (e) {
      if (![400, 404].includes(e.status)) throw e;
    }
  }
  return null;
}

app.get('/api/status', async (req, res) => {
  try {
    const data = await scFetch('/api/marketplace_accounts');
    res.json({ ok: true, pinRequired: !!APP_PIN, accounts: (data.marketplace_accounts || []).map(a => ({ id: a.id, name: a.name, marketplace: a.marketplace })) });
  } catch (e) {
    res.status(e.status || 500).json({ error: 'Could not connect to SellerChamp.', details: e.data || e.message });
  }
});

app.get('/api/lookup', async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Enter or scan an SKU/barcode.' });
  try {
    const catalog = await lookupCatalog(code);
    if (catalog) {
      try {
        const notesProduct = await getLegacyProductForNotes(code);
        if (notesProduct) {
          catalog.notes_product_id = notesProduct.id;
          catalog.item_remarks = notesProduct.item_remarks || '';
        }
      } catch {}
      return res.json({ product: catalog });
    }
    const legacy = await lookupLegacy(code);
    if (legacy) return res.json({ product: legacy });
    res.status(404).json({ error: `No SellerChamp item matched “${code}”.` });
  } catch (e) {
    res.status(e.status || 500).json({ error: 'SellerChamp lookup failed.', details: e.data || e.message });
  }
});

app.post('/api/move', async (req, res) => {
  const { mode, productId, fromLocation, toLocation, quantity, allQuantity, sourceLocationId, notesProductId, currentRemarks } = req.body || {};
  if (!productId || !fromLocation || !toLocation) return res.status(400).json({ error: 'Product, source location, and destination location are required.' });
  if (String(fromLocation).trim().toLowerCase() === String(toLocation).trim().toLowerCase()) return res.status(400).json({ error: 'The new location is the same as the current location.' });

  try {
    if (mode === 'catalog') {
      const body = {
        master_product_id: productId,
        inventory_action: 'transfer',
        from_location: String(fromLocation).trim(),
        location: String(toLocation).trim()
      };
      if (allQuantity) body.all_quantity = true;
      else {
        const q = Number(quantity);
        if (!Number.isInteger(q) || q <= 0) return res.status(400).json({ error: 'Quantity must be a whole number greater than zero.' });
        body.quantity = q;
      }
      const data = await scFetch('/api/master_product_inventory_locations/update_quantities', {
        method: 'POST', body: JSON.stringify(body)
      });

      let notes = { updated: false };
      try {
        notes = await prependPreviousLocation(notesProductId, fromLocation, currentRemarks);
      } catch (noteError) {
        notes = { updated: false, warning: 'Inventory moved, but SellerChamp Notes could not be updated.', details: noteError.data || noteError.message };
      }
      return res.json({ ok: true, mode: 'catalog', result: data, notes });
    }

    if (mode === 'legacy') {
      if (!sourceLocationId) return res.status(400).json({ error: 'Legacy SellerChamp location ID is missing. Look the item up again.' });
      if (!allQuantity) return res.status(400).json({ error: 'Partial moves require SellerChamp Catalog Sync. In legacy mode, move the full quantity at this location.' });

      const locData = await scFetch(`/api/products/${encodeURIComponent(productId)}/inventory_locations`);
      const source = (locData.inventory_locations || []).find(x => x.id === sourceLocationId || x.location === fromLocation);
      if (!source) return res.status(404).json({ error: 'The source location no longer exists. Look the item up again.' });

      const payload = {
        inventory_location: {
          location: String(toLocation).trim(),
          quantity_available: Number(source.quantity_available || 0),
          delete_if_empty: source.delete_if_empty !== false,
          priority: Number(source.priority || 1)
        }
      };
      const data = await scFetch(`/api/products/${encodeURIComponent(productId)}/inventory_locations/${encodeURIComponent(source.id)}`, {
        method: 'PUT', body: JSON.stringify(payload)
      });

      let notes = { updated: false };
      try {
        notes = await prependPreviousLocation(notesProductId || productId, fromLocation, currentRemarks);
      } catch (noteError) {
        notes = { updated: false, warning: 'Location moved, but SellerChamp Notes could not be updated.', details: noteError.data || noteError.message };
      }
      return res.json({ ok: true, mode: 'legacy', result: data, notes });
    }

    res.status(400).json({ error: 'Unknown inventory mode. Look the item up again.' });
  } catch (e) {
    const details = e.data || e.message;
    const error = e.status === 422 ? 'SellerChamp rejected the inventory change.' : 'SellerChamp move failed.';
    res.status(e.status || 500).json({ error, details });
  }
});

app.get('/api/locations', async (req, res) => {
  const query = String(req.query.q || '').trim();
  try {
    const data = await scFetch(`/api/master_product_inventory_locations?query=${encodeURIComponent(query)}&page=1&page_size=50`);
    res.json({ locations: data.inventory_locations || data.locations || [] });
  } catch (e) {
    // Catalog Sync may be disabled; autocomplete is optional.
    res.json({ locations: [] });
  }
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`SellerChamp Location Mover running on port ${PORT}`));
