import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";

export type PdfOptions = { pages: string[]; withJavaScript?: boolean; embedFile?: boolean };

// Builds a real PDF so tests exercise the same parser as production uploads.
export async function buildPdf(options: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const text of options.pages) {
    const page = doc.addPage([595, 842]);
    let y = 800;
    for (const line of text.split("\n")) {
      page.drawText(line.replace(/[^\x20-\x7E]/g, " "), { x: 40, y, size: 9, font });
      y -= 13;
    }
  }

  if (options.withJavaScript) {
    const action = doc.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("app.alert('x')") });
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(action));
  }

  if (options.embedFile) {
    await doc.attach(Uint8Array.from([112, 97, 121, 108, 111, 97, 100]), "payload.txt", { mimeType: "text/plain" });
  }

  return doc.save({ useObjectStreams: false });
}

// A page with no text layer, like a scan: only a drawn rectangle.
export async function buildScannedPdf(pageCount = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 40, y: 600, width: 400, height: 120 });
  }
  return doc.save({ useObjectStreams: false });
}
