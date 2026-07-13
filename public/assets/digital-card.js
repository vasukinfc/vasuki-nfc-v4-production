/**
 * Dynamic Public Digital Card.
 *
 * Renders only published API data, keeps all DOM writes text-based, and
 * provides progressive enhancement for sharing, vCard, QR, live preview, and
 * installation.
 */

import {
  CARD_THEMES,
  CARD_TEMPLATES,
  applyCardTemplate,
  getCardTemplate,
  templatesForTheme,
} from './digital-card-templates.js';

const elements = {
  page: document.body,
  loading: document.getElementById('cardLoading'),
  error: document.getElementById('cardError'),
  errorMessage: document.getElementById('cardErrorMessage'),
  retry: document.getElementById('cardRetryButton'),
  card: document.getElementById('digitalCard'),
  cover: document.querySelector('.digital-card-cover'),
  avatar: document.getElementById('cardAvatar'),
  logo: document.getElementById('cardLogo'),
  initials: document.getElementById('cardInitials'),
  name: document.getElementById('cardName'),
  title: document.getElementById('cardTitle'),
  company: document.getElementById('cardCompany'),
  tagline: document.getElementById('cardTagline'),
  bio: document.getElementById('cardBio'),
  phone: document.getElementById('cardPhone'),
  email: document.getElementById('cardEmail'),
  website: document.getElementById('cardWebsite'),
  address: document.getElementById('cardAddress'),
  phoneDetail: document.getElementById('phoneDetail'),
  emailDetail: document.getElementById('emailDetail'),
  websiteDetail: document.getElementById('websiteDetail'),
  locationDetail: document.getElementById('locationDetail'),
  callAction: document.getElementById('callAction'),
  whatsappAction: document.getElementById('whatsappAction'),
  emailAction: document.getElementById('emailAction'),
  servicesSection: document.getElementById('servicesSection'),
  services: document.getElementById('cardServices'),
  productsSection: document.getElementById('productsSection'),
  products: document.getElementById('cardProducts'),
  businessHoursSection: document.getElementById('businessHoursSection'),
  businessHours: document.getElementById('cardBusinessHours'),
  gallerySection: document.getElementById('gallerySection'),
  gallery: document.getElementById('cardGallery'),
  teamSection: document.getElementById('teamSection'),
  team: document.getElementById('cardTeam'),
  socialSection: document.getElementById('socialSection'),
  socials: document.getElementById('cardSocials'),
  customButtonsSection: document.getElementById('customButtonsSection'),
  customButtons: document.getElementById('cardCustomButtons'),
  paymentSection: document.getElementById('paymentSection'),
  paymentQr: document.getElementById('cardPaymentQr'),
  catalogSection: document.getElementById('catalogSection'),
  catalogLink: document.getElementById('cardCatalogLink'),
  videosSection: document.getElementById('videosSection'),
  videos: document.getElementById('cardVideos'),
  qrCode: document.getElementById('cardQrCode'),
  qrFallbackLink: document.getElementById('qrFallbackLink'),
  templateName: document.getElementById('templateName'),
  saveContact: document.getElementById('saveContactButton'),
  shareCard: document.getElementById('shareCardButton'),
  toolbarShare: document.getElementById('toolbarShareButton'),
  install: document.getElementById('installCardButton'),
  toast: document.getElementById('cardToast'),
  studio: document.getElementById('previewStudio'),
  themePicker: document.getElementById('themePicker'),
  templatePicker: document.getElementById('templatePicker'),
  previewForm: document.getElementById('previewForm'),
  exitPreview: document.getElementById('exitPreviewLink'),
  themeColor: document.getElementById('cardThemeColor'),
};

let publishedCard;
let previewCard;
let activeTemplate;
let toastTimer;
let installPrompt;
let analyticsViewRecorded = false;

const analyticsEnabled =
  elements.page.dataset.analyticsEnabled === 'true' && !isPreviewMode();
