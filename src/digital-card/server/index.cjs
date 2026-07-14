'use strict';

const fs = require('fs').promises;
const path = require('path');
const { createPublicCardStore } = require('./card-store.cjs');
const {
  createPublishedProfileStorage,
} = require('../../profile-editor/server/storage/published-profile-storage.cjs');
const {
  sendStorageObject,
} = require('../../profile-editor/server/storage/adapter-contract.cjs');
const {
  createPublicAnalyticsRouter,
} = require('../../analytics/server/routes/public-analytics-routes.cjs');

const META_START = '<!-- DYNAMIC_CARD_META_START -->';
const META_END = '<!-- DYNAMIC_CARD_META_END -->';

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
}

function safeStructuredData(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function normalizeBaseUrl(value) {
  return String(value || 'https://vasukinfc.in').replace(/\/+$/, '');
}

function absoluteUrl(value, baseUrl) {
  try {
    return new URL(String(value || ''), baseUrl).href;
  } catch {
    return '';
  }
}

function buildMetadata(card, cardUrl, manifestUrl) {
  const title = card.seo?.title || `${card.name} | Digital Business Card`;
  const description =
    card.seo?.description ||
    `${card.name} — ${card.title || 'Digital business card'}`;
  const image = absoluteUrl(
    card.seo?.image || '/assets/hero-real-business.png',
    cardUrl,
  );
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
    url: cardUrl,
    image,
    address: card.address
      ? { '@type': 'PostalAddress', addressLocality: card.address }
      : undefined,
    sameAs: Array.isArray(card.socialLinks)
      ? card.socialLinks.map((link) => link.url).filter(Boolean)
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

  return `${META_START}
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(cardUrl)}">
  <link rel="manifest" href="${escapeHtml(manifestUrl)}">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(cardUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:site_name" content="VASUKI NFC">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <script type="application/ld+json" id="cardStructuredData">${safeStructuredData(structuredData)}</script>
  ${META_END}`;
}

function renderCardHtml(
  template,
  card,
  cardUrl,
  manifestUrl,
  analyticsEnabled = false,
) {
  const start = template.indexOf(META_START);
  const end = template.indexOf(META_END);
  const metadata = buildMetadata(card, cardUrl, manifestUrl);
  let html = template;

  if (start >= 0 && end > start) {
    html =
      template.slice(0, start) +
      metadata +
      template.slice(end + META_END.length);
  }

  return html
    .replace(
      'data-card-slug=""',
      `data-card-slug="${escapeHtml(card.slug)}"`,
    )
    .replace(
      'data-analytics-enabled="false"',
      `data-analytics-enabled="${analyticsEnabled ? 'true' : 'false'}"`,
    );
}

function publicCardManifest(card, startUrl) {
  const themeColors = {
    light: '#f6f7fb',
    dark: '#111827',
    luxury: '#0b0b0d',
  };

  return {
    id: startUrl,
    name: `${card.name} — Digital Card`,
    short_name: card.name,
    description: card.seo?.description || card.bio,
    start_url: startUrl,
    scope: '/card/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: themeColors[card.theme] || themeColors.light,
    theme_color: themeColors[card.theme] || themeColors.light,
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };
}

/**
 * Mounts the additive Dynamic Public Digital Card module.
 *
 * @param {import('express').Express} app
 * @param {{
 *   publicDirectory: string,
 *   dataFile: string,
 *   profileDataFile?: string,
 *   publishedStorageDirectory?: string,
 *   storageAdapter?: object,
 *   getDatabase?: () => unknown | Promise<unknown>,
 *   baseUrl?: string,
 *   analyticsFoundation?: object
 * }} options
 */
function mountDigitalCardModule(app, options) {
  const publicDirectory = path.resolve(options.publicDirectory);
  const templateFile = path.join(publicDirectory, 'digital-card.html');
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const publishedStorage =
    options.storageAdapter || options.publishedStorageDirectory
    ? createPublishedProfileStorage({
        adapter: options.storageAdapter,
        rootDirectory: options.publishedStorageDirectory,
      })
    : null;
  const store = createPublicCardStore({
    dataFile: options.dataFile,
    profileDataFile: options.profileDataFile,
    getDatabase:
      typeof options.getDatabase === 'function'
        ? options.getDatabase
        : () => null,
    publishedStorage,
  });
  let templatePromise;

  function getTemplate() {
    if (!templatePromise) {
      templatePromise = fs.readFile(templateFile, 'utf8').catch((error) => {
        templatePromise = undefined;
        throw error;
      });
    }
    return templatePromise;
  }

  if (options.analyticsFoundation?.config?.enabled) {
    app.use(
      '/api/analytics/public/cards',
      createPublicAnalyticsRouter({
        analyticsService: options.analyticsFoundation.service,
        resolveCardOwnerId: async (slug) => {
          const card = await store.findPublishedCard(slug);
          return card?.analyticsOwnerId || null;
        },
      }),
    );
  }

  app.get('/api/public-cards/:slug', async (request, response) => {
    try {
      const storedCard = await store.findPublishedCard(request.params.slug);
      if (!storedCard) {
        return response.status(404).json({ error: 'Digital card not found.' });
      }
      const card = store.toPublicCard(storedCard);

      response.set({
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
      });
      return response.json({ card });
    } catch (error) {
      console.error('Public digital card API error:', error);
      return response
        .status(500)
        .json({ error: 'Unable to load this digital card.' });
    }
  });

  app.get(
    '/api/public-cards/:slug/media/:mediaId',
    async (request, response) => {
      try {
        const card = await store.findPublishedCard(request.params.slug);
        if (!card) return response.status(404).end();
        const media = await store.findMediaFile(card, request.params.mediaId);
        if (!media) return response.status(404).end();

        response.set({
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(media.asset.originalName)}`,
          'X-Content-Type-Options': 'nosniff',
        });
        response.type(media.asset.mime);
        return sendStorageObject(response, media.delivery);
      } catch (error) {
        console.error('Public digital card media error:', error);
        return response.status(500).end();
      }
    },
  );

  app.get('/card/:slug/manifest.webmanifest', async (request, response) => {
    try {
      const storedCard = await store.findPublishedCard(request.params.slug);
      if (!storedCard) return response.status(404).end();
      const card = store.toPublicCard(storedCard);

      const startUrl = `/card/${encodeURIComponent(card.slug)}`;
      response.set({
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      });
      return response.send(publicCardManifest(card, startUrl));
    } catch (error) {
      console.error('Public digital card manifest error:', error);
      return response.status(500).end();
    }
  });

  app.get('/card/:slug', async (request, response) => {
    try {
      const storedCard = await store.findPublishedCard(request.params.slug);
      if (!storedCard) {
        return response.status(404).send(
          '<!doctype html><html lang="en"><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Card not found | VASUKI NFC</title>' +
            '<body><main><h1>Digital card not found</h1>' +
            '<p>This card is unavailable or has not been published.</p>' +
            '<a href="/">Visit VASUKI NFC</a></main></body></html>',
        );
      }
      const card = store.toPublicCard(storedCard);

      const cardUrl = `${baseUrl}/card/${encodeURIComponent(card.slug)}`;
      const manifestUrl = `${cardUrl}/manifest.webmanifest`;
      const html = renderCardHtml(
        await getTemplate(),
        card,
        cardUrl,
        manifestUrl,
        Boolean(options.analyticsFoundation?.config?.enabled),
      );

      response.set({
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; " +
          "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; " +
          "font-src 'self'; manifest-src 'self'; object-src 'none'; " +
          "base-uri 'self'; frame-ancestors 'none'",
        'Permissions-Policy':
          'camera=(), microphone=(), geolocation=(), payment=()',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      return response.type('html').send(html);
    } catch (error) {
      console.error('Public digital card page error:', error);
      return response
        .status(500)
        .send('Unable to load this digital card.');
    }
  });
}

module.exports = {
  mountDigitalCardModule,
};
