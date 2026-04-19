export const LIBRARY_ERROR_CODES = [
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
] as const;

export type LibraryErrorCode = (typeof LIBRARY_ERROR_CODES)[number];

export const LIBRARY_ERROR_MESSAGES: Record<LibraryErrorCode, string> = {
  LIB_FORBIDDEN: "You must be logged in",
  LIB_NOT_FOUND: "Video not found",
  LIB_ALREADY_DELETED: "This video has already been deleted",
  LIB_TITLE_EMPTY: "Title cannot be empty",
  LIB_TITLE_TOO_LONG: "Title must be at most 200 characters",
  LIB_DESCRIPTION_TOO_LONG: "Description must be at most 2000 characters",
  LIB_INVALID_STATUS_FOR_RETRY: "Only failed videos can be retried",
  LIB_INVALID_VIEW: "Unknown view mode",
  LIB_INVALID_SORT: "Unknown sort option",
  LIB_INVALID_PREFERENCES: "At least one preference must be set",
  LIB_INVALID_INPUT: "Invalid input",
};

export function libraryErrorMessage(code: LibraryErrorCode): string {
  return LIBRARY_ERROR_MESSAGES[code];
}
