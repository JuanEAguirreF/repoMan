import fs from "node:fs/promises";
import path from "node:path";

type ZipEntry = { name: string; encrypted: boolean };
type TreeLeaf = { type: "file"; name: string; path: string };
type TreeFolder = { type: "folder"; name: string; path: string; children: TreeNode[] };
export type TreeNode = TreeLeaf | TreeFolder;

export type ReviewTreeResult = {
  format: "zip" | "rar" | "pdf" | "other";
  nodes: TreeNode[];
  summary: {
    files: number;
    folders: number;
    totalEntries: number;
    truncated: boolean;
  };
  warnings: string[];
};

const MAX_TREE_ENTRIES = 5000;

function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function decodeName(raw: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(raw).trim();
  } catch {
    return "";
  }
}

function normalizePath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const minEocdSize = 22;
  const searchStart = Math.max(0, bytes.length - 66000);
  let eocd = -1;
  for (let i = bytes.length - minEocdSize; i >= searchStart; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip_eocd_not_found");

  const totalEntries = readU16LE(bytes, eocd + 10);
  const centralDirSize = readU32LE(bytes, eocd + 12);
  const centralDirOffset = readU32LE(bytes, eocd + 16);
  if (centralDirOffset + centralDirSize > bytes.length) throw new Error("zip_central_dir_out_of_bounds");

  const entries: ZipEntry[] = [];
  let ptr = centralDirOffset;
  for (let i = 0; i < totalEntries && entries.length < MAX_TREE_ENTRIES; i += 1) {
    if (
      ptr + 46 > bytes.length ||
      bytes[ptr] !== 0x50 ||
      bytes[ptr + 1] !== 0x4b ||
      bytes[ptr + 2] !== 0x01 ||
      bytes[ptr + 3] !== 0x02
    ) {
      throw new Error("zip_invalid_central_header");
    }

    const flags = readU16LE(bytes, ptr + 8);
    const fileNameLen = readU16LE(bytes, ptr + 28);
    const extraLen = readU16LE(bytes, ptr + 30);
    const commentLen = readU16LE(bytes, ptr + 32);
    const nameStart = ptr + 46;
    const nameEnd = nameStart + fileNameLen;
    if (nameEnd > bytes.length) throw new Error("zip_invalid_name_bounds");

    const name = decodeName(bytes.slice(nameStart, nameEnd));
    entries.push({ name, encrypted: (flags & 0x0001) !== 0 });
    ptr = nameEnd + extraLen + commentLen;
  }

  return entries;
}

function listRar4Entries(bytes: Uint8Array): ZipEntry[] {
  const rar4 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
  const rar5 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
  const isRar4 = rar4.every((v, i) => bytes[i] === v);
  const isRar5 = rar5.every((v, i) => bytes[i] === v);
  if (isRar5) throw new Error("rar5_not_supported");
  if (!isRar4) throw new Error("rar_signature_not_supported");

  const entries: ZipEntry[] = [];
  let ptr = 7;
  while (ptr + 7 <= bytes.length && entries.length < MAX_TREE_ENTRIES) {
    const headType = bytes[ptr + 2];
    const flags = readU16LE(bytes, ptr + 3);
    const headSize = readU16LE(bytes, ptr + 5);
    let addSize = 0;
    if ((flags & 0x8000) !== 0) {
      if (ptr + 11 > bytes.length) break;
      addSize = readU32LE(bytes, ptr + 7);
    }
    const blockSize = headSize + addSize;
    if (blockSize <= 0) break;

    if (headType === 0x74) {
      const base = ptr + 7;
      if (base + 25 <= bytes.length) {
        const nameSize = readU16LE(bytes, base + 19);
        let fileHeaderBytes = 25;
        if ((flags & 0x0100) !== 0) fileHeaderBytes += 8;
        const nameStart = base + fileHeaderBytes;
        const nameEnd = nameStart + nameSize;
        if (nameEnd <= bytes.length) {
          const name = decodeName(bytes.slice(nameStart, nameEnd));
          entries.push({ name, encrypted: (flags & 0x0004) !== 0 });
        }
      }
    }

    ptr += blockSize;
  }

  return entries;
}