const analyticsVisitorId = analyticsEnabled
  ? analyticsIdentifier('vasukiAnalyticsVisitorId', localStorage)
  : '';
const analyticsSessionId = analyticsEnabled
  ? analyticsIdentifier('vasukiAnalyticsSessionId', sessionStorage)
  : '';

function randomIdentifier() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function analyticsIdentifier(key, storage) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = randomIdentifier();
    storage.setItem(key, created);
    return created;
  } catch {
    return randomIdentifier();
  }
}

function visitSource() {
  const source = new URLSearchParams(window.location.search)
    .get('source')
    ?.toLowerCase();
  return ['nfc', 'qr'].includes(source) ? source : 'direct';
}

function analyticsDeviceType() {
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )
    ? 'mobile'
    : 'desktop';
}

function trackAnalyticsEvent(eventType, itemId = null, itemLabel = null) {
  if (!analyticsEnabled || !publishedCard?.slug) return;
  const payload = {
    eventType,
    visitorId: analyticsVisitorId,
    sessionId: analyticsSessionId,
    deviceType: analyticsDeviceType(),
    ...(eventType === 'card_view' ? { source: visitSource() } : {}),
    ...(itemId ? { itemId: String(itemId).slice(0, 120) } : {}),
    ...(itemLabel ? { itemLabel: String(itemLabel).slice(0, 160) } : {}),
  };
  fetch(
    `/api/analytics/public/cards/${encodeURIComponent(publishedCard.slug)}/events`,
    {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  ).catch(() => {});
}

function cloneCard(card) {
  return JSON.parse(JSON.stringify(card));
}

function getCardSlug() {
  const querySlug = new URLSearchParams(window.location.search).get('slug');
  return (
    String(elements.page.dataset.cardSlug || querySlug || 'vasuki-demo')
      .trim()
      .toLowerCase()
      .match(/^[a-z0-9][a-z0-9-]{1,63}$/)?.[0] || 'vasuki-demo'
  );
}

function cardCanonicalUrl(slug = getCardSlug()) {
  return `${window.location.origin}/card/${encodeURIComponent(slug)}`;
}

function isPreviewMode() {
  return new URLSearchParams(window.location.search).get('preview') === '1';
}

function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('visible');
  }, 2400);
}

function showLoading() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.card.hidden = true;
}

function showError(message) {
  elements.loading.hidden = true;
  elements.card.hidden = true;
  elements.studio.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent =
    message || 'This digital card could not be loaded.';
}

function showCard() {
  elements.loading.hidden = true;
  elements.error.hidden = true;
  elements.card.hidden = false;
}

function initialsFor(name) {
  return String(name || 'Digital Card')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'DC';
}

function setLink(link, value, fallback = '#') {
  link.href = value || fallback;
  link.hidden = !value;
}

function renderIdentity(card) {
  elements.initials.textContent = initialsFor(card.name);
  elements.name.textContent = card.name || 'Digital Card';
  elements.title.textContent = card.title || '';
  elements.title.hidden = !card.title;
  elements.company.textContent = card.company || '';
  elements.company.hidden = !card.company;
  elements.tagline.textContent = card.tagline || '';
  elements.tagline.hidden = !card.tagline;
  elements.bio.textContent = card.bio || '';
  elements.bio.hidden = !card.bio;

  const logo = safeWebUrl(card.logo);
  elements.logo.hidden = !logo;
  elements.initials.hidden = Boolean(logo);
  if (logo) elements.logo.src = logo;
  else elements.logo.removeAttribute('src');

  const cover = safeWebUrl(card.coverImage);
  elements.cover.style.backgroundImage = cover
    ? `linear-gradient(135deg, var(--card-cover-start), var(--card-cover-end)), url(${JSON.stringify(cover)})`
    : '';
}

