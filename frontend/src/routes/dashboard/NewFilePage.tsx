import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPostFormWithProgress } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";
import { buildPublicFilePath } from "../../lib/slug";
import { trackEvent } from "../../lib/analytics";

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
type OptionalFieldKey = "alternateName" | "author" | "artist" | "tags";
type ArchiveEntry = { name: string; encrypted: boolean };
type ArchiveValidationProgress = { pct: number; phase: string };
type SelectedFileMeta = { name: string; size: number; ext: string; mime: string };
type MetadataPair = { id: string; key: string; value: string };
type MetadataPreset = { key: string; value: string };
type UploadDraft = {
  publicationMode: PublicationMode;
  contentOrigin: ContentOrigin;
  title: string;
  description: string;
  category: string;
  optionalValues: Record<OptionalFieldKey, string>;
  enabledOptionalFields: OptionalFieldKey[];
  metadataPairs: MetadataPair[];
};

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const METADATA_PRESETS_BY_ORIGIN: Record<ContentOrigin, MetadataPreset[]> = {
  manga: [
    { key: "origin_country", value: "Japan" },
    { key: "reading_direction", value: "right_to_left" },
    { key: "source_format", value: "tankobon" }
  ],
  manhwa: [
    { key: "origin_country", value: "South Korea" },
    { key: "reading_direction", value: "left_to_right" },
    { key: "source_format", value: "webtoon" }
  ],
  manhua: [
    { key: "origin_country", value: "China" },
    { key: "reading_direction", value: "left_to_right" },
    { key: "source_format", value: "manhua_serial" }
  ]
};

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
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadLastProgressAtRef = useRef<number>(0);
  const uploadLastPctRef = useRef<number>(0);
  const retryAfterAbortRef = useRef(false);
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
  const [showUploadStalledModal, setShowUploadStalledModal] = useState(false);
  const [mainFileName, setMainFileName] = useState("");
  const [selectedMainFile, setSelectedMainFile] = useState<SelectedFileMeta | null>(null);
  const [coverFileName, setCoverFileName] = useState("");
  const [selectedCoverFile, setSelectedCoverFile] = useState<SelectedFileMeta | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [publicationMode, setPublicationMode] = useState<PublicationMode>("preserve");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastUploadedSlug, setLastUploadedSlug] = useState<string>("");
  const [canViewUploadedItem, setCanViewUploadedItem] = useState(false);
  const [lastUploadDraft, setLastUploadDraft] = useState<UploadDraft | null>(null);
  const [maxMainFileBytes, setMaxMainFileBytes] = useState<number>(DEFAULT_MAX_MAIN_FILE_BYTES);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [enabledOptionalFields, setEnabledOptionalFields] = useState<OptionalFieldKey[]>([]);
  const [metadataPairs, setMetadataPairs] = useState<MetadataPair[]>([]);
  const [optionalFieldToAdd, setOptionalFieldToAdd] = useState<OptionalFieldKey | "">("");
  const [contentOriginValue, setContentOriginValue] = useState<ContentOrigin>("manga");
  const { t, locale } = useI18n();
  const discordInviteUrl = ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");
  const ux = useMemo(
    () =>
      locale === "es"
        ? {
            optionalToggleShow: "Mostrar campos opcionales",
            optionalToggleHide: "Ocultar campos opcionales",
            optionalLead: "Agrega solo los campos opcionales que necesites.",
            addFieldLabel: "Agregar campo",
            addFieldBtn: "Agregar",
            removeFieldBtn: "Quitar",
            extraMetaLead: "Metadatos extra (campo y valor)",
            extraMetaAddRow: "Agregar metadato",
            extraMetaKey: "Campo",
            extraMetaValue: "Valor",
            extraMetaKeyPlaceholder: "ej: language",
            extraMetaValuePlaceholder: "ej: es",
            extraMetaRemove: "Quitar",
            extraMetaInvalidKey: "En metadatos extra no se permiten claves vacías.",
            extraMetaDuplicateKey: "Hay claves repetidas en metadatos extra.",
            extraMetaPresetLead: "Sugerencias rápidas según tipo de obra",
            extraMetaPresetAll: "Agregar sugerencias",
            extraMetaMoveUp: "Subir",
            extraMetaMoveDown: "Bajar",
            uploadSuccessMoreSameSeries: "Subir más del mismo manga",
            uploadCancelBtn: "Cancelar subida",
            uploadCancelled: "Subida cancelada. Puedes corregir y reintentar.",
            uploadStalledTitle: "La subida parece detenida",
            uploadStalledBody:
              "Detectamos que el progreso no avanza desde hace un momento. Puede haber un problema de red o del servidor.",
            uploadStalledCancel: "Cancelar",
            uploadStalledRetry: "Cancelar y reintentar"
          }
        : {
            optionalToggleShow: "Show optional fields",
            optionalToggleHide: "Hide optional fields",
            optionalLead: "Add only the optional fields you need.",
            addFieldLabel: "Add field",
            addFieldBtn: "Add",
            removeFieldBtn: "Remove",
            extraMetaLead: "Extra metadata (field and value)",
            extraMetaAddRow: "Add metadata",
            extraMetaKey: "Field",
            extraMetaValue: "Value",
            extraMetaKeyPlaceholder: "e.g. language",
            extraMetaValuePlaceholder: "e.g. en",
            extraMetaRemove: "Remove",
            extraMetaInvalidKey: "Extra metadata contains an empty key.",
            extraMetaDuplicateKey: "Extra metadata contains duplicate keys.",
            extraMetaPresetLead: "Quick suggestions by content type",
            extraMetaPresetAll: "Add suggestions",
            extraMetaMoveUp: "Up",
            extraMetaMoveDown: "Down",
            uploadSuccessMoreSameSeries: "Upload more from the same manga",
            uploadCancelBtn: "Cancel upload",
            uploadCancelled: "Upload canceled. You can adjust data and retry.",
            uploadStalledTitle: "Upload seems stuck",
            uploadStalledBody:
              "Progress has not moved for a while. There may be a network or server issue.",
            uploadStalledCancel: "Cancel",
            uploadStalledRetry: "Cancel and retry"
          },
    [locale]
  );
  const metadataPresetSuggestions = useMemo(() => METADATA_PRESETS_BY_ORIGIN[contentOriginValue], [contentOriginValue]);
  const optionalFieldOptions = useMemo(
    () =>
      [
        { key: "alternateName" as const, label: t.fieldAlternateName },
        { key: "author" as const, label: t.fieldAuthor },
        { key: "artist" as const, label: t.fieldArtist },
        { key: "tags" as const, label: t.fieldTags }
      ].filter((opt) => !enabledOptionalFields.includes(opt.key)),
    [enabledOptionalFields, t.fieldAlternateName, t.fieldAuthor, t.fieldArtist, t.fieldTags]
  );

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

  useEffect(() => {
    if (!isSubmitting) return;
    const timer = window.setInterval(() => {
      const stalledMs = Date.now() - uploadLastProgressAtRef.current;
      const currentPct = uploadLastPctRef.current;
      if (!showUploadStalledModal && currentPct > 0 && currentPct < 100 && stalledMs > 20_000) {
        setShowUploadStalledModal(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSubmitting, showUploadStalledModal]);

  const maxMainFileMb = Math.floor(maxMainFileBytes / 1024 / 1024);

  function failValidation(message: string, reason: string): never {
    trackEvent("upload_validation_error", {
      reason,
      publication_mode: publicationMode
    });
    setError(message);
    throw new Error("__upload_validation_handled__");
  }

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
    const author = String(data.get("author") || "").trim();
    const artist = String(data.get("artist") || "").trim();
    const tags = String(data.get("tags") || "").trim();
    const description = String(data.get("description") || "").trim();
    const category = String(data.get("category") || "").trim();
    const contentOrigin = contentOriginValue;
    const mainFile = data.get("file");
    const coverImage = data.get("coverImage");
    const builtExtraMetadata: Record<string, string> = {};
    const usedMetadataKeys = new Set<string>();

    for (const pair of metadataPairs) {
      const key = pair.key.trim();
      const value = pair.value.trim();
      if (!key && !value) continue;
      if (!key) {
        setError(ux.extraMetaInvalidKey);
        trackEvent("upload_validation_error", { reason: "extra_metadata_empty_key", publication_mode: publicationMode });
        return;
      }
      if (usedMetadataKeys.has(key.toLowerCase())) {
        setError(ux.extraMetaDuplicateKey);
        trackEvent("upload_validation_error", { reason: "extra_metadata_duplicate_key", publication_mode: publicationMode });
        return;
      }
      usedMetadataKeys.add(key.toLowerCase());
      builtExtraMetadata[key] = value;
    }
    if (Object.keys(builtExtraMetadata).length > 0) {
      data.set("extraMetadata", JSON.stringify(builtExtraMetadata));
    } else {
      data.delete("extraMetadata");
    }

    try {
      if (!title) failValidation(t.validationTitleRequired, "title_required");
      if (alternateName.length > 200) failValidation(t.validationAlternateNameLength, "alternate_name_too_long");
      if (author.length > 200) failValidation(t.validationAuthorLength, "author_too_long");
      if (artist.length > 200) failValidation(t.validationArtistLength, "artist_too_long");
      if (!description) failValidation(t.validationDescriptionRequired, "description_required");
      if (!category) failValidation(t.validationCategoryRequired, "category_required");
      if (!(categories as string[]).includes(category)) failValidation(t.validationCategoryInvalid, "category_invalid");
      if (!["manga", "manhwa", "manhua"].includes(contentOrigin)) failValidation(t.validationContentOriginRequired, "content_origin_invalid");
      if (!(coverImage instanceof File) || coverImage.size <= 0) failValidation(t.validationCoverRequired, "cover_required");
    } catch (error) {
      if ((error as Error).message === "__upload_validation_handled__") return;
      throw error;
    }

    const hasMainFile = mainFile instanceof File && mainFile.size > 0;
    if (publicationMode === "preserve" && !hasMainFile) {
      setError(t.validationMainFileRequired);
      trackEvent("upload_validation_error", { reason: "main_file_required", publication_mode: publicationMode });
      return;
    }

    if (publicationMode === "request_backup") {
      data.delete("file");
    }

    const mainExt = hasMainFile ? getExtension(mainFile.name) : "";
    const coverExt = getExtension(coverImage.name);
    if (hasMainFile && !ALLOWED_MAIN_EXTENSIONS.includes(mainExt)) {
      setError(t.validationMainFileType);
      trackEvent("upload_validation_error", { reason: "main_file_type_invalid", publication_mode: publicationMode });
      return;
    }
    if (hasMainFile && mainFile.size > maxMainFileBytes) {
      setError(`${t.validationMainFileSize} (${maxMainFileMb} MB)`);
      trackEvent("upload_validation_error", { reason: "main_file_size_exceeded", publication_mode: publicationMode });
      return;
    }
    if (!ALLOWED_COVER_EXTENSIONS.includes(coverExt)) {
      setError(t.validationCoverType);
      trackEvent("upload_validation_error", { reason: "cover_type_invalid", publication_mode: publicationMode });
      return;
    }
    if (coverImage.size > MAX_COVER_BYTES) {
      setError(t.validationCoverSize);
      trackEvent("upload_validation_error", { reason: "cover_size_exceeded", publication_mode: publicationMode });
      return;
    }
    if (hasMainFile && ARCHIVE_EXTENSIONS.has(mainExt) && validatedArchiveKey !== makeFileKey(mainFile)) {
      const isArchiveValid = await runArchiveValidationForSelectedFile(mainFile);
      if (!isArchiveValid) {
        trackEvent("upload_archive_validation_failed", {
          publication_mode: publicationMode,
          extension: mainExt.replace(".", "")
        });
        return;
      }
      trackEvent("upload_archive_validation_success", {
        publication_mode: publicationMode,
        extension: mainExt.replace(".", "")
      });
    }

    try {
      retryAfterAbortRef.current = false;
      trackEvent("upload_submit", {
        publication_mode: publicationMode,
        has_main_file: hasMainFile,
        content_origin: contentOrigin
      });
      setIsSubmitting(true);
      setProgress(0);
      setShowUploadStalledModal(false);
      uploadLastProgressAtRef.current = Date.now();
      uploadLastPctRef.current = 0;
      const uploadAbortController = new AbortController();
      uploadAbortRef.current = uploadAbortController;
      const response = await apiPostFormWithProgress<{
        item?: { id?: string; slug?: string; status?: string; is_public?: boolean };
      }>(
        "/files",
        data,
        (pct) => {
          if (pct !== uploadLastPctRef.current) {
            uploadLastPctRef.current = pct;
            uploadLastProgressAtRef.current = Date.now();
          }
          setProgress(pct);
        },
        uploadAbortController.signal
      );
      setProgress(100);
      setStatus(t.uploadQueued);
      const uploadedItem = response?.item;
      const viewAllowed = uploadedItem?.status === "active" && uploadedItem?.is_public === true;
      trackEvent("upload_success", {
        publication_mode: publicationMode,
        status: uploadedItem?.status || "unknown",
        is_public: uploadedItem?.is_public === true
      });
      setCanViewUploadedItem(viewAllowed);
      setLastUploadedSlug(viewAllowed ? uploadedItem?.slug ?? "" : "");
      setLastUploadDraft({
        publicationMode,
        contentOrigin,
        title,
        description,
        category,
        optionalValues: {
          alternateName,
          author,
          artist,
          tags
        },
        enabledOptionalFields: [...enabledOptionalFields],
        metadataPairs: metadataPairs.map((pair) => ({
          id: createClientId(),
          key: pair.key,
          value: pair.value
        }))
      });
      setShowSuccessModal(true);
      form.reset();
      setContentOriginValue("manga");
      setMainFileName("");
      setSelectedMainFile(null);
      setCoverFileName("");
      setSelectedCoverFile(null);
      setValidatedArchiveKey("");
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      setCoverPreviewUrl("");
    } catch (error) {
      const message = (error as Error).message;
      if (message === "Upload aborted.") {
        trackEvent("upload_cancelled", { publication_mode: publicationMode });
        setError("");
        setStatus(ux.uploadCancelled);
      } else {
        trackEvent("upload_error", {
          publication_mode: publicationMode
        });
        setError(message);
      }
    } finally {
      const shouldRetry = retryAfterAbortRef.current;
      retryAfterAbortRef.current = false;
      setShowUploadStalledModal(false);
      uploadAbortRef.current = null;
      setIsSubmitting(false);
      if (shouldRetry && formRef.current) {
        window.setTimeout(() => formRef.current?.requestSubmit(), 80);
      }
    }
  }

  function addOrPatchMetadataPreset(preset: MetadataPreset) {
    setMetadataPairs((prev) => {
      const keyLc = preset.key.trim().toLowerCase();
      const existingIdx = prev.findIndex((row) => row.key.trim().toLowerCase() === keyLc);
      if (existingIdx >= 0) {
        if (prev[existingIdx].value.trim().length > 0) return prev;
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], value: preset.value };
        return next;
      }
      return [...prev, { id: createClientId(), key: preset.key, value: preset.value }];
    });
  }

  function moveMetadataRow(pairId: string, direction: "up" | "down") {
    setMetadataPairs((prev) => {
      const idx = prev.findIndex((row) => row.id === pairId);
      if (idx < 0) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
  }

  function addAllMetadataPresets() {
    setMetadataPairs((prev) => {
      const next = [...prev];
      for (const preset of metadataPresetSuggestions) {
        const keyLc = preset.key.trim().toLowerCase();
        const existingIdx = next.findIndex((row) => row.key.trim().toLowerCase() === keyLc);
        if (existingIdx >= 0) {
          if (next[existingIdx].value.trim().length === 0) {
            next[existingIdx] = { ...next[existingIdx], value: preset.value };
          }
          continue;
        }
        next.push({ id: createClientId(), key: preset.key, value: preset.value });
      }
      return next;
    });
  }

  function applyUploadDraft(draft: UploadDraft) {
    if (!formRef.current) return;
    const form = formRef.current;

    const setFieldValue = (name: string, value: string) => {
      const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (field) field.value = value;
    };

    setPublicationMode(draft.publicationMode);
    setContentOriginValue(draft.contentOrigin);
    setEnabledOptionalFields(draft.enabledOptionalFields);
    setShowOptionalFields(draft.enabledOptionalFields.length > 0 || draft.metadataPairs.length > 0);
    setOptionalFieldToAdd("");
    setMetadataPairs(draft.metadataPairs.map((pair) => ({ ...pair, id: createClientId() })));

    setFieldValue("title", draft.title);
    setFieldValue("description", draft.description);
    setFieldValue("category", draft.category);
    setFieldValue("contentOrigin", draft.contentOrigin);

    requestAnimationFrame(() => {
      setFieldValue("alternateName", draft.optionalValues.alternateName);
      setFieldValue("author", draft.optionalValues.author);
      setFieldValue("artist", draft.optionalValues.artist);
      setFieldValue("tags", draft.optionalValues.tags);
      const titleField = form.elements.namedItem("title") as HTMLInputElement | null;
      titleField?.focus();
    });
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
            <select
              id="contentOrigin"
              name="contentOrigin"
              value={contentOriginValue}
              onChange={(e) => setContentOriginValue(e.target.value as ContentOrigin)}
              required
            >
              <option value="manga">{t.contentOriginManga}</option>
              <option value="manhwa">{t.contentOriginManhwa}</option>
              <option value="manhua">{t.contentOriginManhua}</option>
            </select>

            <input name="uploadDate" type="hidden" value={today} readOnly />
            <button
              type="button"
              className="chip-btn optional-fields-toggle"
              onClick={() => setShowOptionalFields((prev) => !prev)}
            >
              {showOptionalFields ? ux.optionalToggleHide : ux.optionalToggleShow}
            </button>
            {showOptionalFields && (
              <div className="optional-fields-panel">
                <p className="meta-line">{ux.optionalLead}</p>
                <div className="optional-fields-actions">
                  <label htmlFor="optionalFieldSelector">{ux.addFieldLabel}</label>
                  <select
                    id="optionalFieldSelector"
                    value={optionalFieldToAdd}
                    onChange={(e) => setOptionalFieldToAdd(e.target.value as OptionalFieldKey | "")}
                  >
                    <option value="" disabled>
                      {ux.addFieldLabel}
                    </option>
                    {optionalFieldOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      const selected = optionalFieldToAdd;
                      if (!selected) return;
                      if (!enabledOptionalFields.includes(selected)) {
                        setEnabledOptionalFields((prev) => [...prev, selected]);
                      }
                      setOptionalFieldToAdd("");
                    }}
                    disabled={!optionalFieldToAdd || optionalFieldOptions.length === 0}
                  >
                    {ux.addFieldBtn}
                  </button>
                </div>

                {enabledOptionalFields.includes("alternateName") && (
                  <div className="optional-field-item">
                    <label htmlFor="alternateName">{t.fieldAlternateName}</label>
                    <input id="alternateName" name="alternateName" placeholder={t.placeholderAlternateName} />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setEnabledOptionalFields((prev) => prev.filter((f) => f !== "alternateName"))}
                    >
                      {ux.removeFieldBtn}
                    </button>
                  </div>
                )}

                {enabledOptionalFields.includes("author") && (
                  <div className="optional-field-item">
                    <label htmlFor="author">{t.fieldAuthor}</label>
                    <input id="author" name="author" placeholder={t.placeholderAuthor} />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setEnabledOptionalFields((prev) => prev.filter((f) => f !== "author"))}
                    >
                      {ux.removeFieldBtn}
                    </button>
                  </div>
                )}

                {enabledOptionalFields.includes("artist") && (
                  <div className="optional-field-item">
                    <label htmlFor="artist">{t.fieldArtist}</label>
                    <input id="artist" name="artist" placeholder={t.placeholderArtist} />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setEnabledOptionalFields((prev) => prev.filter((f) => f !== "artist"))}
                    >
                      {ux.removeFieldBtn}
                    </button>
                  </div>
                )}

                {enabledOptionalFields.includes("tags") && (
                  <div className="optional-field-item">
                    <label htmlFor="tags">{t.fieldTags}</label>
                    <input id="tags" name="tags" placeholder={t.placeholderTags} />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setEnabledOptionalFields((prev) => prev.filter((f) => f !== "tags"))}
                    >
                      {ux.removeFieldBtn}
                    </button>
                  </div>
                )}

                <div className="optional-field-item optional-metadata-builder">
                  <label>{ux.extraMetaLead}</label>
                  <div className="metadata-preset-panel">
                    <p className="meta-line">{ux.extraMetaPresetLead}</p>
                    <div className="metadata-preset-actions">
                      {metadataPresetSuggestions.map((preset) => (
                        <button
                          key={`${preset.key}:${preset.value}`}
                          type="button"
                          className="chip-btn metadata-preset-btn"
                          onClick={() => addOrPatchMetadataPreset(preset)}
                        >
                          {preset.key}: {preset.value}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="chip-btn metadata-preset-all-btn"
                        onClick={addAllMetadataPresets}
                      >
                        {ux.extraMetaPresetAll}
                      </button>
                    </div>
                  </div>
                  <div className="metadata-pairs-list">
                    {metadataPairs.map((pair, idx) => (
                      <div key={pair.id} className="metadata-pair-row">
                        <input
                          placeholder={ux.extraMetaKeyPlaceholder}
                          value={pair.key}
                          onChange={(e) =>
                            setMetadataPairs((prev) =>
                              prev.map((row) => (row.id === pair.id ? { ...row, key: e.target.value } : row))
                            )
                          }
                        />
                        <input
                          placeholder={ux.extraMetaValuePlaceholder}
                          value={pair.value}
                          onChange={(e) =>
                            setMetadataPairs((prev) =>
                              prev.map((row) => (row.id === pair.id ? { ...row, value: e.target.value } : row))
                            )
                          }
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => setMetadataPairs((prev) => prev.filter((row) => row.id !== pair.id))}
                        >
                          {ux.extraMetaRemove}
                        </button>
                        <div className="metadata-pair-order">
                          <button
                            type="button"
                            className="ghost-btn metadata-order-btn"
                            onClick={() => moveMetadataRow(pair.id, "up")}
                            disabled={idx === 0}
                          >
                            {ux.extraMetaMoveUp}
                          </button>
                          <button
                            type="button"
                            className="ghost-btn metadata-order-btn"
                            onClick={() => moveMetadataRow(pair.id, "down")}
                            disabled={idx === metadataPairs.length - 1}
                          >
                            {ux.extraMetaMoveDown}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() =>
                      setMetadataPairs((prev) => [...prev, { id: createClientId(), key: "", value: "" }])
                    }
                  >
                    {ux.extraMetaAddRow}
                  </button>
                </div>
              </div>
            )}
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
              setLastUploadDraft(null);
              setProgress(0);
              setCanViewUploadedItem(false);
              setContentOriginValue("manga");
              setShowOptionalFields(false);
              setEnabledOptionalFields([]);
              setMetadataPairs([]);
              setOptionalFieldToAdd("");
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
            <div className="upload-progress-actions">
              <button
                type="button"
                className="ghost-btn upload-progress-cancel-btn"
                onClick={() => {
                  retryAfterAbortRef.current = false;
                  uploadAbortRef.current?.abort();
                }}
              >
                {ux.uploadCancelBtn}
              </button>
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
      {showUploadStalledModal && (
        <div className="success-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upload-stalled-title">
          <div className="success-modal-card upload-stalled-modal">
            <h3 id="upload-stalled-title">{ux.uploadStalledTitle}</h3>
            <p>{ux.uploadStalledBody}</p>
            <div className="success-modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  retryAfterAbortRef.current = false;
                  setShowUploadStalledModal(false);
                  uploadAbortRef.current?.abort();
                }}
              >
                {ux.uploadStalledCancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  retryAfterAbortRef.current = true;
                  setShowUploadStalledModal(false);
                  uploadAbortRef.current?.abort();
                }}
              >
                {ux.uploadStalledRetry}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSuccessModal && (
        <div className="success-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upload-success-title">
          <div className="success-modal-card">
            <h3 id="upload-success-title">{t.uploadSuccessTitle}</h3>
            <p>{canViewUploadedItem ? t.uploadSuccessBody : t.uploadQueued}</p>
            <div className="success-modal-actions">
              {canViewUploadedItem && (
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("upload_success_view_click", { location: "upload_success_modal" });
                    setShowSuccessModal(false);
                    navigate(lastUploadedSlug ? buildPublicFilePath(lastUploadedSlug) : "/dashboard/files");
                  }}
                >
                  {t.uploadSuccessView}
                </button>
              )}
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  if (!lastUploadDraft) return;
                  trackEvent("upload_success_same_series_click", { location: "upload_success_modal" });
                  setShowSuccessModal(false);
                  setStatus("");
                  setCanViewUploadedItem(false);
                  applyUploadDraft(lastUploadDraft);
                }}
                disabled={!lastUploadDraft}
              >
                {ux.uploadSuccessMoreSameSeries}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  trackEvent("upload_success_more_click", { location: "upload_success_modal" });
                  setShowSuccessModal(false);
                  setStatus("");
                  setCanViewUploadedItem(false);
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
