/**
 * Digital Card theme engine.
 *
 * Every premium template belongs to one of three stable theme families:
 * Light, Dark, or Luxury. Templates vary presentation without changing card
 * content or behavior.
 */

export const CARD_THEMES = Object.freeze([
  { id: 'light', name: 'Light', description: 'Clean and bright' },
  { id: 'dark', name: 'Dark', description: 'Bold and modern' },
  { id: 'luxury', name: 'Luxury', description: 'Rich and premium' },
]);

export const CARD_TEMPLATES = Object.freeze([
  {
    id: 'pearl-minimal',
    name: 'Pearl Minimal',
    theme: 'light',
    colors: {
      page: '#eef1f5',
      surface: '#ffffff',
      text: '#172033',
      muted: '#657184',
      accent: '#315b7d',
      accentContrast: '#ffffff',
      border: '#dfe4e9',
      coverStart: '#e7edf2',
      coverEnd: '#ffffff',
    },
  },
  {
    id: 'azure-breeze',
    name: 'Azure Breeze',
    theme: 'light',
    colors: {
      page: '#edf7ff',
      surface: '#ffffff',
      text: '#10243a',
      muted: '#5e7185',
      accent: '#1479b8',
      accentContrast: '#ffffff',
      border: '#d4e7f4',
      coverStart: '#bfe8ff',
      coverEnd: '#eef9ff',
    },
  },
  {
    id: 'rose-studio',
    name: 'Rose Studio',
    theme: 'light',
    colors: {
      page: '#fff3f5',
      surface: '#fffdfd',
      text: '#3c2027',
      muted: '#80616a',
      accent: '#b44664',
      accentContrast: '#ffffff',
      border: '#f0d9df',
      coverStart: '#f7c8d3',
      coverEnd: '#fff1f4',
    },
  },
  {
    id: 'sage-professional',
    name: 'Sage Professional',
    theme: 'light',
    colors: {
      page: '#f1f6f1',
      surface: '#ffffff',
      text: '#19352a',
      muted: '#61766d',
      accent: '#3f775f',
      accentContrast: '#ffffff',
      border: '#d7e5db',
      coverStart: '#cce2d3',
      coverEnd: '#f2f8f3',
    },
  },
  {
    id: 'graphite-pro',
    name: 'Graphite Pro',
    theme: 'dark',
    colors: {
      page: '#101318',
      surface: '#191d24',
      text: '#f4f6f8',
      muted: '#aab3c0',
      accent: '#d8dee8',
      accentContrast: '#11151a',
      border: '#303741',
      coverStart: '#242a33',
      coverEnd: '#0d1015',
    },
  },
  {
    id: 'midnight-neon',
    name: 'Midnight Neon',
    theme: 'dark',
    colors: {
      page: '#070b17',
      surface: '#0e1528',
      text: '#eef5ff',
      muted: '#9aabd0',
      accent: '#4de8c1',
      accentContrast: '#06110e',
      border: '#243050',
      coverStart: '#192c55',
      coverEnd: '#071020',
    },
  },
  {
    id: 'navy-executive',
    name: 'Navy Executive',
    theme: 'dark',
    colors: {
      page: '#091522',
      surface: '#102235',
      text: '#f4f8fc',
      muted: '#a9bbcc',
      accent: '#71b7e8',
      accentContrast: '#06131e',
      border: '#274158',
      coverStart: '#173b59',
      coverEnd: '#091521',
    },
  },
  {
    id: 'forest-tech',
    name: 'Forest Tech',
    theme: 'dark',
    colors: {
      page: '#07140f',
      surface: '#10231b',
      text: '#effaf4',
      muted: '#9ab8aa',
      accent: '#62d39b',
      accentContrast: '#06120d',
      border: '#274638',
      coverStart: '#1b4c38',
      coverEnd: '#081710',
    },
  },
  {
    id: 'obsidian-gold',
    name: 'Obsidian Gold',
    theme: 'luxury',
    colors: {
      page: '#08090b',
      surface: '#111317',
      text: '#fff9eb',
      muted: '#bcb29e',
      accent: '#e8bd69',
      accentContrast: '#171106',
      border: '#3b3428',
      coverStart: '#332710',
      coverEnd: '#0a0b0e',
    },
  },
  {
    id: 'royal-plum',
    name: 'Royal Plum',
    theme: 'luxury',
    colors: {
      page: '#140a18',
      surface: '#211027',
      text: '#fff5ff',
      muted: '#c8adc9',
      accent: '#e6a7ed',
      accentContrast: '#251027',
      border: '#513259',
      coverStart: '#5b2567',
      coverEnd: '#170b1b',
    },
  },
  {
    id: 'emerald-luxe',
    name: 'Emerald Luxe',
    theme: 'luxury',
    colors: {
      page: '#06140f',
      surface: '#0d2119',
      text: '#f5fff9',
      muted: '#a8c7b9',
      accent: '#d5b86a',
      accentContrast: '#172008',
      border: '#315143',
      coverStart: '#1e5a42',
      coverEnd: '#071710',
    },
  },
  {
    id: 'ivory-signature',
    name: 'Ivory Signature',
    theme: 'luxury',
    colors: {
      page: '#eee8dc',
      surface: '#fffaf0',
      text: '#2a241c',
      muted: '#746a5d',
      accent: '#9b6f2f',
      accentContrast: '#ffffff',
      border: '#dfd1bb',
      coverStart: '#d6bb86',
      coverEnd: '#f8edd8',
    },
  },
]);

export function getCardTemplate(templateId) {
  return (
    CARD_TEMPLATES.find((template) => template.id === templateId) ||
    CARD_TEMPLATES.find((template) => template.id === 'obsidian-gold')
  );
}

export function templatesForTheme(themeId) {
  return CARD_TEMPLATES.filter((template) => template.theme === themeId);
}

export function applyCardTemplate(root, templateId) {
  const template = getCardTemplate(templateId);
  root.dataset.theme = template.theme;
  root.dataset.template = template.id;

  Object.entries(template.colors).forEach(([name, value]) => {
    root.style.setProperty(
      `--card-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    );
  });

  return template;
}
