"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { adminBtn, Field } from "@/components/admin/ui";

const DEFAULT_MAX_FILES = 40;
const DEFAULT_OVER_LIMIT_MESSAGE =
  "Bạn chỉ có thể đăng tối đa 40 ảnh trong một lần. Vui lòng chọn lại.";

type UploadPhotoFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  maxFiles?: number;
  fieldLabel?: string;
  overLimitMessage?: string;
  children: React.ReactNode;
};

function SubmitUploadButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={adminBtn}
    >
      {pending ? "Đang tải lên..." : "Tải lên"}
    </button>
  );
}

export function UploadPhotoForm({
  action,
  maxFiles = DEFAULT_MAX_FILES,
  fieldLabel = `Chọn ảnh (JPG, PNG, WebP; tối đa 8MB mỗi ảnh, ${DEFAULT_MAX_FILES} ảnh mỗi lần)`,
  overLimitMessage = DEFAULT_OVER_LIMIT_MESSAGE,
  children,
}: UploadPhotoFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOverLimit = selectedCount > maxFiles || errorMessage !== null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const count = e.currentTarget.files?.length ?? 0;
    setSelectedCount(count);
    if (count > maxFiles) {
      setErrorMessage(overLimitMessage);
    } else {
      setErrorMessage(null);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const count = fileInputRef.current?.files?.length ?? selectedCount;
    if (count > maxFiles) {
      e.preventDefault();
      setSelectedCount(count);
      setErrorMessage(overLimitMessage);
    }
  }

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <Field label={fieldLabel}>
          <input
            ref={fileInputRef}
            type="file"
            name="images"
            multiple
            required
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            aria-invalid={isOverLimit}
            aria-describedby={isOverLimit ? "admin-photo-limit-alert" : undefined}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white hover:file:bg-navy-deep"
          />
        </Field>
        {isOverLimit && (
          <p
            id="admin-photo-limit-alert"
            role="alert"
            className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-danger/25"
          >
            {errorMessage ?? overLimitMessage}
          </p>
        )}
      </div>
      {children}
      <div className="sm:col-span-2">
        <SubmitUploadButton disabled={isOverLimit} />
      </div>
    </form>
  );
}

