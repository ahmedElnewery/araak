"use client";

import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

type Props = {
  id: string;
  /** Form field name of the file input. */
  name: string;
  accept: string;
  /** Alt text for previews. */
  alt: string;
  /** The logo already saved. With `removeName` it can be cleared with the X. */
  currentSrc?: string | null;
  /** When set, clearing the current logo submits `<removeName>=on`. */
  removeName?: string;
  labels: { prompt: string; remove: string };
  /** Client-side validation messages; the server still re-validates everything. */
  errors: { type: string; tooLarge: string; corrupt: string; dimensions: string };
  maxBytes?: number;
  minSide?: number;
  maxSide?: number;
  describedBy?: string;
  invalid?: boolean;
  className?: string;
};

/** Custom logo picker: drop zone, live preview of the chosen file and an X that discards it (or the current logo). */
export function LogoUpload({ id, name, accept, alt, currentSrc, removeName, labels, errors, maxBytes = 1024 * 1024, minSide = 64, maxSide = 1024, describedBy, invalid, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [clientError, setClientError] = useState<string | null>(null);

  const reject = (message: string) => {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setClientError(message);
  };

  // data: URL, not blob:, because the app CSP only allows `img-src 'self' data:`
  const select = (file: File | undefined) => {
    setPreview(null);
    setClientError(null);
    if (!file) return;
    const types = accept.split(",").map((t) => t.trim());
    if (!types.includes(file.type)) return reject(errors.type);
    if (file.size > maxBytes) return reject(errors.tooLarge);
    const reader = new FileReader();
    reader.onerror = () => reject(errors.corrupt);
    reader.onload = () => {
      const url = reader.result;
      if (typeof url !== "string") return reject(errors.corrupt);
      const img = new Image();
      img.onerror = () => reject(errors.corrupt);
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        if (w < minSide || h < minSide || w > maxSide || h > maxSide) return reject(errors.dimensions);
        setRemoved(false);
        setPreview(url);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const input = inputRef.current;
    const file = e.dataTransfer.files[0];
    if (!input || !file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    select(file);
  };
  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    if (preview) setPreview(null);
    else if (currentSrc && removeName) setRemoved(true);
  };

  const shown = preview ?? (removed ? null : (currentSrc ?? null));
  return (
    <div className={cn("relative", className)}>
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-subtle transition-colors hover:bg-accent/40 has-[:focus-visible]:border-ring",
          dragging && "border-primary bg-accent/40",
          (invalid || clientError) && "border-destructive",
        )}
      >
        {shown ? (
          <img src={shown} alt={alt} className="max-h-24 max-w-full rounded-md object-contain" />
        ) : (
          <ImagePlus aria-hidden="true" className="size-7" />
        )}
        <span>{labels.prompt}</span>
        <input
          ref={inputRef} id={id} name={name} type="file" accept={accept} className="sr-only"
          aria-describedby={describedBy} aria-invalid={invalid || clientError ? true : undefined}
          onChange={(e) => select(e.target.files?.[0])}
        />
      </label>
      {clientError ? <p role="alert" className="mt-2 text-sm text-destructive">{clientError}</p> : null}
      {shown ? (
        <button
          type="button" onClick={clear} aria-label={labels.remove} title={labels.remove}
          className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-xs hover:bg-destructive hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      {removeName && removed ? <input type="hidden" name={removeName} value="on" /> : null}
    </div>
  );
}
