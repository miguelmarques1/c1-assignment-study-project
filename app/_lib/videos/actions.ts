"use server";

import { revalidatePath } from "next/cache";
import type { ZodSchema } from "zod";
import { getSession } from "@/app/_lib/session";
import {
  type LibraryErrorCode,
  libraryErrorMessage,
} from "./libraryErrors";
import {
  deleteSchema,
  editDescriptionSchema,
  renameSchema,
  retrySchema,
  setPreferencesSchema,
} from "./libraryValidation";
import {
  deleteOwnedVideo,
  readLibraryPreferences,
  resetToValidating,
  updateDescription,
  updateLibraryPreferences,
  updateTitle,
} from "./libraryRepository";
import { removeVideoDirSafely } from "./storage";
import { toVideoListItemDTO, type VideoListItemDTO } from "./library";

type FieldErrors = Record<string, string[]>;

export type ActionState<T = undefined> = {
  ok: boolean;
  code?: LibraryErrorCode;
  message?: string;
  fieldErrors?: FieldErrors;
  item?: VideoListItemDTO;
  filesystemWarning?: string;
  data?: T;
};

const FORBIDDEN: ActionState = {
  ok: false,
  code: "LIB_FORBIDDEN",
  message: libraryErrorMessage("LIB_FORBIDDEN"),
};

function failure(code: LibraryErrorCode): ActionState {
  return { ok: false, code, message: libraryErrorMessage(code) };
}

const KNOWN_CODES = new Set<string>([
  "LIB_FORBIDDEN",
  "LIB_NOT_FOUND",
  "LIB_ALREADY_DELETED",
  "LIB_TITLE_EMPTY",
  "LIB_TITLE_TOO_LONG",
  "LIB_DESCRIPTION_TOO_LONG",
  "LIB_INVALID_STATUS_FOR_RETRY",
  "LIB_INVALID_VIEW",
  "LIB_INVALID_SORT",
  "LIB_INVALID_PREFERENCES",
  "LIB_INVALID_INPUT",
]);

function fieldErrorsFromZod<T>(schema: ZodSchema<T>, input: unknown):
  | { ok: true; data: T }
  | { ok: false; code: LibraryErrorCode; fieldErrors: FieldErrors } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: FieldErrors = {};
  let primaryCode: LibraryErrorCode = "LIB_INVALID_INPUT";
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    const code = KNOWN_CODES.has(issue.message)
      ? (issue.message as LibraryErrorCode)
      : "LIB_INVALID_INPUT";
    primaryCode = code;
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(libraryErrorMessage(code));
  }
  return { ok: false, code: primaryCode, fieldErrors };
}

function buildItemFromRow(row: Parameters<typeof toVideoListItemDTO>[0]) {
  return toVideoListItemDTO(row);
}

export async function renameVideo(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return FORBIDDEN;

  const parsed = fieldErrorsFromZod(renameSchema, {
    id: formData.get("id"),
    title: formData.get("title"),
  });
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: libraryErrorMessage(parsed.code),
      fieldErrors: parsed.fieldErrors,
    };
  }

  const updated = await updateTitle(parsed.data.id, session.user.id, parsed.data.title);
  if (!updated) return failure("LIB_NOT_FOUND");

  revalidatePath("/app");
  return { ok: true, item: buildItemFromRow(updated) };
}

export async function editVideoDescription(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return FORBIDDEN;

  const parsed = fieldErrorsFromZod(editDescriptionSchema, {
    id: formData.get("id"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: libraryErrorMessage(parsed.code),
      fieldErrors: parsed.fieldErrors,
    };
  }

  const updated = await updateDescription(
    parsed.data.id,
    session.user.id,
    parsed.data.description,
  );
  if (!updated) return failure("LIB_NOT_FOUND");

  revalidatePath("/app");
  return { ok: true, item: buildItemFromRow(updated) };
}

export async function deleteVideo(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return FORBIDDEN;

  const parsed = fieldErrorsFromZod(deleteSchema, { id: formData.get("id") });
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: libraryErrorMessage(parsed.code),
      fieldErrors: parsed.fieldErrors,
    };
  }

  const result = await deleteOwnedVideo(parsed.data.id, session.user.id);
  if (!result.found) return failure("LIB_ALREADY_DELETED");

  const fs = await removeVideoDirSafely(session.user.id, parsed.data.id);
  revalidatePath("/app");
  if (!fs.ok) {
    console.warn(
      `[F04] removeVideoDirSafely failed for ${session.user.id}/${parsed.data.id}: ${fs.reason}`,
    );
    return { ok: true, filesystemWarning: fs.reason };
  }
  return { ok: true };
}

export async function requestRetry(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return FORBIDDEN;

  const parsed = fieldErrorsFromZod(retrySchema, { id: formData.get("id") });
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: libraryErrorMessage(parsed.code),
      fieldErrors: parsed.fieldErrors,
    };
  }

  const updated = await resetToValidating(parsed.data.id, session.user.id);
  if (!updated) {
    const stillExists = await checkVideoExistsForUser(parsed.data.id, session.user.id);
    if (!stillExists) return failure("LIB_NOT_FOUND");
    return failure("LIB_INVALID_STATUS_FOR_RETRY");
  }

  revalidatePath("/app");
  return { ok: true, item: buildItemFromRow(updated) };
}

async function checkVideoExistsForUser(id: string, userId: string): Promise<boolean> {
  const { findVideoForUser } = await import("./repository");
  const row = await findVideoForUser(id, userId);
  return row !== null;
}

export async function submitLibraryPreferences(formData: FormData): Promise<void> {
  await setLibraryPreferences(undefined, formData);
}

export async function setLibraryPreferences(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return FORBIDDEN;

  const rawView = formData.get("view");
  const rawSort = formData.get("sort");

  const candidate: { view?: unknown; sort?: unknown } = {};
  if (rawView !== null && rawView !== "") candidate.view = rawView;
  if (rawSort !== null && rawSort !== "") candidate.sort = rawSort;

  const parsed = fieldErrorsFromZod(setPreferencesSchema, candidate);
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: libraryErrorMessage(parsed.code),
      fieldErrors: parsed.fieldErrors,
    };
  }

  const updated = await updateLibraryPreferences(session.user.id, parsed.data);
  if (!updated) {
    const current = await readLibraryPreferences(session.user.id);
    if (!current) return FORBIDDEN;
  }

  revalidatePath("/app");
  return { ok: true };
}
