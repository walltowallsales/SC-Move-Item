const $ = id => document.getElementById(id);
let currentProduct = null;
let cameraStream = null;
let detectorTimer = null;
let lookupState = 'item';

const state = {
  pin: sessionStorage.getItem('appPin') || '',
  rapid: localStorage.getItem('rapidMode') === '1',
  history: JSON.parse(localStorage.getItem('moveHistory') || '[]')
};

$('rapidMode').checked = state.rapid;
renderHistory();

function apiHeaders() { return state.pin ? { 'x-app-pin': state.pin } : {}; }
async function api(url, options={}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type':'application/json', ...apiHeaders(), ...(options.headers||{}) } });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) {
    const detail = Array.isArray(data.details?.errors) ? data.details.errors.join(' ') : (data.details?.errors || data.details?.error || '');
    throw new Error([data.error, detail].filter(Boolean).join(' '));
  }
  return data;
}
function toast(msg,type='') { const t=$('toast'); t.textContent=msg; t.className=`toast ${type}`; clearTimeout(t._timer); t._timer=setTimeout(()=>t.className='toast hidden',3500); }
function busy(btn,on,label) { if(on){btn.dataset.old=btn.textContent;btn.textContent=label;btn.disabled=true}else{btn.textContent=btn.dataset.old||btn.textContent;btn.disabled=false} }

async function checkStatus(){
  try{
    const data=await api('/api/status');
    $('connection').textContent='SellerChamp connected'; if($('appVersion')) $('appVersion').textContent='v'+(data.version||'2.28.0'); $('connection').className='status ok'; $('pinCard').classList.add('hidden');
  }catch(e){
    $('connection').textContent=e.message.includes('PIN')?'PIN required':'Not connected'; $('connection').className='status bad';
    if(e.message.includes('PIN')) $('pinCard').classList.remove('hidden');
  }
}

$('savePin').onclick=()=>{state.pin=$('pin').value.trim();sessionStorage.setItem('appPin',state.pin);checkStatus();};
$('lookup').addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();findItem();} });
$('findBtn').onclick=findItem;
$('openProductBtn').onclick=()=>{const u=$('openProductBtn').dataset.url;if(u)window.open(u,'_blank','noopener');};
$('openBatchBtn').onclick=async()=>{
  const u=$('openBatchBtn').dataset.url;
  if(!u)return;
  const sku=currentProduct?.sku||currentProduct?.catalogue_sku||currentProduct?.upc||'';
  try{ if(sku && navigator.clipboard) await navigator.clipboard.writeText(sku); }catch{}
  window.open(u,'_blank','noopener');
};

async function findItem(){
  const code=$('lookup').value.trim(); if(!code) return toast('Scan or enter an item first.','error');
  busy($('findBtn'),true,'Finding…');
  try{
    const data=await api(`/api/lookup?code=${encodeURIComponent(code)}`); currentProduct=data.product; showProduct();
    if(state.rapid){ lookupState='destination'; $('toLocation').focus(); toast('Item found. Scan the destination location.'); }
  }catch(e){currentProduct=null;$('productCard').classList.add('hidden');toast(e.message,'error');}
  finally{busy($('findBtn'),false);}
}

