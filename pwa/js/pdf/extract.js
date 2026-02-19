const pdfjsLib = window.pdfjsLib;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

async function extractPdfData(file, password) {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data, password: password || undefined });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    if (error && error.name === "PasswordException") {
      const reason = error.code === 2 ? "INCORRECT_PASSWORD" : "PASSWORD_REQUIRED";
      throw new Error(reason);
    }
    throw error;
  }
  let text = "";
  const allLines = [];
  let imageData = null;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageLines = buildLinesFromTextItems(content.items);
    allLines.push(...pageLines);
    text += `${pageLines.join("\n")}\n`;

    if (pageNum === 1) {
      imageData = await renderPageImage(page);
    }
  }

  return { text, imageData, lines: allLines };
}

function buildLinesFromTextItems(items) {
  const lines = [];
  const lineTolerance = 2;

  items.forEach((item) => {
    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];
    const text = item.str.trim();
    if (!text) {
      return;
    }

    let line = lines.find((entry) => Math.abs(entry.y - y) <= lineTolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ x, text });
  });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((lineText) => lineText);
}

async function renderPageImage(page) {
  const viewport = page.getViewport({ scale: 1.1 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  const threshold = 245;
  let contentBottom = -1;

  for (let y = height - 1; y >= 0; y -= 1) {
    let hasContent = false;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 2) {
      const index = rowStart + x * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      if (r < threshold || g < threshold || b < threshold) {
        hasContent = true;
        break;
      }
    }
    if (hasContent) {
      contentBottom = y;
      break;
    }
  }

  if (contentBottom >= 0) {
    const whitespaceRatio = (height - (contentBottom + 1)) / height;
    if (whitespaceRatio > 0.4) {
      const pointsPerCm = 72 / 2.54;
      const pageHeightPoints = Array.isArray(page.view) ? page.view[3] : height;
      const pixelsPerPoint = height / pageHeightPoints;
      const extraPixels = Math.round(pointsPerCm * 1.5 * pixelsPerPoint);
      const cropBottom = Math.min(height, contentBottom + 1 + extraPixels);

      const croppedCanvas = document.createElement("canvas");
      const croppedContext = croppedCanvas.getContext("2d");
      croppedCanvas.width = width;
      croppedCanvas.height = cropBottom;
      croppedContext.drawImage(canvas, 0, 0, width, cropBottom, 0, 0, width, cropBottom);
      return croppedCanvas.toDataURL("image/png");
    }
  }

  return canvas.toDataURL("image/png");
}
