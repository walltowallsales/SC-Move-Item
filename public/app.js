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
    $('connection').textContent='SellerChamp connected'; $('connection').className='status ok'; $('pinCard').classList.add('hidden');
  }catch(e){
    $('connection').textContent=e.message.includes('PIN')?'PIN required':'Not connected'; $('connection').className='status bad';
    if(e.message.includes('PIN')) $('pinCard').classList.remove('hidden');
  }
}

$('savePin').onclick=()=>{state.pin=$('pin').value.trim();sessionStorage.setItem('appPin',state.pin);checkStatus();};
$('lookup').addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();findItem();} });
$('findBtn').onclick=findItem;

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
  $('sku').textContent=p.sku||p.catalogue_sku||p.upc||''; $('title').textContent=p.title||'Untitled item';
  $('modeBadge').textContent=p.mode==='catalog'?'Catalog Sync transfer':'Standard SellerChamp location';
  if(p.image){$('productImage').src=p.image;$('productImage').classList.remove('hidden')}else $('productImage').classList.add('hidden');
  const sel=$('fromLocation'); sel.innerHTML='';
  if(!p.locations.length){const o=new Option('No inventory location found','');sel.add(o);}
  p.locations.forEach((l,i)=>{const o=new Option(`${l.location} — Qty ${l.quantity_available}`,String(i));sel.add(o)});
  sel.value=p.locations.length?'0':''; updateSourceQty();
  $('moveAll').checked=true;$('partialQtyWrap').classList.add('hidden');$('toLocation').value='';
  $('moveAll').disabled=p.mode==='legacy';
  if(p.mode==='legacy'){$('moveAll').checked=true;$('qtyControls').title='Partial transfers require Catalog Sync.';}
  else $('qtyControls').title='';
  $('toLocation').focus();
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
  if(!currentProduct)return toast('Find an item first.','error'); const source=selectedLocation(); if(!source)return toast('This item has no source location to move.','error');
  const destination=$('toLocation').value.trim(); if(!destination)return toast('Enter or scan the new location.','error');
  const all=$('moveAll').checked; const qty=all?source.quantity_available:Number($('moveQty').value);
  if(!all && (!Number.isInteger(qty)||qty<1||qty>source.quantity_available)) return toast('Enter a valid quantity to move.','error');
  busy($('moveBtn'),true,'MOVING…');
  try{
    const result=await api('/api/move',{method:'POST',body:JSON.stringify({mode:currentProduct.mode,productId:currentProduct.id,fromLocation:source.location,toLocation:destination,quantity:qty,allQuantity:all,sourceLocationId:source.id,notesProductId:currentProduct.notes_product_id||currentProduct.id,currentRemarks:currentProduct.item_remarks||''})});
    addHistory({sku:currentProduct.sku||currentProduct.catalogue_sku,title:currentProduct.title,from:source.location,to:destination,qty:all?source.quantity_available:qty,time:new Date().toISOString()});
    if(result.notes?.warning) toast(`Moved successfully, but Notes update failed: ${result.notes.warning}`,'error');
    else toast(`Moved ${currentProduct.sku||'item'}: ${source.location} → ${destination} · Notes updated`,'success');
    if(state.rapid) clearForNext(); else { $('lookup').value=currentProduct.sku||currentProduct.catalogue_sku||''; await findItem(); }
  }catch(e){toast(e.message,'error');}
  finally{busy($('moveBtn'),false);}
}

function clearForNext(){currentProduct=null;$('productCard').classList.add('hidden');$('lookup').value='';lookupState='item';$('lookup').focus();}
$('clearBtn').onclick=clearForNext;
$('rapidMode').onchange=()=>{state.rapid=$('rapidMode').checked;localStorage.setItem('rapidMode',state.rapid?'1':'0');if(state.rapid)toast('Rapid Move Mode on: scan item, then destination.');};

function addHistory(item){state.history.unshift(item);state.history=state.history.slice(0,30);localStorage.setItem('moveHistory',JSON.stringify(state.history));renderHistory();}
function renderHistory(){const h=$('history');if(!state.history.length){h.className='history empty';h.textContent='No moves yet.';return}h.className='history';h.innerHTML=state.history.map(x=>`<div class="history-item"><div class="history-top"><span>${escapeHtml(x.sku||'Item')}</span><span class="history-time">${new Date(x.time).toLocaleString()}</span></div><div class="history-route">${escapeHtml(x.from)} → <strong>${escapeHtml(x.to)}</strong> · Qty ${Number(x.qty||0)}</div></div>`).join('');}
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
$('clearHistory').onclick=()=>{state.history=[];localStorage.removeItem('moveHistory');renderHistory();};

$('cameraBtn').onclick=()=>startCamera('item');
$('locationCameraBtn').onclick=()=>startCamera('location');
$('stopCamera').onclick=stopCamera;
let zxingReader = null;
let cameraTarget = 'item';

async function startCamera(target='item'){
  cameraTarget=target;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    return toast('Camera access is not available in this browser.','error');
  }
  if(typeof ZXing==='undefined' || !ZXing.BrowserMultiFormatReader){
    return toast('The camera scanner did not load. Check your internet connection and reload the page.','error');
  }
  stopCamera();
  $('cameraWrap').classList.remove('hidden');
  $('stopCamera').textContent=target==='location'?'Stop destination scan':'Stop Camera';
  try{
    zxingReader=new ZXing.BrowserMultiFormatReader();
    await zxingReader.decodeFromVideoDevice(undefined,$('camera'),(result,err)=>{
      if(!result)return;
      const value=(result.getText?result.getText():result.text||'').trim();
      if(!value)return;
      const thisTarget=cameraTarget;
      stopCamera();
      if(thisTarget==='location'){
        $('toLocation').value=value;
        loadLocationSuggestions();
        if(state.rapid){
          toast(`Destination scanned: ${value}`,'success');
          setTimeout(()=>moveItem(),150);
        } else {
          toast(`Destination scanned: ${value}`,'success');
          $('moveBtn').focus();
        }
      } else {
        $('lookup').value=value;
        toast(`Barcode scanned: ${value}`,'success');
        findItem();
      }
    });
  }catch(e){
    stopCamera();
    const name=e && e.name ? e.name : '';
    if(name==='NotAllowedError' || name==='PermissionDeniedError'){
      toast('Camera permission was denied. In iPhone Settings, allow Safari camera access, then try again.','error');
    } else {
      toast('Could not open the camera. Make sure no other app is using it and camera permission is allowed.','error');
    }
  }
}
function stopCamera(){
  if(detectorTimer)clearTimeout(detectorTimer);
  detectorTimer=null;
  if(zxingReader){try{zxingReader.reset();}catch{} zxingReader=null;}
  const video=$('camera');
  if(video && video.srcObject){try{video.srcObject.getTracks().forEach(t=>t.stop());}catch{} video.srcObject=null;}
  if(cameraStream){try{cameraStream.getTracks().forEach(t=>t.stop());}catch{} cameraStream=null;}
  $('cameraWrap').classList.add('hidden');
}

checkStatus();$('lookup').focus();