function showProduct(){
  const p=currentProduct; $('productCard').classList.remove('hidden');
  const sku=p.sku||p.catalogue_sku||p.upc||'—';
  $('sku').textContent=`SKU  ${sku}`;
  $('title').textContent=p.title||'Untitled item';
  const productBtn=$('openProductBtn'), batchBtn=$('openBatchBtn');
  const skuForLink=p.sku||p.catalogue_sku||p.upc||'';
  productBtn.dataset.url=skuForLink?`https://app2.sellerchamp.com/products?product%5Bquery%5D=${encodeURIComponent(skuForLink)}`:'';
  batchBtn.dataset.url=p.sellerchamp_batch_url||'';
  batchBtn.disabled=!p.sellerchamp_batch_url;
  batchBtn.title=p.batch_found?(p.manifest_name?`Open batch: ${p.manifest_name}`:'Open originating SellerChamp batch'):'No originating batch was found';
  let bi=$('batchInfo');
  if(!bi){bi=document.createElement('div');bi.id='batchInfo';bi.style.cssText='margin-top:6px;font-size:.9rem;font-weight:700;';batchBtn.parentElement.appendChild(bi);}
  bi.textContent=p.batch_found?`Batch: ${p.manifest_name||p.manifest_id}`:'Batch: not found';
  let wi=$('workflowInfo');
  if(!wi){wi=document.createElement('div');wi.id='workflowInfo';wi.style.cssText='margin-top:4px;font-size:.82rem;font-weight:800;';bi.parentElement.appendChild(wi);}
  wi.textContent=p.workflow==='batch'?'WORKFLOW: UNSUBMITTED BATCH':'WORKFLOW: PRODUCTS';
  productBtn.disabled=!skuForLink;
  if(p.image){
    $('productImage').src=p.image;
    $('productImage').classList.remove('hidden');
    $('productImage').onerror=()=>{$('productImage').classList.add('hidden');};
  }else $('productImage').classList.add('hidden');

  const locations=Array.isArray(p.locations)?p.locations:[];
  const all=$('allLocations');
  if(!locations.length){
    all.innerHTML='<div class="location-empty">No inventory locations found.</div>';
  } else {
    all.innerHTML=locations.map((l,i)=>{
      const qty=Number(l.quantity_available||0);
      const canDelete=qty===0 && l.id && p.mode==='legacy';
      const isBatchWorkflow=p.workflow==='batch';
      const canUpdateQty=!isBatchWorkflow && l.id;
      const qtyButton=isBatchWorkflow
        ? `<button class="update-batch-qty" type="button">UPDATE QUANTITY<br><span class="batch-qty-sub">IN SELLERCHAMP</span></button>`
        : (canUpdateQty?`<button class="update-qty" type="button" data-location-index="${i}">Update Qty</button>`:'');
      return `<div class="location-row"><span class="location-name">${escapeHtml(l.location||'—')}</span><span class="location-actions"><span class="location-qty">Qty ${qty}</span>${qtyButton}${canDelete?`<button class="delete-zero" type="button" data-location-index="${i}">Delete Location</button>`:''}</span></div>`;
    }).join('');
    all.querySelectorAll('.update-batch-qty').forEach(btn=>{
      btn.onclick=()=>openBatchForManualUpdate();
    });
    all.querySelectorAll('.update-qty').forEach(btn=>{
      btn.onclick=()=>updateLocationQuantity(Number(btn.dataset.locationIndex));
    });
    all.querySelectorAll('.delete-zero').forEach(btn=>{
      btn.onclick=()=>deleteZeroLocation(Number(btn.dataset.locationIndex));
    });
  }

  const sel=$('fromLocation'); sel.innerHTML='';
  if(!locations.length){const o=new Option('No inventory location found','');sel.add(o);}
  locations.forEach((l,i)=>{const o=new Option(`${l.location} — Qty ${l.quantity_available}`,String(i));sel.add(o)});
  sel.value=locations.length?'0':''; updateSourceQty();
  $('moveAll').checked=true;$('partialQtyWrap').classList.add('hidden');$('toLocation').value='';
  const isBatchWorkflow=p.workflow==='batch';
  $('moveAll').disabled=p.mode==='legacy' || isBatchWorkflow;
  $('moveBtn').disabled=false;
  if(isBatchWorkflow){
    $('moveAll').checked=true;
    $('qtyControls').title='Batch location changes must be made in SellerChamp.';
    $('moveBtn').innerHTML='BATCH MOVE DISABLED<br><span class="batch-open-sub">OPEN SELLERCHAMP BATCH INSTEAD</span>';
    $('moveBtn').classList.add('batch-open');
    toast(`Found in SellerChamp Batch${p.manifest_name?`: ${p.manifest_name}`:''}. Tap the button below to open that Batch in SellerChamp.`);
  }else{
    $('moveBtn').textContent='MOVE ITEM';
    $('moveBtn').classList.remove('batch-open');
  }
  if(p.mode==='legacy'){$('moveAll').checked=true;$('qtyControls').title='Partial transfers require Catalog Sync.';}
  else $('qtyControls').title='';

  // Warehouse flow: after an item is scanned/found, the next keystroke or
  // Bluetooth scanner input should go straight into New Location.
  requestAnimationFrame(()=>{
    $('toLocation').focus({preventScroll:true});
    try{$('toLocation').select();}catch{}
  });
}


