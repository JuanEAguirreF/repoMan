function startsWithBytes(input: Uint8Array, signature: number[], offset = 0): boolean {
  if (input.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (input[offset + i] !== signature[i]) return false;
  }
  return true;
}

function isLikelyText(buffer: Uint8Array): boolean {
  if (buffer.length === 0) return true;
  let printable = 0;
  const sampleLength = Math.min(buffer.length, 2048);
  for (let i = 0; i < sampleLength; i += 1) {
    const code = buffer[i];
    const isTabOrLineBreak = code === 9 || code === 10 || code === 13;
    const isPrintableAscii = code >= 32 && code <= 126;
    const isUtf8HighByte = code >= 128;
    if (isTabOrLineBreak || isPrintableAscii || isUtf8HighByte) printable += 1;
  }
  return printable / sampleLength >= 0.9;
}

export function detectCoverSignature(buffer: Uint8Array): "png" | "jpeg" | "webp" | "unknown" {
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return "unknown";
}

export function validateCoverMagic(buffer: Uint8Array, extension: string): boolean {
  const detected = detectCoverSignature(buffer);
  if (extension === ".png") return detected === "png";
  if (extension === ".jpg" || extension === ".jpeg") return detected === "jpeg";
  if (extension === ".webp") return detected === "webp";
  return false;
}

export function validateMainFileMagic(buffer: Uint8Array, extension: string): boolean {
  if (extension === ".pdf") return startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  if (extension === ".zip" || extension === ".cbz" || extension === ".docx") {
    return (
      startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWithBytes(buffer, [0x50, 0x4b, 0x07, 0x08])
    );
  }
  if (extension === ".cbr") {
    return startsWithBytes(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) || // rar4
      startsWithBytes(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]); // rar5
  }
  if (extension === ".doc") return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0]); // OLE
  if (extension === ".txt") return isLikelyText(buffer);
  return false;
}

export function containsSuspiciousExecutableMarker(buffer: Uint8Array): boolean {
  return startsWithBytes(buffer, [0x4d, 0x5a]) || // PE/MZ
    startsWithBytes(buffer, [0x7f, 0x45, 0x4c, 0x46]); // ELF
}