function renderContact(card) {
  const phone = String(card.phoneValue || card.phone || '').replace(/[^\d+]/g, '');
  const email = String(card.email || '').trim();
  const website = safeWebUrl(card.website);
  const location = safeWebUrl(card.locationUrl);

  elements.phone.textContent = card.phone || phone;
  elements.email.textContent = email;
  elements.website.textContent = website
    ? new URL(website).hostname.replace(/^www\./, '')
    : '';
  elements.address.textContent = card.address || '';

  setLink(elements.phoneDetail, phone ? `tel:${phone}` : '');
  setLink(elements.emailDetail, email ? `mailto:${email}` : '');
  setLink(elements.websiteDetail, website);
  setLink(elements.locationDetail, location);
  setLink(elements.callAction, phone ? `tel:${phone}` : '');
  setLink(elements.emailAction, email ? `mailto:${email}` : '');
  setLink(
    elements.whatsappAction,
    card.whatsapp
      ? `https://wa.me/${String(card.whatsapp).replace(/\D/g, '')}`
      : '',
  );
}

function renderServices(card) {
  const services = Array.isArray(card.services)
    ? card.services
        .filter(
          (service) =>
            typeof service === 'string' ||
            (service && typeof service.name === 'string'),
        )
        .slice(0, 20)
    : [];

  elements.services.replaceChildren();
  services.forEach((service, index) => {
    const item = document.createElement('li');
    item.dataset.analyticsItem =
      typeof service === 'string'
        ? `service-${index + 1}`
        : service.serviceId || service.id || `service-${index + 1}`;
    item.dataset.analyticsLabel =
      typeof service === 'string' ? service : service.name;
    if (typeof service === 'string') {
      item.textContent = service;
    } else {
      const name = document.createElement('strong');
      name.textContent = service.name;
      item.append(name);
      const detail = service.price || service.description;
      if (detail) {
        const description = document.createElement('span');
        description.textContent = detail;
        item.append(description);
      }
    }
    elements.services.append(item);
  });
  elements.servicesSection.hidden = services.length === 0;
}

function mediaUrl(card, mediaId) {
  return (
    (Array.isArray(card.mediaAssets) ? card.mediaAssets : []).find(
      (asset) => asset.mediaId === mediaId,
    )?.url || ''
  );
}

function contentCard({ title, detail, description, image, imageAlt }) {
  const article = document.createElement('article');
  article.className = 'digital-card-content-card';
  if (image) {
    const visual = document.createElement('img');
    visual.src = image;
    visual.alt = imageAlt || '';
    visual.loading = 'lazy';
    article.append(visual);
  }
  const body = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = title;
  body.append(heading);
  if (detail) {
    const meta = document.createElement('strong');
    meta.textContent = detail;
    body.append(meta);
  }
  if (description) {
    const copy = document.createElement('p');
    copy.textContent = description;
    body.append(copy);
  }
  article.append(body);
  return article;
}

function renderProducts(card) {
  const products = Array.isArray(card.products) ? card.products.slice(0, 20) : [];
  elements.products.replaceChildren();
  products.forEach((product, index) => {
    const item = contentCard({
        title: product.name,
        detail: product.price,
        description: product.description,
        image: mediaUrl(card, product.imageMediaId),
        imageAlt: product.name,
      });
    item.dataset.analyticsItem =
      product.productId || product.id || `product-${index + 1}`;
    item.dataset.analyticsLabel = product.name;
    elements.products.append(item);
  });
  elements.productsSection.hidden = products.length === 0;
}

function renderBusinessHours(card) {
  const hours = Array.isArray(card.businessHours)
    ? card.businessHours.filter((item) => item.enabled)
    : [];
  elements.businessHours.replaceChildren();
  hours.forEach((item) => {
    const wrapper = document.createElement('div');
    const day = document.createElement('dt');
    day.textContent = item.label;
    const time = document.createElement('dd');
    time.textContent = `${item.open} – ${item.close}`;
    wrapper.append(day, time);
    elements.businessHours.append(wrapper);
  });
  elements.businessHoursSection.hidden = hours.length === 0;
}