function openBatchForManualUpdate(){
  if(!currentProduct)return toast('Find an item first.','error');
  const u=$('openBatchBtn')?.dataset?.url || '';
  const sku=currentProduct.sku||currentProduct.catalogue_sku||currentProduct.upc||'';
  try{if(sku && navigator.clipboard) navigator.clipboard.writeText(sku);}catch{}
  if(!u)return toast('SellerChamp Batch link is unavailable. Look the item up again.','error');
  window.open(u,'_blank','noopener');
}

async function updateLocationQuantity(index){
  if(!currentProduct || currentProduct.workflow==='batch') return toast('Batch quantities must be changed in SellerChamp.','error');
  const loc=(currentProduct.locations||[])[index];
  if(!loc || !loc.id) return toast('This location cannot be updated here.','error');
  const raw=prompt(`Update quantity at ${loc.location}\n\nCurrent quantity: ${Number(loc.quantity_available||0)}\n\nEnter the new total quantity:`,String(Number(loc.quantity_available||0)));
  if(raw===null)return;
  const qty=Number(String(raw).trim());
  if(!Number.isInteger(qty) || qty<0)return toast('Quantity must be a whole number of 0 or greater.','error');
  const oldQty=Number(loc.quantity_available||0);
  if(qty===oldQty)return toast('Quantity is already '+qty+'.');
  if(!confirm(`Change ${loc.location} from Qty ${oldQty} to Qty ${qty}?`))return;
  try{
    await api('/api/update-location-quantity',{method:'POST',body:JSON.stringify({
      mode:currentProduct.mode,productId:currentProduct.id,locationId:loc.id,
      location:loc.location,newQuantity:qty,sku:currentProduct.sku||currentProduct.catalogue_sku||currentProduct.upc||'',
      title:currentProduct.title||''
    })});
    toast(`Quantity updated: ${loc.location} — Qty ${qty}`);
    await lookupItem(currentProduct.sku||currentProduct.catalogue_sku||currentProduct.upc||'');
  }catch(e){toast(e.message,'error');}
}

async function deleteZeroLocation(index){
  if(!currentProduct)return;
  const loc=currentProduct.locations[index];
  if(!loc || Number(loc.quantity_available||0)!==0 || !loc.id)return;
  const name=loc.location||'(blank location)';
  if(!window.confirm(`Delete the zero-quantity location "${name}" from this item?`))return;
  try{
    await api('/api/inventory-location',{
      method:'DELETE',
      body:JSON.stringify({productId:currentProduct.id,locationId:loc.id,sku:currentProduct.sku||currentProduct.catalogue_sku||'',title:currentProduct.title||''})
    });
    toast(`Deleted zero-quantity location: ${name}`,'success');
    const code=currentProduct.sku||currentProduct.catalogue_sku||currentProduct.upc||'';
    if(code){
      const data=await api(`/api/lookup?code=${encodeURIComponent(code)}`);
      currentProduct=data.product;
      showProduct();
    }
  }catch(e){toast(e.message,'error');}
}

$('fromLocation').onchange=updateSourceQty;
function selectedLocation(){const p=currentProduct;if(!p)return null;const i=Number($('fromLocation').value);return Number.isInteger(i)?p.locations[i]:null;}
function updateSourceQty(){const l=selectedLocation();$('sourceQty').textContent=l?`Available at this location: ${l.quantity_available}`:'';if(l)$('moveQty').max=l.quantity_available;}
$('moveAll').onchange=()=>{$('partialQtyWrap').classList.toggle('hidden',$('moveAll').checked);};

let locDebounce;
$('toLocation').addEventListener('input',()=>{clearTimeout(locDebounce);locDebounce=setTimeout(loadLocationSuggestions,220)});
$('toLocation').addEventListener('keydown',e=>{if(e.key==='Enter' && state.rapid){e.preventDefault();moveItem();}});
async function loadLocationSuggestions(){const q=$('toLocation').value.trim();if(!q)return;try{const d=await api(`/api/locations?q=${encodeURIComponent(q)}`);const list=$('locationSuggestions');list.innerHTML='';(d.locations||[]).forEach(x=>{const v=typeof x==='string'?x:(x.location||x.name||'');if(v)list.appendChild(new Option(v,v));});}catch{}}

