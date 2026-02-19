function extractField(text, pattern) {
  const match = text.match(pattern);
  return match && match[1] ? match[1].trim() : null;
}

function parseNumericValue(value) {
  if (!value) {
    return 0;
  }
  const cleaned = value.replace(/[,£$]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function extractNetPayFromText(text) {
  if (!text) {
    return null;
  }
  const candidates = [];
  text.split("\n").forEach((line) => {
    const stripped = line.trim();
    if (/^£?\d[\d,]*\.\d{2}$/.test(stripped)) {
      candidates.push(stripped.replace(/^£/, ""));
    }
  });
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function extractEmployerFromLines(lines) {
  for (const line of lines) {
    if (/\bLtd\b|\bLimited\b/.test(line)) {
      return line.trim();
    }
  }
  return null;
}

function findEmployerLine(lines) {
  return lines.find((line) => /\b(Ltd|Limited)\b/.test(line)) || null;
}

function findNetPayFromLines(lines) {
  const payMethodIndex = lines.findIndex((line) => /Pay\s+Method:/i.test(line));
  const amountRegex = /^\d[\d,]*\.\d{2}$/;
  if (payMethodIndex >= 0) {
    for (let i = payMethodIndex + 1; i < lines.length; i += 1) {
      if (amountRegex.test(lines[i])) {
        return lines[i];
      }
    }
    for (let i = payMethodIndex - 1; i >= 0; i -= 1) {
      if (amountRegex.test(lines[i])) {
        return lines[i];
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (amountRegex.test(lines[i])) {
      return lines[i];
    }
  }
  return null;
}
