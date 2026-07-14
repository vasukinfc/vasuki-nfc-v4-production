/**
 * Safe live-preview renderer for Phase 4B identity and contact fields.
 *
 * User content is written through textContent and validated URL properties;
 * no profile value is interpreted as HTML.
 */

function httpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function setText(element, value, fallback) {
  element.textContent = String(value || fallback);
  element.classList.toggle('preview-placeholder', !value);
}

function setLink(element, label, href) {
  const available = Boolean(label && href);
  element.hidden = !available;
  element.textContent = label || '';
  if (available) {
    element.href = href;
  } else {
    element.removeAttribute('href');
  }
}

export function createLivePreview(root) {
  const elements = {
    businessName: root.querySelector('[data-preview="businessName"]'),
    name: root.querySelector('[data-preview="name"]'),
    designation: root.querySelector('[data-preview="designation"]'),
    phone: root.querySelector('[data-preview="phone"]'),
    whatsapp: root.querySelector('[data-preview="whatsapp"]'),
    email: root.querySelector('[data-preview="email"]'),
    website: root.querySelector('[data-preview="website"]'),
    address: root.querySelector('[data-preview="address"]'),
    googleMaps: root.querySelector('[data-preview="googleMaps"]'),
    emptyContact: root.querySelector('[data-preview-empty]'),
    content: root.querySelector('[data-preview-content]')
  };

  function previewSection(title) {
    const section = document.createElement('section');
    section.className = 'preview-content-section';
    const heading = document.createElement('h4');
    heading.textContent = title;
    section.append(heading);
    return section;
  }

  function appendLimited(section, items, renderer) {
    items.slice(0, 4).forEach((item) => section.append(renderer(item)));
    if (items.length > 4) {
      const more = document.createElement('p');
      more.className = 'preview-content-more';
      more.textContent = `+${items.length - 4} more`;
      section.append(more);
    }
  }

  function textRow(primary, secondary = '') {
    const row = document.createElement('div');
    row.className = 'preview-content-row';
    const strong = document.createElement('strong');
    strong.textContent = primary;
    row.append(strong);
    if (secondary) {
      const span = document.createElement('span');
      span.textContent = secondary;
      row.append(span);
    }
    return row;
  }

  function linkRow(label, value) {
    const link = document.createElement('a');
    link.className = 'preview-content-link';
    link.textContent = label;
    link.href = httpUrl(value) || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function renderContent(profile) {
    elements.content.replaceChildren();

    if (profile.products?.length) {
      const section = previewSection('Products');
      appendLimited(section, profile.products, (item) =>
        textRow(item.name, item.price || item.description)
      );
      elements.content.append(section);
    }

    if (profile.services?.length) {
      const section = previewSection('Services');
      appendLimited(section, profile.services, (item) =>
        textRow(item.name, item.price || item.description)
      );
      elements.content.append(section);
    }

    const activeHours = (profile.businessHours || []).filter(
      (item) => item.enabled
    );
    if (activeHours.length) {
      const section = previewSection('Business Hours');
      appendLimited(section, activeHours, (item) =>
        textRow(item.label, `${item.open} – ${item.close}`)
      );
      elements.content.append(section);
    }

    if (profile.socialLinks?.length) {
      const section = previewSection('Social');
      appendLimited(section, profile.socialLinks, (item) =>
        linkRow(item.platform, item.url)
      );
      elements.content.append(section);
    }

    if (profile.teamMembers?.length) {
      const section = previewSection('Team');
      appendLimited(section, profile.teamMembers, (item) =>
        textRow(item.name, item.role)
      );
      elements.content.append(section);
    }

    if (profile.customButtons?.length) {
      const section = previewSection('Links');
      section.classList.add('preview-content-buttons');
      appendLimited(section, profile.customButtons, (item) =>
        linkRow(item.label, item.url)
      );
      elements.content.append(section);
    }
  }

  function render(profile = {}) {
    setText(elements.businessName, profile.businessName, 'Your business');
    setText(elements.name, profile.name, 'Your name');
    setText(elements.designation, profile.designation, 'Your designation');

    const phone = String(profile.phone || '').trim();
    const whatsapp = String(profile.whatsapp || '').replace(/\D/g, '');
    const email = String(profile.email || '').trim();
    const website = httpUrl(profile.website);
    const maps = httpUrl(profile.googleMaps);
    const address = String(profile.address || '').trim();

    setLink(elements.phone, phone, phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '');
    setLink(
      elements.whatsapp,
      profile.whatsapp,
      whatsapp ? `https://wa.me/${whatsapp}` : ''
    );
    setLink(elements.email, email, email ? `mailto:${email}` : '');
    setLink(elements.website, profile.website, website);
    setLink(elements.googleMaps, maps ? 'Open in Google Maps' : '', maps);

    elements.address.textContent = address;
    elements.address.hidden = !address;
    elements.emptyContact.hidden = Boolean(
      phone || whatsapp || email || website || address || maps
    );
    renderContent(profile);
  }

  return Object.freeze({ render });
}