function renderGallery(card) {
  const mediaIds = Array.isArray(card.galleryMediaIds)
    ? card.galleryMediaIds
    : [];
  elements.gallery.replaceChildren();
  mediaIds.forEach((mediaId, index) => {
    const url = mediaUrl(card, mediaId);
    if (!url) return;
    const image = document.createElement('img');
    image.src = url;
    image.alt = `${card.company || card.name} gallery image ${index + 1}`;
    image.loading = 'lazy';
    image.dataset.analyticsItem = mediaId;
    image.dataset.analyticsLabel = `Gallery image ${index + 1}`;
    elements.gallery.append(image);
  });
  elements.gallerySection.hidden = elements.gallery.childElementCount === 0;
}

function renderTeam(card) {
  const team = Array.isArray(card.teamMembers)
    ? card.teamMembers.slice(0, 20)
    : [];
  elements.team.replaceChildren();
  team.forEach((member) => {
    elements.team.append(
      contentCard({
        title: member.name,
        detail: member.role,
        description: member.bio,
        image: mediaUrl(card, member.imageMediaId),
        imageAlt: member.name,
      }),
    );
  });
  elements.teamSection.hidden = team.length === 0;
}

function renderCustomButtons(card) {
  const buttons = Array.isArray(card.customButtons)
    ? card.customButtons.slice(0, 12)
    : [];
  elements.customButtons.replaceChildren();
  buttons.forEach((button) => {
    const url = safeWebUrl(button.url);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = button.label;
    elements.customButtons.append(link);
  });
  elements.customButtonsSection.hidden =
    elements.customButtons.childElementCount === 0;
}

function renderResources(card) {
  const paymentUrl = mediaUrl(card, card.paymentQrMediaId);
  elements.paymentSection.hidden = !paymentUrl;
  if (paymentUrl) elements.paymentQr.src = paymentUrl;
  else elements.paymentQr.removeAttribute('src');

  const catalogUrl = mediaUrl(card, card.pdfCatalogMediaId);
  elements.catalogSection.hidden = !catalogUrl;
  if (catalogUrl) elements.catalogLink.href = catalogUrl;
  else elements.catalogLink.removeAttribute('href');

  elements.videos.replaceChildren();
  (Array.isArray(card.videos) ? card.videos : []).slice(0, 10).forEach((video, index) => {
    const url = safeWebUrl(video.url);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = video.title || 'Watch video';
    link.dataset.analyticsItem =
      video.videoId || video.id || `video-${index + 1}`;
    link.dataset.analyticsLabel = video.title || 'Video';
    elements.videos.append(link);
  });
  elements.videosSection.hidden = elements.videos.childElementCount === 0;
}

function socialMark(link) {
  const marks = {
    instagram: 'IG',
    linkedin: 'IN',
    youtube: 'YT',
    facebook: 'FB',
    x: 'X',
    twitter: 'X',
  };
  return marks[String(link.type || '').toLowerCase()] || '↗';
}

function renderSocials(card) {
  const links = Array.isArray(card.socialLinks)
    ? card.socialLinks.slice(0, 8)
    : [];

  elements.socials.replaceChildren();
  links.forEach((link) => {
    const url = safeWebUrl(link.url);
    if (!url) return;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.setAttribute('aria-label', String(link.label || 'Social link'));
    anchor.dataset.analyticsItem =
      link.type || link.platform || link.label || 'social';
    anchor.dataset.analyticsLabel = link.label || link.type || 'Social link';

    const mark = document.createElement('span');
    mark.className = 'digital-card-social-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = socialMark(link);

    const label = document.createElement('span');
    label.textContent = String(link.label || 'Open profile');
    anchor.append(mark, label);
    elements.socials.append(anchor);
  });
  elements.socialSection.hidden = elements.socials.childElementCount === 0;
}

