import { describe, expect, it } from "vitest";
import {
  deleteSchema,
  editDescriptionSchema,
  renameSchema,
  retrySchema,
  setPreferencesSchema,
} from "../libraryValidation";

describe("libraryValidation - rename", () => {
  it("rename_rejects_empty_string_with_LIB_TITLE_EMPTY", () => {
    const result = renameSchema.safeParse({ id: "abc", title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("LIB_TITLE_EMPTY");
    }
  });

  it("rename_rejects_whitespace_only_with_LIB_TITLE_EMPTY", () => {
    const result = renameSchema.safeParse({ id: "abc", title: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("LIB_TITLE_EMPTY");
    }
  });

  it("rename_trims_and_accepts_200_char_title", () => {
    const title = "x".repeat(200);
    const padded = `   ${title}   `;
    const result = renameSchema.safeParse({ id: "abc", title: padded });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(title);
    }
  });

  it("rename_rejects_201_char_title_with_LIB_TITLE_TOO_LONG", () => {
    const result = renameSchema.safeParse({
      id: "abc",
      title: "x".repeat(201),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("LIB_TITLE_TOO_LONG");
    }
  });
});

describe("libraryValidation - description", () => {
  it("description_accepts_empty_string", () => {
    const result = editDescriptionSchema.safeParse({
      id: "abc",
      description: "",
    });
    expect(result.success).toBe(true);
  });

  it("description_rejects_2001_char_with_LIB_DESCRIPTION_TOO_LONG", () => {
    const result = editDescriptionSchema.safeParse({
      id: "abc",
      description: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("LIB_DESCRIPTION_TOO_LONG");
    }
  });

  it("description_strips_trailing_whitespace_only", () => {
    const result = editDescriptionSchema.safeParse({
      id: "abc",
      description: "hello world   \n",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("hello world");
    }
  });
});

describe("libraryValidation - delete + retry", () => {
  it("delete_requires_id", () => {
    expect(deleteSchema.safeParse({ id: "ok" }).success).toBe(true);
    expect(deleteSchema.safeParse({}).success).toBe(false);
  });

  it("retry_requires_id", () => {
    expect(retrySchema.safeParse({ id: "ok" }).success).toBe(true);
    expect(retrySchema.safeParse({}).success).toBe(false);
  });
});

describe("libraryValidation - preferences", () => {
  it("preferences_accepts_view_only", () => {
    expect(setPreferencesSchema.safeParse({ view: "list" }).success).toBe(true);
  });

  it("preferences_accepts_sort_only", () => {
    expect(setPreferencesSchema.safeParse({ sort: "title_asc" }).success).toBe(true);
  });

  it("preferences_accepts_both_view_and_sort", () => {
    expect(
      setPreferencesSchema.safeParse({ view: "grid", sort: "oldest" }).success,
    ).toBe(true);
  });

  it("preferences_rejects_unknown_view", () => {
    const result = setPreferencesSchema.safeParse({ view: "cards" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("LIB_INVALID_VIEW");
    }
  });

  it("preferences_rejects_unknown_sort", () => {
    const result = setPreferencesSchema.safeParse({ sort: "random" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("LIB_INVALID_SORT");
    }
  });

  it("preferences_rejects_empty_payload", () => {
    const result = setPreferencesSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("LIB_INVALID_PREFERENCES");
    }
  });
});
