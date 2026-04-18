"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import {
  FILE_INPUT_ACCEPT,
  reasonMessage,
  validateClientFile,
  type ClientValidationReason,
} from "@/app/_lib/videos/clientValidation";
import { useUploadQueue } from "./useUploadQueue";

type Rejection = { filename: string; reason: ClientValidationReason };

export function UploadDropZone() {
  const { enqueue } = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  const [rejection, setRejection] = useState<Rejection | null>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted: File[] = [];
      const arr = Array.from(files);
      let firstRejection: Rejection | null = null;
      for (const file of arr) {
        const result = validateClientFile(file);
        if (result.ok) {
          accepted.push(file);
        } else if (!firstRejection) {
          firstRejection = { filename: file.name, reason: result.reason };
        }
      }
      if (firstRejection) {
        setRejection(firstRejection);
      } else {
        setRejection(null);
      }
      if (accepted.length > 0) {
        enqueue(accepted);
      }
    },
    [enqueue],
  );

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop videos here or click to upload"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isOver
            ? "border-accent bg-accent/5"
            : "border-border bg-transparent hover:border-accent/60"
        }`}
      >
        <p className="text-sm font-medium text-foreground">
          Drag a video here or click to pick a file
        </p>
        <p className="text-xs text-muted">MP4, MOV, MKV, WEBM, AVI — up to 2GB</p>
        <button
          type="button"
          className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Upload video
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {rejection && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {reasonMessage(rejection.reason)}
        </div>
      )}
    </div>
  );
}