function updateMetadata(card) {
  const canonical = cardCanonicalUrl(card.slug);
  const title = card.seo?.title || `${card.name} | Digital Business Card`;
  const description =
    card.seo?.description ||
    `${card.name} — ${card.title || 'Digital business card'}`;
  const image =
    safeWebUrl(card.seo?.image) ||
    `${window.location.origin}/assets/hero-real-business.png`;

  document.title = title;
  const updates = [
    ['meta[name="description"]', 'content', description],
    ['link[rel="canonical"]', 'href', canonical],
    ['meta[property="og:title"]', 'content', title],
    ['meta[property="og:description"]', 'content', description],
    ['meta[property="og:url"]', 'content', canonical],
    ['meta[property="og:image"]', 'content', image],
    ['meta[name="twitter:title"]', 'content', title],
    ['meta[name="twitter:description"]', 'content', description],
    ['meta[name="twitter:image"]', 'content', image],
  ];
  updates.forEach(([selector, attribute, value]) => {
    document.querySelector(selector)?.setAttribute(attribute, value);
  });

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: card.name,
    jobTitle: card.title,
    worksFor: card.company
      ? { '@type': 'Organization', name: card.company }
      : undefined,
    description: card.bio,
    email: card.email ? `mailto:${card.email}` : undefined,
    telephone: card.phoneValue || card.phone,
    url: canonical,
    image,
    address: card.address
      ? { '@type': 'PostalAddress', addressLocality: card.address }
      : undefined,
    sameAs: Array.isArray(card.socialLinks)
      ? card.socialLinks.map((link) => safeWebUrl(link.url)).filter(Boolean)
      : [],
    hasOfferCatalog:
      Array.isArray(card.products) && card.products.length
        ? {
            '@type': 'OfferCatalog',
            name: 'Products',
            itemListElement: card.products.map((product) => ({
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Product',
                name: product.name,
                description: product.description,
              },
              price: product.price || undefined,
            })),
          }
        : undefined,
  };
  const structuredDataElement = document.getElementById('cardStructuredData');
  if (structuredDataElement) {
    structuredDataElement.textContent = JSON.stringify(structuredData);
  }
}

function renderQrCode(card) {
  const url = `${cardCanonicalUrl(card.slug)}?source=qr`;
  elements.qrFallbackLink.href = url;
  elements.qrCode.replaceChildren();

  if (typeof window.QRCode !== 'function') {
    const fallback = document.createElement('p');
    fallback.className = 'digital-card-qr-fallback';
    fallback.textContent = 'QR is unavailable. Use the card link instead.';
    elements.qrCode.append(fallback);
    return;
  }

  new window.QRCode(elements.qrCode, {
    text: url,
    width: 150,
    height: 150,
    colorDark: '#111827',
    colorLight: '#ffffff',
    correctLevel: window.QRCode.CorrectLevel.M,
  });
}

function applyTemplate(templateId) {
  activeTemplate = applyCardTemplate(elements.page, templateId);
  elements.templateName.textContent = activeTemplate.name;
  elements.themeColor?.setAttribute('content', activeTemplate.colors.page);

  document
    .querySelectorAll('.digital-card-theme-option')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.theme === activeTemplate.theme),
      ),
    );
  document
    .querySelectorAll('.digital-card-template-option')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.template === activeTemplate.id),
      ),
    );
}

function renderCard(card, options = {}) {
  renderIdentity(card);
  renderContact(card);
  renderServices(card);
  renderProducts(card);
  renderBusinessHours(card);
  renderGallery(card);
  renderTeam(card);
  renderSocials(card);
  renderCustomButtons(card);
  renderResources(card);
  applyTemplate(card.template);

  if (options.full !== false) {
    updateMetadata(card);
    renderQrCode(card);
  }
}

function vCardEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function createVCard(card) {
  const socialNotes = Array.isArray(card.socialLinks)
    ? card.socialLinks
        .map((link) => `${link.label}: ${safeWebUrl(link.url)}`)
        .filter((line) => !line.endsWith(': '))
        .join('\\n')
    : '';
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${vCardEscape(card.lastName)};${vCardEscape(card.firstName || card.name)};;;`,
    `FN:${vCardEscape(card.name)}`,
    card.company ? `ORG:${vCardEscape(card.company)}` : '',
    card.title ? `TITLE:${vCardEscape(card.title)}` : '',
    card.phoneValue || card.phone
      ? `TEL;TYPE=CELL:${vCardEscape(card.phoneValue || card.phone)}`
      : '',
    card.email ? `EMAIL;TYPE=INTERNET:${vCardEscape(card.email)}` : '',
    card.website ? `URL:${vCardEscape(card.website)}` : '',
    card.address ? `ADR;TYPE=WORK:;;${vCardEscape(card.address)};;;;` : '',
    card.bio ? `NOTE:${vCardEscape(card.bio)}${socialNotes ? `\\n${socialNotes}` : ''}` : '',
    'END:VCARD',
  ].filter(Boolean);

  return `${lines.join('\r\n')}\r\n`;
}

function downloadVCard() {
  if (!publishedCard) return;

  const blob = new Blob([createVCard(publishedCard)], {
    type: 'text/vcard;charset=utf-8',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `${publishedCard.slug || 'digital-contact'}.vcf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast('Contact file downloaded.');
}

async function copyCardLink(card) {
  const url = cardCanonicalUrl(card.slug);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const field = document.createElement('textarea');
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
}

async function shareCard() {
  if (!publishedCard) return;
  const shareData = {
    title: publishedCard.seo?.title || publishedCard.name,
    text: publishedCard.tagline || publishedCard.title,
    url: cardCanonicalUrl(publishedCard.slug),
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      trackAnalyticsEvent('share');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  await copyCardLink(publishedCard);
  trackAnalyticsEvent('share');
  showToast('Card link copied.');
}

function createThemePicker() {
  elements.themePicker.replaceChildren();
  CARD_THEMES.forEach((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'digital-card-theme-option';
    button.dataset.theme = theme.id;
    button.textContent = theme.name;
    button.setAttribute('aria-pressed', 'false');
    button.title = theme.description;
    button.addEventListener('click', () => {
      const firstTemplate = templatesForTheme(theme.id)[0];
      if (firstTemplate) {
        previewCard.template = firstTemplate.id;
        previewCard.theme = firstTemplate.theme;
        applyTemplate(firstTemplate.id);
        createTemplatePicker(theme.id);
      }
    });
    elements.themePicker.append(button);
  });
}

function createTemplatePicker(themeId = activeTemplate?.theme || 'luxury') {
  elements.templatePicker.replaceChildren();
  templatesForTheme(themeId).forEach((template) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'digital-card-template-option';
    button.dataset.template = template.id;
    button.setAttribute(
      'aria-pressed',
      String(template.id === activeTemplate?.id),
    );

    const swatch = document.createElement('span');
    swatch.className = 'digital-card-template-swatch';
    swatch.style.background = `linear-gradient(135deg, ${template.colors.coverStart}, ${template.colors.coverEnd})`;
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = template.name;
    button.append(swatch, label);

    button.addEventListener('click', () => {
      previewCard.template = template.id;
      previewCard.theme = template.theme;
      applyTemplate(template.id);
    });
    elements.templatePicker.append(button);
  });
}

function populatePreviewForm(card) {
  ['name', 'title', 'company', 'tagline'].forEach((field) => {
    const input = elements.previewForm.elements.namedItem(field);
    if (input) input.value = card[field] || '';
  });
}

