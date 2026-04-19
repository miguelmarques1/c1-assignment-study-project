import { z } from "zod";

export const LIBRARY_VIEWS = ["grid", "list"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

export const LIBRARY_SORTS = ["recent", "oldest", "title_asc"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const DEFAULT_LIBRARY_VIEW: LibraryView = "grid";
export const DEFAULT_LIBRARY_SORT: LibrarySort = "recent";

const idSchema = z
  .string({ required_error: "LIB_INVALID_INPUT", invalid_type_error: "LIB_INVALID_INPUT" })
  .min(1, "LIB_INVALID_INPUT");

export const renameSchema = z.object({
  id: idSchema,
  title: z
    .string({ required_error: "LIB_TITLE_EMPTY", invalid_type_error: "LIB_TITLE_EMPTY" })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "LIB_TITLE_EMPTY")
        .max(200, "LIB_TITLE_TOO_LONG"),
    ),
});

export const editDescriptionSchema = z.object({
  id: idSchema,
  description: z
    .string({ required_error: "LIB_INVALID_INPUT", invalid_type_error: "LIB_INVALID_INPUT" })
    .transform((value) => value.replace(/\s+$/u, ""))
    .pipe(z.string().max(2000, "LIB_DESCRIPTION_TOO_LONG")),
});

export const deleteSchema = z.object({ id: idSchema });

export const retrySchema = z.object({ id: idSchema });

export const setPreferencesSchema = z
  .object({
    view: z
      .enum(LIBRARY_VIEWS, { errorMap: () => ({ message: "LIB_INVALID_VIEW" }) })
      .optional(),
    sort: z
      .enum(LIBRARY_SORTS, { errorMap: () => ({ message: "LIB_INVALID_SORT" }) })
      .optional(),
  })
  .refine((value) => value.view !== undefined || value.sort !== undefined, {
    message: "LIB_INVALID_PREFERENCES",
  });

export type RenameInput = z.infer<typeof renameSchema>;
export type EditDescriptionInput = z.infer<typeof editDescriptionSchema>;
export type DeleteInput = z.infer<typeof deleteSchema>;
export type RetryInput = z.infer<typeof retrySchema>;
export type SetPreferencesInput = z.infer<typeof setPreferencesSchema>;

export function isLibraryView(value: unknown): value is LibraryView {
  return typeof value === "string" && (LIBRARY_VIEWS as readonly string[]).includes(value);
}

export function isLibrarySort(value: unknown): value is LibrarySort {
  return typeof value === "string" && (LIBRARY_SORTS as readonly string[]).includes(value);
}
