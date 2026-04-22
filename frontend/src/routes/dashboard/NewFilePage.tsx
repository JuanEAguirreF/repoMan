import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPostFormWithProgress } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";
import { buildPublicFilePath } from "../../lib/slug";

const MAX_MAIN_FILE_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_MAIN_EXTENSIONS = [".pdf", ".zip", ".cbz", ".cbr", ".txt", ".doc", ".docx"];
const ALLOWED_COVER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

type PublicationMode = "preserve" | "request_backup";
type ContentOrigin = "manga" | "manhwa" | "manhua";

export function NewFilePage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement | null>(null);
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mainFileName, setMainFileName] = useState("");
  const [coverFileName, setCoverFileName] = useState("");
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [publicationMode, setPublicationMode] = useState<PublicationMode>("preserve");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastUploadedSlug, setLastUploadedSlug] = useState<string>("");
  const { t, locale } = useI18n();

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
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    const category = String(data.get("category") || "").trim();
    const extraMetadata = String(data.get("extraMetadata") || "").trim();
    const contentOrigin = String(data.get("contentOrigin") || "").trim() as ContentOrigin;
    const mainFile = data.get("file");
    const coverImage = data.get("coverImage");

    if (!title) return setError(t.validationTitleRequired);
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
    if (hasMainFile && mainFile.size > MAX_MAIN_FILE_BYTES) return setError(t.validationMainFileSize);
    if (!ALLOWED_COVER_EXTENSIONS.includes(coverExt)) return setError(t.validationCoverType);
    if (coverImage.size > MAX_COVER_BYTES) return setError(t.validationCoverSize);
    if (extraMetadata) {
      try {
        JSON.parse(extraMetadata);
      } catch {
        return setError(t.validationMetadataJson);
      }
    }

    try {
      setIsSubmitting(true);
      setProgress(0);
      const response = await apiPostFormWithProgress<{ item?: { id?: string; slug?: string } }>("/files", data, (pct) => setProgress(pct));
      setProgress(100);
      setStatus(t.uploadSuccess);
      setLastUploadedSlug(response?.item?.slug ?? "");
      setShowSuccessModal(true);
      form.reset();
      setMainFileName("");
      setCoverFileName("");
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
            <label
              htmlFor="file"
              className={`file-upload-control ${publicationMode === "request_backup" ? "is-disabled" : ""}`}
            >
              <span className="file-upload-icon" aria-hidden="true">⤴</span>
              <span className="file-upload-copy">
                <strong>{mainFileName ? t.filePickerReplace : t.filePickerClickHint}</strong>
                <span>{mainFileName || t.filePickerNoFile}</span>
                <em>{t.filePickerMainDropHint}</em>
              </span>
            </label>
            <input
              ref={mainFileInputRef}
              id="file"
              name="file"
              type="file"
              className="file-input-native"
              disabled={publicationMode === "request_backup"}
              accept=".pdf,.zip,.cbz,.cbr,.txt,.doc,.docx"
              onChange={(e) => setMainFileName(e.currentTarget.files?.[0]?.name ?? "")}
            />
            <small>
              {publicationMode === "preserve"
                ? mainFileName || t.publishModePreserveHint
                : t.publishModeRequestHint}
            </small>

            <label htmlFor="coverImage">{t.fieldCoverImage}</label>
            <label htmlFor="coverImage" className="file-upload-control">
              <span className="file-upload-icon" aria-hidden="true">🖼</span>
              <span className="file-upload-copy">
                <strong>{coverFileName ? t.filePickerReplace : t.filePickerClickHint}</strong>
                <span>{coverFileName || t.filePickerNoFile}</span>
                <em>{t.filePickerCoverDropHint}</em>
              </span>
            </label>
            <input
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
                  setCoverPreviewUrl(URL.createObjectURL(file));
                } else {
                  setCoverPreviewUrl("");
                }
              }}
            />
            <small>{coverFileName || t.hintCoverImage}</small>
            <div style={{ marginTop: "4px", fontSize: "0.85em", color: "var(--color-danger, #e74c3c)", fontWeight: "500" }}>
              ⚠️ {t.hintCoverRules}
            </div>
            {coverPreviewUrl && (
              <img className="cover-preview" src={coverPreviewUrl} alt={t.coverPreviewAlt} />
            )}
          </fieldset>
        </div>

        <div className="upload-actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t.newFilePublishing : t.newFilePublish}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              formRef.current?.reset();
              setMainFileName("");
              setCoverFileName("");
              setStatus("");
              setError("");
              setShowSuccessModal(false);
              setProgress(0);
              if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
              setCoverPreviewUrl("");
            }}
            disabled={isSubmitting}
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
