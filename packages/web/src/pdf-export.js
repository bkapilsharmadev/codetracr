import { jsPDF } from 'jspdf';

const NODE_W = 240;
const CARD_MM = 54;
const PAGE_MARGIN_MM = 10;
const HEADER_MM = 20;
const MAX_PAGE_MM = 2000;

function safeFilename(value) {
  const normalized = String(value ?? 'lineage-graph')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (normalized || 'lineage-graph').slice(0, 100);
}

export function downloadGraphPdf({ image, title, subtitle }) {
  const worldW = image.worldWidth || image.width;
  const worldH = image.worldHeight || image.height;
  const mmPerWorld = CARD_MM / NODE_W;
  let pageW = worldW * mmPerWorld + PAGE_MARGIN_MM * 2;
  let pageH = worldH * mmPerWorld + HEADER_MM + PAGE_MARGIN_MM;
  const pageScale = Math.min(1, MAX_PAGE_MM / pageW, MAX_PAGE_MM / pageH);
  pageW *= pageScale;
  pageH *= pageScale;

  const pdf = new jsPDF({
    orientation: pageW >= pageH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pageW, pageH],
    compress: true,
  });

  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const imageTop = HEADER_MM;
  const imageWidth = width - PAGE_MARGIN_MM * 2;
  const imageHeight = height - imageTop - PAGE_MARGIN_MM;

  pdf.setFillColor(11, 13, 18);
  pdf.rect(0, 0, width, height, 'F');

  pdf.setTextColor(241, 243, 245);
  pdf.setFontSize(16);
  pdf.text(title || 'CodeTracr lineage graph', PAGE_MARGIN_MM, 11);
  if (subtitle) {
    pdf.setFontSize(9);
    pdf.setTextColor(154, 160, 166);
    pdf.text(subtitle, PAGE_MARGIN_MM, 16.5, { maxWidth: imageWidth });
  }

  pdf.addImage(
    image.dataUrl,
    image.format || 'JPEG',
    PAGE_MARGIN_MM,
    imageTop,
    imageWidth,
    imageHeight,
    undefined,
    'NONE',
  );
  pdf.save(`${safeFilename(title)}.pdf`);
}
