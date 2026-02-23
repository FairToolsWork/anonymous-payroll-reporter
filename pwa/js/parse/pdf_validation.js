/**
 * @param {File} file
 * @param {string} password
 * @returns {Promise<{ record: any, debug: { text: string, lines: string[], lineItems: Array<any>, imageData: string | null } }>}
 */
async function parsePayrollPdf(file, password) {
  if (!file) {
    throw new Error("PDF_FILE_MISSING");
  }
  const { text, imageData, lines, lineItems } = await extractPdfData(file, password);
  const record = buildPayrollDocument({
    text,
    lines: lines || [],
    lineItems: lineItems || []
  });
  return {
    record,
    debug: {
      text,
      lines: lines || [],
      lineItems: lineItems || [],
      imageData: imageData || null
    }
  };
}

export { parsePayrollPdf };

if (typeof window !== "undefined") {
  window.parsePayrollPdf = parsePayrollPdf;
}
