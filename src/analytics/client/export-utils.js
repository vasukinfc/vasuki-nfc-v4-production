function safeFilename(value) {
  return String(value || 'analytics-report')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  downloadBlob(
    new Blob([`\uFEFF${csv}\r\n`], {
      type: 'text/csv;charset=utf-8',
    }),
    `${safeFilename(filename)}.csv`,
  );
}

function ascii(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function pdfEscape(value) {
  return ascii(value).replace(/([\\()])/g, '\\$1');
}

function wrapLine(value, width = 88) {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [' '];
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function pdfDocument(title, sections) {
  const lines = [ascii(title), `Generated: ${new Date().toISOString()}`, ''];
  sections.forEach((section) => {
    lines.push(ascii(section.heading).toUpperCase());
    section.lines.forEach((line) => lines.push(...wrapLine(line)));
    lines.push('');
  });
  const pages = [];
  for (let index = 0; index < lines.length; index += 48) {
    pages.push(lines.slice(index, index + 48));
  }
  if (!pages.length) pages.push(['No analytics data available.']);

  const objects = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const commands = [
      'BT',
      '/F1 10 Tf',
      '48 794 Td',
      '14 TL',
      ...pageLines.flatMap((line) => [
        `(${pdfEscape(line)}) Tj`,
        'T*',
      ]),
      'ET',
    ].join('\n');
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
  });

  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = output.length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n`;
  output += '0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF`;
  return output;
}

export function downloadPdf(filename, title, sections) {
  downloadBlob(
    new Blob([pdfDocument(title, sections)], {
      type: 'application/pdf',
    }),
    `${safeFilename(filename)}.pdf`,
  );
}