function setupLivePreview() {
  if (!isPreviewMode()) return;

  elements.page.classList.add('preview-mode');
  elements.studio.hidden = false;
  elements.exitPreview.href = cardCanonicalUrl(publishedCard.slug);
  createThemePicker();
  createTemplatePicker(activeTemplate.theme);
  populatePreviewForm(previewCard);

  elements.previewForm.addEventListener('input', (event) => {
    const field = event.target?.name;
    if (!['name', 'title', 'company', 'tagline'].includes(field)) return;
    previewCard[field] = String(event.target.value || '');
    renderIdentity(previewCard);
  });

  elements.previewForm.addEventListener('reset', () => {
    window.setTimeout(() => {
      previewCard = cloneCard(publishedCard);
      renderCard(previewCard, { full: false });
      populatePreviewForm(previewCard);
      createTemplatePicker(activeTemplate.theme);
    });
  });
}

async function loadCard() {
  showLoading();

  try {
    const response = await fetch(
      `/api/public-cards/${encodeURIComponent(getCardSlug())}`,
      { headers: { Accept: 'application/json' } },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.card) {
      throw new Error(data.error || 'This digital card is unavailable.');
    }

    publishedCard = Object.freeze({ ...data.card });
    previewCard = cloneCard(data.card);
    renderCard(previewCard);
    showCard();
    setupLivePreview();
    if (!analyticsViewRecorded) {
      analyticsViewRecorded = true;
      trackAnalyticsEvent('card_view');
    }
  } catch (error) {
    showError(error.message);
  }
}

function registerCardServiceWorker() {
  if (
    'serviceWorker' in navigator &&
    window.location.pathname.startsWith('/card/')
  ) {
    navigator.serviceWorker
      .register('/digital-card-sw.js', { scope: '/card/' })
      .catch(() => {});
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  elements.install.hidden = false;
});

elements.install.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined;
  elements.install.hidden = true;
});

elements.retry.addEventListener('click', loadCard);
elements.saveContact.addEventListener('click', () => {
  trackAnalyticsEvent('contact_save');
  downloadVCard();
});
elements.shareCard.addEventListener('click', shareCard);
elements.toolbarShare.addEventListener('click', shareCard);
elements.callAction.addEventListener('click', () =>
  trackAnalyticsEvent('call_click'),
);
elements.phoneDetail.addEventListener('click', () =>
  trackAnalyticsEvent('call_click'),
);
elements.whatsappAction.addEventListener('click', () =>
  trackAnalyticsEvent('whatsapp_click'),
);
elements.emailAction.addEventListener('click', () =>
  trackAnalyticsEvent('email_click'),
);
elements.emailDetail.addEventListener('click', () =>
  trackAnalyticsEvent('email_click'),
);
elements.websiteDetail.addEventListener('click', () =>
  trackAnalyticsEvent('website_click'),
);
elements.locationDetail.addEventListener('click', () =>
  trackAnalyticsEvent('maps_click'),
);
elements.catalogLink.addEventListener('click', () =>
  trackAnalyticsEvent('pdf_open'),
);
elements.paymentQr.addEventListener('click', () =>
  trackAnalyticsEvent('payment_qr_open'),
);

function trackDelegated(container, selector, eventType) {
  container.addEventListener('click', (event) => {
    const item = event.target.closest(selector);
    if (!item || !container.contains(item)) return;
    trackAnalyticsEvent(
      eventType,
      item.dataset.analyticsItem,
      item.dataset.analyticsLabel,
    );
  });
}

trackDelegated(elements.products, '[data-analytics-item]', 'product_view');
trackDelegated(elements.services, '[data-analytics-item]', 'service_view');
trackDelegated(elements.gallery, '[data-analytics-item]', 'gallery_open');
trackDelegated(elements.socials, '[data-analytics-item]', 'social_click');
trackDelegated(elements.videos, '[data-analytics-item]', 'video_open');

registerCardServiceWorker();
loadCard();