$('moveBtn').onclick=moveItem;
async function moveItem(){
  if(!currentProduct)return toast('Find an item first.','error');
  if(currentProduct.mode==='batch'){
    openBatchForManualUpdate();
    return;
  } const source=selectedLocation(); if(!source)return toast('This item has no source location to move.','error');
  let destination=$('toLocation').value.trim(); if(!destination)return toast('Enter or scan the new location.','error');
  if(destination.length%2===0){
    const half=destination.slice(0,destination.length/2);
    if(half && destination===half+half){destination=half;$('toLocation').value=half;}
  }
  const all=$('moveAll').checked; const qty=all?source.quantity_available:Number($('moveQty').value);
  if(!all && (!Number.isInteger(qty)||qty<1||qty>source.quantity_available)) return toast('Enter a valid quantity to move.','error');
  busy($('moveBtn'),true,'MOVING…');
  try{
    const result=await api('/api/move',{method:'POST',body:JSON.stringify({mode:currentProduct.mode,productId:currentProduct.id,fromLocation:source.location,toLocation:destination,quantity:qty,allQuantity:all,sourceLocationId:source.id,manifestId:currentProduct.manifest_id||'',batchListingId:currentProduct.batch_listing_id||'',sku:currentProduct.sku||currentProduct.catalogue_sku||currentProduct.upc||'',title:currentProduct.title||''})});
    addHistory({sku:currentProduct.sku||currentProduct.catalogue_sku,title:currentProduct.title,from:source.location,to:destination,qty:all?source.quantity_available:qty,time:new Date().toISOString()});
    showMoveConfirmation({
      sku: currentProduct.sku||currentProduct.catalogue_sku||'Item',
      title: currentProduct.title||'',
      from: source.location,
      to: destination,
      qty: all?source.quantity_available:qty
    });
  }catch(e){toast(e.message,'error');}
  finally{busy($('moveBtn'),false);}
}

function showMoveConfirmation(m){
  $('confirmText').innerHTML=`<div><strong>SKU:</strong> ${escapeHtml(m.sku)}</div>${m.title?`<div class="confirm-title">${escapeHtml(m.title)}</div>`:''}<div class="confirm-route"><strong>${escapeHtml(m.from)}</strong> → <strong>${escapeHtml(m.to)}</strong></div><div>Quantity moved: <strong>${Number(m.qty||0)}</strong></div>`;
  $('moveConfirm').classList.remove('hidden');
  setTimeout(()=>$('confirmOk').focus(),0);
}
$('confirmOk').onclick=()=>{
  $('moveConfirm').classList.add('hidden');
  clearForNext();
  requestAnimationFrame(()=>$('lookup').focus({preventScroll:false}));
};

function clearForNext(){currentProduct=null;$('productCard').classList.add('hidden');$('lookup').value='';lookupState='item';$('lookup').focus();}
$('clearBtn').onclick=clearForNext;
$('rapidMode').onchange=()=>{state.rapid=$('rapidMode').checked;localStorage.setItem('rapidMode',state.rapid?'1':'0');if(state.rapid)toast('Rapid Move Mode on: scan item, then destination.');};

function addHistory(item){state.history.unshift(item);state.history=state.history.slice(0,30);localStorage.setItem('moveHistory',JSON.stringify(state.history));renderHistory();}
function renderHistory(){const h=$('history');if(!state.history.length){h.className='history empty';h.textContent='No moves yet.';return}h.className='history';h.innerHTML=state.history.map(x=>`<div class="history-item"><div class="history-top"><span>${escapeHtml(x.sku||'Item')}</span><span class="history-time">${new Date(x.time).toLocaleString()}</span></div><div class="history-route">${escapeHtml(x.from)} → <strong>${escapeHtml(x.to)}</strong> · Qty ${Number(x.qty||0)}</div></div>`).join('');}
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
$('clearHistory').onclick=()=>{state.history=[];localStorage.removeItem('moveHistory');renderHistory();};

checkStatus();$('lookup').focus();
