import { FormEvent, useState } from "react";
import {
  APP_TIME_ZONE_LABEL,
  isoToLocalDateTimeInput,
  isLocalDateTimeInputInFuture,
  localDateTimeInputToIso,
} from "../utils/datetime";

export type PostFormValues = {
  content: string;
  link_url?: string;
  image_url?: string | null;
  scheduled_at?: string | null;
};

type FormErrors = {
  content?: string;
  link_url?: string;
  scheduled_at?: string;
  submit?: string;
};

type PostFormProps = {
  initialContent?: string;
  initialLinkUrl?: string;
  initialImageUrl?: string | null;
  initialScheduledAt?: string | null;
  submitLabel?: string;
  successMessage?: string;
  onSubmit: (values: PostFormValues) => Promise<{ successMessage: string }>;
};

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

export default function PostForm({
  initialContent = "",
  initialLinkUrl = "",
  initialImageUrl = null,
  initialScheduledAt = null,
  submitLabel,
  successMessage: externalSuccessMessage,
  onSubmit,
}: PostFormProps) {
  const [content, setContent] = useState(initialContent);
  const [linkUrl, setLinkUrl] = useState(initialLinkUrl);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scheduleLater, setScheduleLater] = useState(Boolean(initialScheduledAt));
  const [scheduledAtLocal, setScheduledAtLocal] = useState(
    initialScheduledAt ? isoToLocalDateTimeInput(initialScheduledAt) : "",
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState(externalSuccessMessage ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const actionLabel =
    submitLabel ?? (scheduleLater ? "Schedule post" : "Save draft");

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!content.trim()) {
      next.content = "Content is required.";
    }
    const trimmedLink = linkUrl.trim();
    if (trimmedLink && !isValidUrl(trimmedLink)) {
      next.link_url = "Enter a valid http or https URL.";
    }
    if (scheduleLater) {
      if (!scheduledAtLocal) {
        next.scheduled_at = "Pick a date and time.";
      } else if (!isLocalDateTimeInputInFuture(scheduledAtLocal)) {
        next.scheduled_at = "Scheduled time must be in the future.";
      }
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      const values: PostFormValues = {
        content: content.trim(),
        scheduled_at: scheduleLater
          ? localDateTimeInputToIso(scheduledAtLocal)
          : null,
      };

      const trimmedLink = linkUrl.trim();
      if (trimmedLink) values.link_url = trimmedLink;

      if (imageFile) {
        values.image_url = await readFileAsDataUrl(imageFile);
      } else if (initialImageUrl) {
        values.image_url = initialImageUrl;
      }

      const result = await onSubmit(values);
      setSuccessMessage(result.successMessage);
      setErrors({});

      if (!initialContent) {
        setContent("");
        setLinkUrl("");
        setImageFile(null);
        setScheduleLater(false);
        setScheduledAtLocal("");
      }
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Failed to save post.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="content">Content</label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          required
        />
        {errors.content && <p className="alert alert-error" role="alert">{errors.content}</p>}
      </div>

      <div className="field">
        <label htmlFor="link_url">Link URL (optional)</label>
        <input
          id="link_url"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://example.com"
        />
        {errors.link_url && <p className="alert alert-error" role="alert">{errors.link_url}</p>}
      </div>

      <div className="field">
        <label htmlFor="image">Image (optional)</label>
        <input
          id="image"
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
        />
        {initialImageUrl && !imageFile && (
          <p className="field-hint">Current image attached.</p>
        )}
      </div>

      <hr className="form-section-divider" />

      <div className="field">
        <p className="form-section-label">Scheduling</p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={scheduleLater}
            onChange={(e) => setScheduleLater(e.target.checked)}
          />
          Schedule for later
        </label>
        {scheduleLater && (
          <div className="schedule-fields">
            <label htmlFor="scheduled_at" className="field-label">
              Scheduled time ({APP_TIME_ZONE_LABEL})
            </label>
            <input
              id="scheduled_at"
              type="datetime-local"
              value={scheduledAtLocal}
              onChange={(e) => setScheduledAtLocal(e.target.value)}
            />
            {errors.scheduled_at && (
              <p className="alert alert-error" role="alert">{errors.scheduled_at}</p>
            )}
          </div>
        )}
      </div>

      {errors.submit && <p className="alert alert-error" role="alert">{errors.submit}</p>}
      {successMessage && <p className="alert alert-success" role="status">{successMessage}</p>}

      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : actionLabel}
        </button>
      </div>
    </form>
  );
}
