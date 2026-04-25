import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPostFormWithProgress } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";
import { buildPublicFilePath } from "../../lib/slug";

const DEFAULT_MAX_MAIN_FILE_BYTES = 200 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_MAIN_EXTENSIONS = [".pdf", ".zip", ".cbz", ".cbr", ".txt", ".doc", ".docx"];
const ALLOWED_COVER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const ARCHIVE_EXTENSIONS = new Set([".zip", ".cbz", ".rar", ".cbr"]);
const ALLOWED_ARCHIVE_INNER_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const DANGEROUS_ARCHIVE_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".msi",
  ".js",
  ".jse",
  ".vbs",
  ".vbe",
  ".ps1",
  ".psm1",
  ".sh",
  ".apk"
]);
const NESTED_ARCHIVE_EXTENSIONS = new Set([".zip", ".cbz", ".rar", ".cbr", ".7z", ".tar", ".gz"]);

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

type PublicationMode = "preserve" | "request_backup";
type ContentOrigin = "manga" | "manhwa" | "manhua";
type ArchiveEntry = { name: string; encrypted: boolean };
type ArchiveValidationProgress = { pct: number; phase: string };
type SelectedFileMeta = { name: string; size: number; ext: string; mime: string };

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

async function listZipEntries(file: File, onProgress: (data: ArchiveValidationProgress) => void): Promise<ArchiveEntry[]> {
  onProgress({ pct: 8, phase: "reading" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress({ pct: 22, phase: "scanning" });

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

  const entries: ArchiveEntry[] = [];
  let ptr = centralDirOffset;
  for (let i = 0; i < totalEntries; i += 1) {
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
    onProgress({ pct: Math.min(95, 22 + Math.floor(((i + 1) / Math.max(1, totalEntries)) * 70)), phase: "scanning" });
  }

  return entries;
}

async function listRar4Entries(file: File, onProgress: (data: ArchiveValidationProgress) => void): Promise<ArchiveEntry[]> {
  onProgress({ pct: 8, phase: "reading" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const rar4 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
  const rar5 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];

  const isRar4 = rar4.every((v, i) => bytes[i] === v);
  const isRar5 = rar5.every((v, i) => bytes[i] === v);
  if (isRar5) throw new Error("rar5_not_supported");
  if (!isRar4) throw new Error("rar_signature_not_supported");

  onProgress({ pct: 20, phase: "scanning" });
  const entries: ArchiveEntry[] = [];
  let ptr = 7;

  while (ptr + 7 <= bytes.length) {
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
    onProgress({ pct: Math.min(95, 20 + Math.floor((ptr / bytes.length) * 75)), phase: "scanning" });
  }

  return entries;
}

function normalizeInnerPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

function makeFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = value >= 100 || idx === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

function getMainFileBadge(ext: string): string {
  if (ext === ".cbz" || ext === ".cbr") return ext.slice(1).toUpperCase();
  if (ext === ".zip") return "ZIP";
  if (ext === ".pdf") return "PDF";
  if (ext === ".doc" || ext === ".docx") return "DOC";
  if (ext === ".txt") return "TXT";
  return "FILE";
}

function ensureArchiveEntriesAreSafe(entries: ArchiveEntry[]): { ok: true } | { ok: false; message: string } {
  if (entries.length === 0) {
    return { ok: false, message: "archive_no_entries" };
  }

  for (const entry of entries) {
    const normalized = normalizeInnerPath(entry.name);
    if (!normalized || normalized.endsWith("/")) continue;
    if (entry.encrypted) return { ok: false, message: "archive_encrypted" };

    const fileName = normalized.split("/").pop() || normalized;
    const ext = getExtension(fileName);
    if (!ext) return { ok: false, message: `archive_unexpected:${fileName}` };
    if (DANGEROUS_ARCHIVE_EXTENSIONS.has(ext)) return { ok: false, message: `archive_dangerous:${fileName}` };
    if (NESTED_ARCHIVE_EXTENSIONS.has(ext)) return { ok: false, message: `archive_nested:${fileName}` };
    if (!ALLOWED_ARCHIVE_INNER_EXTENSIONS.has(ext)) return { ok: false, message: `archive_unexpected:${fileName}` };
  }

  return { ok: true };
}

export function NewFilePage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement | null>(null);
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastValidationProgressAtRef = useRef<number>(0);
  const validationRunIdRef = useRef<number>(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingArchive, setIsValidatingArchive] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState(0);
  const [archiveElapsedSec, setArchiveElapsedSec] = useState(0);
  const [archivePhase, setArchivePhase] = useState("");
  const [showArchiveValidationModal, setShowArchiveValidationModal] = useState(false);
  const [archiveReportVisible, setArchiveReportVisible] = useState(false);
  const [archiveValidationError, setArchiveValidationError] = useState("");
  const [validatedArchiveKey, setValidatedArchiveKey] = useState("");
  const [progress, setProgress] = useState(0);
  const [mainFileName, setMainFileName] = useState("");
  const [selectedMainFile, setSelectedMainFile] = useState<SelectedFileMeta | null>(null);
  const [coverFileName, setCoverFileName] = useState("");
  const [selectedCoverFile, setSelectedCoverFile] = useState<SelectedFileMeta | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [publicationMode, setPublicationMode] = useState<PublicationMode>("preserve");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastUploadedSlug, setLastUploadedSlug] = useState<string>("");
  const [maxMainFileBytes, setMaxMainFileBytes] = useState<number>(DEFAULT_MAX_MAIN_FILE_BYTES);
  const { t, locale } = useI18n();
  const discordInviteUrl = ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");

  useSeo({
    title: t.newFileTitle,
    description: t.newFileLead,
    path: "/dashboard/new",
    lang: locale,
    index: false,
    follow: false
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const categories = useMemo(
    () => [
      t.categoryShonen,
      t.categoryShojo,
      t.categorySeinen,
      t.categoryJosei,
      t.categoryIsekai,
      t.categoryClassicArchive,
      t.categoryLostMedia,
      t.categoryArtbook,
      t.categoryDoujinshi,
      t.categoryOneshot,
      t.categoryYuri,
      t.categoryYaoi,
      t.categoryMecha,
      t.categoryRomance,
      t.categoryComedy,
      t.categoryEcchi,
      t.categoryHentai,
      t.categorySliceOfLife,
      t.categoryFantasy,
      t.categoryHorror,
      t.categoryDrama
    ].sort((a, b) => a.localeCompare(b)),
    [t]
  );

  useEffect(() => {
    apiGet<{ maxFileSizeBytes: number }>("/files/upload-config", true)
      .then((res) => {
        if (Number.isFinite(res.maxFileSizeBytes) && res.maxFileSizeBytes > 0) {
          setMaxMainFileBytes(res.maxFileSizeBytes);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  useEffect(() => {
    if (!isValidatingArchive) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setArchiveElapsedSec(elapsed);
      const stalledMs = Date.now() - lastValidationProgressAtRef.current;
      if (elapsed >= 10 || stalledMs >= 10_000) {
        setArchiveReportVisible(true);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [isValidatingArchive]);

  const maxMainFileMb = Math.floor(maxMainFileBytes / 1024 / 1024);

  function mapArchiveErrorToMessage(raw: string): string {
    if (raw === "rar5_not_supported") return t.archiveValidationRar5Unsupported;
    if (raw === "rar_signature_not_supported") return t.archiveValidationRarUnsupported;
    if (raw === "archive_encrypted") return t.archiveValidationEncrypted;
    if (raw === "archive_no_entries") return t.archiveValidationEmpty;
    if (raw.startsWith("archive_dangerous:")) return `${t.archiveValidationDangerous}: ${raw.split(":").slice(1).join(":")}`;
    if (raw.startsWith("archive_nested:")) return `${t.archiveValidationNested}: ${raw.split(":").slice(1).join(":")}`;
    if (raw.startsWith("archive_unexpected:")) return `${t.archiveValidationUnexpected}: ${raw.split(":").slice(1).join(":")}`;
    return t.archiveValidationGenericError;
  }

  async function validateArchiveClientSide(file: File): Promise<{ ok: true } | { ok: false; message: string }> {
    const ext = getExtension(file.name);
    if (!ARCHIVE_EXTENSIONS.has(ext)) return { ok: true };

    const onProgress = (data: ArchiveValidationProgress) => {
      setArchiveProgress(Math.max(1, Math.min(99, data.pct)));
      setArchivePhase(data.phase === "reading" ? t.archiveValidationReading : t.archiveValidationScanning);
      lastValidationProgressAtRef.current = Date.now();
    };

    try {
      const entries = ext === ".zip" || ext === ".cbz" ? await listZipEntries(file, onProgress) : await listRar4Entries(file, onProgress);
      const result = ensureArchiveEntriesAreSafe(entries);
      if (!result.ok) return result;
      setArchiveProgress(100);
      setArchivePhase(t.archiveValidationDone);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async function runArchiveValidationForSelectedFile(file: File): Promise<boolean> {
    const ext = getExtension(file.name);
    if (!ARCHIVE_EXTENSIONS.has(ext)) {
      setValidatedArchiveKey("");
      setArchiveValidationError("");
      setArchiveReportVisible(false);
      setShowArchiveValidationModal(false);
      return true;
    }

    const runId = ++validationRunIdRef.current;
    setIsValidatingArchive(true);
    setShowArchiveValidationModal(true);
    setArchiveProgress(1);
    setArchiveElapsedSec(0);
    setArchivePhase(t.archiveValidationReading);
    setArchiveValidationError("");
    setArchiveReportVisible(false);
    setError("");
    lastValidationProgressAtRef.current = Date.now();

    const validationResult = await validateArchiveClientSide(file);
    if (runId !== validationRunIdRef.current) return false;

    setIsValidatingArchive(false);
    if (!validationResult.ok) {
      const message = mapArchiveErrorToMessage(validationResult.message);
      setArchiveValidationError(message);
      setValidatedArchiveKey("");
      setError(`${t.archiveValidationFailed}. ${message}`);
      setMainFileName("");
      setSelectedMainFile(null);
      if (mainFileInputRef.current) {
        mainFileInputRef.current.value = "";
      }
      return false;
    }

    setArchiveValidationError("");
    setArchiveReportVisible(false);
    setValidatedArchiveKey(makeFileKey(file));
    setShowArchiveValidationModal(false);
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const alternateName = String(data.get("alternateName") || "").trim();
    const description = String(data.get("description") || "").trim();
    const category = String(data.get("category") || "").trim();
    const extraMetadata = String(data.get("extraMetadata") || "").trim();
    const contentOrigin = String(data.get("contentOrigin") || "").trim() as ContentOrigin;
    const mainFile = data.get("file");
    const coverImage = data.get("coverImage");

    if (!title) return setError(t.validationTitleRequired);
    if (alternateName.length > 200) return setError(t.validationAlternateNameLength);
    if (!description) return setError(t.validationDescriptionRequired);
    if (!category) return setError(t.validationCategoryRequired);
    if (!(categories as string[]).includes(category)) return setError(t.validationCategoryInvalid);
    if (!["manga", "manhwa", "manhua"].includes(contentOrigin)) return setError(t.validationContentOriginRequired);
    if (!(coverImage instanceof File) || coverImage.size <= 0) return setError(t.validationCoverRequired);

    const hasMainFile = mainFile instanceof File && mainFile.size > 0;
    if (publicationMode === "preserve" && !hasMainFile) return setError(t.validationMainFileRequired);

    if (publicationMode === "request_backup") {
      data.delete("file");
    }

    const mainExt = hasMainFile ? getExtension(mainFile.name) : "";
    const coverExt = getExtension(coverImage.name);
    if (hasMainFile && !ALLOWED_MAIN_EXTENSIONS.includes(mainExt)) return setError(t.validationMainFileType);
    if (hasMainFile && mainFile.size > maxMainFileBytes) return setError(`${t.validationMainFileSize} (${maxMainFileMb} MB)`);
    if (!ALLOWED_COVER_EXTENSIONS.includes(coverExt)) return setError(t.validationCoverType);
    if (coverImage.size > MAX_COVER_BYTES) return setError(t.validationCoverSize);
    if (extraMetadata) {
      try {
        JSON.parse(extraMetadata);
      } catch {
        return setError(t.validationMetadataJson);
      }
    }

    if (hasMainFile && ARCHIVE_EXTENSIONS.has(mainExt) && validatedArchiveKey !== makeFileKey(mainFile)) {
      const isArchiveValid = await runArchiveValidationForSelectedFile(mainFile);
      if (!isArchiveValid) return;
    }

    try {
      setIsSubmitting(true);
      setProgress(0);
      const response = await apiPostFormWithProgress<{ item?: { id?: string; slug?: string } }>("/files", data, (pct) => setProgress(pct));
      setProgress(100);
      setStatus(t.uploadQueued);
      setLastUploadedSlug(response?.item?.slug ?? "");
      setShowSuccessModal(true);
      form.reset();
      setMainFileName("");
      setSelectedMainFile(null);
      setCoverFileName("");
      setSelectedCoverFile(null);
      setValidatedArchiveKey("");
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      setCoverPreviewUrl("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="upload-page">
      <h1>{t.newFileTitle}</h1>
      <p>{t.newFileLead}</p>
      <form ref={formRef} onSubmit={onSubmit} className="upload-form">
        <fieldset className="upload-fieldset publication-mode-fieldset">
          <legend>{t.publishModeLegend}</legend>
          <div className="publication-mode-grid">
            <label
              className={`publication-mode-card ${publicationMode === "preserve" ? "is-active" : ""}`}
              aria-pressed={publicationMode === "preserve"}
            >
              <input
                className="publication-mode-radio"
                type="radio"
                name="publicationMode"
                value="preserve"
                checked={publicationMode === "preserve"}
                onChange={() => setPublicationMode("preserve")}
              />
              <span className="publication-mode-title">{t.publishModePreserveLabel}</span>
              <span className="publication-mode-desc">{t.publishModePreserveDesc}</span>
            </label>
            <label
              className={`publication-mode-card ${publicationMode === "request_backup" ? "is-active" : ""}`}
              aria-pressed={publicationMode === "request_backup"}
            >
              <input
                className="publication-mode-radio"
                type="radio"
                name="publicationMode"
                value="request_backup"
                checked={publicationMode === "request_backup"}
                onChange={() => {
                  setPublicationMode("request_backup");
                  setMainFileName("");
                  setSelectedMainFile(null);
                  setValidatedArchiveKey("");
                  setArchiveValidationError("");
                  setArchiveReportVisible(false);
                  setShowArchiveValidationModal(false);
                  if (mainFileInputRef.current) {
                    mainFileInputRef.current.value = "";
                  }
                }}
              />
              <span className="publication-mode-title">{t.publishModeRequestLabel}</span>
              <span className="publication-mode-desc">{t.publishModeRequestDesc}</span>
            </label>
          </div>
          <p className="publication-mode-summary">
            {publicationMode === "preserve" ? t.publishModePreserveHint : t.publishModeRequestHint}
          </p>
        </fieldset>

        <div className="upload-form-grid">
          <fieldset className="upload-fieldset">
            <legend>{t.newFileMetaSection}</legend>

            <label htmlFor="title">{t.fieldTitle}</label>
            <input id="title" name="title" required placeholder={t.placeholderTitle} />

            <label htmlFor="alternateName">{t.fieldAlternateName}</label>
            <input id="alternateName" name="alternateName" placeholder={t.placeholderAlternateName} />

            <label htmlFor="description">{t.fieldDescription}</label>
            <textarea id="description" name="description" required placeholder={t.placeholderDescription} rows={4} />

            <label htmlFor="category">{t.fieldCategory}</label>
            <input
              id="category"
              name="category"
              list="categories-list"
              placeholder={t.categorySelectPlaceholder}
              required
              autoComplete="off"
            />
            <datalist id="categories-list">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>

            <label htmlFor="contentOrigin">{t.fieldContentOrigin}</label>
            <select id="contentOrigin" name="contentOrigin" defaultValue="manga" required>
              <option value="manga">{t.contentOriginManga}</option>
              <option value="manhwa">{t.contentOriginManhwa}</option>
              <option value="manhua">{t.contentOriginManhua}</option>
            </select>

            <label htmlFor="tags">{t.fieldTags}</label>
            <input id="tags" name="tags" placeholder={t.placeholderTags} />

            <input name="uploadDate" type="hidden" value={today} readOnly />

            <label htmlFor="extraMetadata">{t.fieldExtraMetadata}</label>
            <textarea id="extraMetadata" name="extraMetadata" placeholder={t.placeholderMetadata} rows={3} />
          </fieldset>

          <fieldset className="upload-fieldset">
            <legend>{t.newFileAssetsSection}</legend>

            <label htmlFor="file">{t.fieldMainFile}</label>
            {publicationMode === "preserve" && !selectedMainFile && (
              <label htmlFor="file" className="file-upload-control">
                <span className="file-upload-icon" aria-hidden="true">⤴</span>
                <span className="file-upload-copy">
                  <strong>{mainFileName ? t.filePickerReplace : t.filePickerClickHint}</strong>
                  <span>{mainFileName || t.filePickerNoFile}</span>
                  <em>{t.filePickerMainDropHint} ({maxMainFileMb} MB)</em>
                </span>
              </label>
            )}
            <input
              ref={mainFileInputRef}
              id="file"
              name="file"
              type="file"
              className="file-input-native"
              disabled={publicationMode === "request_backup"}
              accept=".pdf,.zip,.cbz,.cbr,.txt,.doc,.docx"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                setMainFileName(file?.name ?? "");
                setArchiveValidationError("");
                setArchiveReportVisible(false);
                setShowArchiveValidationModal(false);
                if (!file) {
                  setValidatedArchiveKey("");
                  setSelectedMainFile(null);
                  return;
                }
                setSelectedMainFile({
                  name: file.name,
                  size: file.size,
                  ext: getExtension(file.name),
                  mime: file.type || "application/octet-stream"
                });
                if (publicationMode === "request_backup") {
                  setValidatedArchiveKey("");
                  setSelectedMainFile(null);
                  return;
                }
                if (!ARCHIVE_EXTENSIONS.has(getExtension(file.name))) {
                  setValidatedArchiveKey("");
                  return;
                }
                await runArchiveValidationForSelectedFile(file);
              }}
            />
            {publicationMode === "preserve" && selectedMainFile && (
              <div className="selected-file-preview" role="status" aria-live="polite">
                <div className="selected-file-thumb" aria-hidden="true">
                  {getMainFileBadge(selectedMainFile.ext)}
                </div>
                <div className="selected-file-meta">
                  <strong>{selectedMainFile.name}</strong>
                  <span>{t.fileType}: {selectedMainFile.ext ? selectedMainFile.ext.slice(1).toUpperCase() : "FILE"}</span>
                  <span>{t.fileSize}: {formatBytes(selectedMainFile.size)}</span>
                </div>
                <button
                  type="button"
                  className="ghost-btn selected-file-remove-btn"
                  onClick={() => {
                    setMainFileName("");
                    setSelectedMainFile(null);
                    setValidatedArchiveKey("");
                    setArchiveValidationError("");
                    setArchiveReportVisible(false);
                    setShowArchiveValidationModal(false);
                    if (mainFileInputRef.current) {
                      mainFileInputRef.current.value = "";
                    }
                  }}
                >
                  {t.removeMainFile}
                </button>
              </div>
            )}
            <small>
              {publicationMode === "preserve"
                ? mainFileName || `${t.publishModePreserveHint} (${maxMainFileMb} MB)`
                : t.publishModeRequestHint}
            </small>

            <label htmlFor="coverImage">{t.fieldCoverImage}</label>
            {!selectedCoverFile && (
              <label htmlFor="coverImage" className="file-upload-control">
                <span className="file-upload-icon" aria-hidden="true">▣</span>
                <span className="file-upload-copy">
                  <strong>{coverFileName ? t.filePickerReplace : t.filePickerClickHint}</strong>
                  <span>{coverFileName || t.filePickerNoFile}</span>
                  <em>{t.filePickerCoverDropHint}</em>
                </span>
              </label>
            )}
            <input
              ref={coverFileInputRef}
              id="coverImage"
              name="coverImage"
              type="file"
              className="file-input-native"
              required
              accept=".png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                setCoverFileName(file?.name ?? "");
                if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
                if (file) {
                  setSelectedCoverFile({
                    name: file.name,
                    size: file.size,
                    ext: getExtension(file.name),
                    mime: file.type || "application/octet-stream"
                  });
                  setCoverPreviewUrl(URL.createObjectURL(file));
                } else {
                  setSelectedCoverFile(null);
                  setCoverPreviewUrl("");
                }
              }}
            />
            <small>{coverFileName || t.hintCoverImage}</small>
            <div style={{ marginTop: "4px", fontSize: "0.85em", color: "var(--color-danger, #e74c3c)", fontWeight: "500" }}>
              ⚠️ {t.hintCoverRules}
            </div>
            {coverPreviewUrl && selectedCoverFile && (
              <div className="selected-cover-preview">
                <img className="cover-preview" src={coverPreviewUrl} alt={t.coverPreviewAlt} />
                <div className="selected-file-meta">
                  <strong>{selectedCoverFile.name}</strong>
                  <span>{t.fileType}: {selectedCoverFile.ext ? selectedCoverFile.ext.slice(1).toUpperCase() : "IMAGE"}</span>
                  <span>{t.fileSize}: {formatBytes(selectedCoverFile.size)}</span>
                </div>
                <button
                  type="button"
                  className="ghost-btn selected-file-remove-btn"
                  onClick={() => {
                    setCoverFileName("");
                    setSelectedCoverFile(null);
                    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
                    setCoverPreviewUrl("");
                    if (coverFileInputRef.current) {
                      coverFileInputRef.current.value = "";
                    }
                  }}
                >
                  {t.removeCoverFile}
                </button>
              </div>
            )}
          </fieldset>
        </div>

        <div className="upload-actions">
          <button type="submit" disabled={isSubmitting || isValidatingArchive}>
            {isSubmitting ? t.newFilePublishing : t.newFilePublish}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              formRef.current?.reset();
              setMainFileName("");
              setSelectedMainFile(null);
              setCoverFileName("");
              setSelectedCoverFile(null);
              setStatus("");
              setError("");
              setShowSuccessModal(false);
              setProgress(0);
              setValidatedArchiveKey("");
              setArchiveValidationError("");
              setArchiveReportVisible(false);
              setShowArchiveValidationModal(false);
              if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
              setCoverPreviewUrl("");
            }}
            disabled={isSubmitting || isValidatingArchive}
          >
            {t.newFileClear}
          </button>
        </div>
        {isSubmitting && (
          <div className="upload-progress-wrap" aria-live="polite">
            <div className="upload-progress-head">
              <span>{t.uploadProgressLabel}</span>
              <strong>
                {progress}% {t.uploadProgressPercent}
              </strong>
            </div>
            <progress className="upload-progress" value={progress} max={100} />
          </div>
        )}
      </form>
      {error && <p className="upload-error">{error}</p>}
      {status && <p className="upload-success">{status}</p>}
      {showArchiveValidationModal && (
        <div className="success-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="archive-validation-title">
          <div className="success-modal-card archive-validation-modal">
            <h3 id="archive-validation-title">{t.archiveValidationTitle}</h3>
            <p>{t.archiveValidationLead}</p>
            <div className="upload-progress-wrap">
              <div className="upload-progress-head">
                <span>{archivePhase || t.archiveValidationScanning}</span>
                <strong>{archiveProgress}%</strong>
              </div>
              <progress className="upload-progress" value={archiveProgress} max={100} />
            </div>
            <p className="archive-validation-time">{t.archiveValidationElapsed}: {archiveElapsedSec}s</p>
            {archiveValidationError && <p className="upload-error">{archiveValidationError}</p>}
            {(archiveReportVisible || archiveValidationError) && (
              <div className="archive-validation-report">
                <p>{t.archiveValidationReportHelp}</p>
                <a className="detail-discord-link" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
                  {t.archiveValidationReportBtn}
                </a>
              </div>
            )}
            {archiveValidationError && (
              <div className="success-modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowArchiveValidationModal(false)}
                >
                  {t.archiveValidationClose}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {showSuccessModal && (
        <div className="success-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upload-success-title">
          <div className="success-modal-card">
            <h3 id="upload-success-title">{t.uploadSuccessTitle}</h3>
            <p>{t.uploadSuccessBody}</p>
            <div className="success-modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  navigate(lastUploadedSlug ? buildPublicFilePath(lastUploadedSlug) : "/dashboard/files");
                }}
              >
                {t.uploadSuccessView}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setShowSuccessModal(false);
                  setStatus("");
                }}
              >
                {t.uploadSuccessMore}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
