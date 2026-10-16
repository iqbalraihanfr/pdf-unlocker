import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { hexToRgb } from '../utils/editorConstants';
import { uint8ArrayToBase64 } from '../utils/base64Utils';

/**
 * Service to embed user annotations (highlights, texts, drawings, note pins)
 * into a PDF document losslessly and export as base64.
 *
 * @param {Uint8Array} rawBytes - Original PDF binary bytes
 * @param {Array} annotations - List of annotation objects
 * @returns {Promise<string>} - Base64 encoded PDF string
 */
export async function exportAnnotatedPdf(rawBytes, annotations) {
  if (!rawBytes || !(rawBytes instanceof Uint8Array)) {
    throw new Error('Valid PDF raw bytes are required for export.');
  }

  const pdfDoc = await PDFDocument.load(rawBytes);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  for (const annot of annotations) {
    const pageIdx = annot.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx];
    const pageHeight = page.getHeight();
    const rgbColor = hexToRgb(annot.color);
    const pdfColor = rgb(rgbColor[0], rgbColor[1], rgbColor[2]);

    switch (annot.type) {
      case 'highlight':
        page.drawRectangle({
          x: annot.x,
          y: pageHeight - annot.y - annot.height,
          width: annot.width,
          height: annot.height,
          color: pdfColor,
          opacity: 0.35,
        });
        break;

      case 'text':
        page.drawText(annot.text || '', {
          x: annot.x,
          y: pageHeight - annot.y - (annot.fontSize || 14),
          size: annot.fontSize || 14,
          font: regularFont,
          color: pdfColor,
        });
        break;

      case 'draw':
        if (annot.points && annot.points.length > 1) {
          for (let i = 0; i < annot.points.length - 1; i++) {
            const p1 = annot.points[i];
            const p2 = annot.points[i + 1];
            page.drawLine({
              start: { x: p1.x, y: pageHeight - p1.y },
              end: { x: p2.x, y: pageHeight - p2.y },
              thickness: annot.strokeWidth || 3,
              color: pdfColor,
              opacity: 1,
            });
          }
        }
        break;

      case 'note':
        // Draw standard visual note marker pin
        page.drawCircle({
          x: annot.x,
          y: pageHeight - annot.y,
          size: 10,
          color: pdfColor,
        });
        page.drawText('C', {
          x: annot.x - 4,
          y: pageHeight - annot.y - 4,
          size: 11,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        break;

      default:
        break;
    }
  }

  const editedBytes = await pdfDoc.save();
  return uint8ArrayToBase64(editedBytes);
}
