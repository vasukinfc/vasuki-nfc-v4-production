import { db, ref, set, get, update, remove, push, runTransaction } from '../firebase.js';

export { db, ref, set, get, update, remove, push, runTransaction };
export const ADMIN_KEY = 'vasuki_admin_v4_prod';
export const CUSTOMER_KEY = 'vasuki_customer_v4_prod';
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'Vasuki@2026';

export const defaultSettings = {
  brandName: 'Vasuki NFC',
  planName: 'Digital NFC Card',
  planPrice: 499,
  planDays: 365,
  currency: '₹',
  renewalBeforeDays: 30,
  website: 'https://vasukinfc.in',
  whatsapp: '916377393721',
  defaultTheme: 'gold',
  branding: true
};

export const themes = ['gold','blue','white','green','purple','corporate','minimal','neon','royal','dark'];
export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));
export const esc = v => String(v ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
export const phone = v => String(v ?? '').replace(/[^0-9]/g,'');
export const safeUrl = v => { v = String(v ?? '').trim(); return /^https?:\/\//i.test(v) ? v : ''; };
export const cleanUsername = v => String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9_-]/g,'').slice(0,32);
export const todayISO = () => new Date().toISOString().slice(0,10);
export function addDays(days){ const d = new Date(); d.setDate(d.getDate()+Number(days||365)); return d.toISOString().slice(0,10); }
export function expired(date){ return !!date && new Date(date+'T23:59:59') < new Date(); }
export function daysLeft(date){ if(!date) return 0; return Math.ceil((new Date(date+'T23:59:59')-new Date())/86400000); }
export function formData(form){ return Object.fromEntries(new FormData(form).entries()); }
export function toast(msg){ let t=$('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); } t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
export async function sha(text){ const data = new TextEncoder().encode(String(text)); const hash = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export async function getSettings(){ const s = (await get(ref(db,'settings'))).val(); return {...defaultSettings, ...(s||{})}; }
export async function saveLog(action, detail=''){ await push(ref(db,'activityLogs'), {action, detail, date:new Date().toISOString()}); }
export async function track(username, field){ try{ await runTransaction(ref(db,`analytics/${username}/${field}`), v => (v||0)+1); }catch(e){} }
export function cardUrl(username){ return `${location.origin}${location.pathname.replace(/\/[^/]*$/,'/') }card/?u=${encodeURIComponent(username)}`.replace('/card/card/','/card/'); }
export function pageUrl(page){ return `${location.origin}${location.pathname.replace(/\/[^/]*$/,'/')}${page}`; }
export function qrUrl(value,size=220){ return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`; }
export function splitLines(v, max=20){ return String(v||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,max); }
export function sanitizeCustomer(d){
  return {
    name: String(d.name||'').trim().slice(0,80), businessName: String(d.businessName||'').trim().slice(0,100),
    mobile1: phone(d.mobile1), mobile2: phone(d.mobile2), whatsapp: phone(d.whatsapp||d.mobile1), email: String(d.email||'').trim().slice(0,120),
    address: String(d.address||'').trim().slice(0,250), mapUrl: safeUrl(d.mapUrl), websiteUrl: safeUrl(d.websiteUrl),
    profileUrl: safeUrl(d.profileUrl), backgroundUrl: safeUrl(d.backgroundUrl), logoUrl: safeUrl(d.logoUrl), paymentQrUrl: safeUrl(d.paymentQrUrl),
    productImageUrls: splitLines(d.productImageUrls,10).map(safeUrl).filter(Boolean).join('\n'),
    services: splitLines(d.services,10).join('\n'), about: String(d.about||'').trim().slice(0,500), businessHours: String(d.businessHours||'').trim().slice(0,240),
    instagram: safeUrl(d.instagram), facebook: safeUrl(d.facebook), youtube: safeUrl(d.youtube), linkedin: safeUrl(d.linkedin),
    theme: themes.includes(d.theme) ? d.theme : 'gold'
  };
}
export function themeOptions(selected='gold'){ return themes.map(t=>`<option value="${t}" ${selected===t?'selected':''}>${t[0].toUpperCase()+t.slice(1)}</option>`).join(''); }
export function renderMiniCard(c={}, settings=defaultSettings){
  const cover = safeUrl(c.backgroundUrl); const avatar = safeUrl(c.profileUrl)||safeUrl(c.logoUrl); const theme = c.theme||settings.defaultTheme||'gold';
  return `<div class="card-phone theme-${theme}"><div class="cover" ${cover?`style="background-image:url('${cover}')"`:''}></div>${avatar?`<img class="avatar" src="${avatar}" onerror="this.style.display='none'">`:`<div class="avatar avatar-text">V</div>`}<h2>${esc(c.name)||'Customer Name'}</h2><p class="muted">${esc(c.businessName)||'Business Name'}</p>${c.about?`<p>${esc(c.about)}</p>`:''}<div class="quick"><span>Call</span><span>WhatsApp</span><span>Location</span><span>Website</span></div><div class="powered">Powered by <b>${esc(settings.brandName)}</b></div></div>`;
}
export function requireAdmin(){ if(localStorage.getItem(ADMIN_KEY)!=='yes') location.href='../admin-login.html'; }
export function requireCustomer(){ const u=localStorage.getItem(CUSTOMER_KEY); if(!u) location.href='../customer-login.html'; return u; }