function buildTree(rawPaths: string[]): TreeNode[] {
  const rootChildren: TreeNode[] = [];

  function ensureFolder(parentChildren: TreeNode[], folderPath: string, folderName: string): TreeFolder {
    const found = parentChildren.find(
      (child): child is TreeFolder => child.type === "folder" && child.name === folderName && child.path === folderPath
    );
    if (found) return found;

    const created: TreeFolder = { type: "folder", name: folderName, path: folderPath, children: [] };
    parentChildren.push(created);
    return created;
  }

  for (const raw of rawPaths) {
    const normalized = normalizePath(raw);
    if (!normalized) continue;

    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let children = rootChildren;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!;
      const currentPath = parts.slice(0, i + 1).join("/");
      const isLast = i === parts.length - 1;

      if (isLast) {
        const existing = children.find((child) => child.path === currentPath);
        if (!existing) {
          children.push({ type: "file", name: part, path: currentPath });
        }
      } else {
        const folder = ensureFolder(children, currentPath, part);
        children = folder.children;
      }
    }
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.type === "folder") {
        sortNodes(node.children);
      }
    }
    return nodes;
  }

  return sortNodes(rootChildren);
}

function summarizeTree(nodes: TreeNode[]): { files: number; folders: number } {
  let files = 0;
  let folders = 0;

  function walk(list: TreeNode[]) {
    for (const node of list) {
      if (node.type === "file") files += 1;
      if (node.type === "folder") {
        folders += 1;
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return { files, folders };
}

function detectFormat(extension: string): ReviewTreeResult["format"] {
  const ext = extension.toLowerCase();
  if (ext === ".zip" || ext === ".cbz") return "zip";
  if (ext === ".rar" || ext === ".cbr") return "rar";
  if (ext === ".pdf") return "pdf";
  return "other";
}

async function inspectPdf(pathname: string): Promise<{ warnings: string[]; pseudoEntries: string[] }> {
  const fd = await fs.open(pathname, "r");
  try {
    const headerBuffer = Buffer.alloc(16);
    const { bytesRead } = await fd.read(headerBuffer, 0, 16, 0);
    const header = headerBuffer.slice(0, bytesRead).toString("ascii");
    const warnings: string[] = [];
    if (!header.startsWith("%PDF-")) {
      warnings.push("PDF header not found in first bytes.");
    }
    const version = header.startsWith("%PDF-") ? header.slice(5, 8).trim() : "unknown";
    return {
      warnings,
      pseudoEntries: [`document.pdf`, `meta/version-${version || "unknown"}`]
    };
  } finally {
    await fd.close();
  }
}

export async function inspectFileAsTree(fileAbsolutePath: string, originalFilename: string): Promise<ReviewTreeResult> {
  const extension = path.extname(originalFilename || fileAbsolutePath).toLowerCase();
  const format = detectFormat(extension);

  if (format === "pdf") {
    const pdf = await inspectPdf(fileAbsolutePath);
    const nodes = buildTree(pdf.pseudoEntries);
    const totals = summarizeTree(nodes);
    return {
      format,
      nodes,
      summary: { files: totals.files, folders: totals.folders, totalEntries: pdf.pseudoEntries.length, truncated: false },
      warnings: [
        "PDF preview shows lightweight document metadata only. Download is required for deep content review.",
        ...pdf.warnings
      ]
    };
  }

  if (format === "other") {
    const base = path.basename(originalFilename || fileAbsolutePath);
    const nodes = buildTree([base]);
    const totals = summarizeTree(nodes);
    return {
      format,
      nodes,
      summary: { files: totals.files, folders: totals.folders, totalEntries: 1, truncated: false },
      warnings: ["Tree view is optimized for ZIP/CBZ/RAR/CBR. For this format, use secure download for manual review."]
    };
  }

  const buffer = await fs.readFile(fileAbsolutePath);
  const bytes = new Uint8Array(buffer);
  const entries = format === "zip" ? listZipEntries(bytes) : listRar4Entries(bytes);
  const normalized = entries
    .map((entry) => normalizePath(entry.name))
    .filter(Boolean)
    .slice(0, MAX_TREE_ENTRIES);

  const nodes = buildTree(normalized);
  const totals = summarizeTree(nodes);
  const hasEncrypted = entries.some((entry) => entry.encrypted);
  const wasTruncated = entries.length > MAX_TREE_ENTRIES;
  const warnings: string[] = [];
  if (hasEncrypted) warnings.push("Encrypted entries were detected.");
  if (wasTruncated) warnings.push(`Tree was truncated to ${MAX_TREE_ENTRIES} entries for safety.`);

  return {
    format,
    nodes,
    summary: {
      files: totals.files,
      folders: totals.folders,
      totalEntries: entries.length,
      truncated: wasTruncated
    },
    warnings
  };
}
