import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatFileSize,
  formatUploadDate,
} from "../formatting";

describe("formatDuration", () => {
  it("format_duration_null_returns_em_dash", () => {
    expect(formatDuration(null)).toBe("--:--");
  });

  it("format_duration_under_an_hour_returns_mmss", () => {
    expect(formatDuration(125.7)).toBe("02:05");
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(59.9)).toBe("00:59");
  });

  it("format_duration_over_an_hour_returns_hhmmss", () => {
    expect(formatDuration(3725)).toBe("01:02:05");
    expect(formatDuration(7200)).toBe("02:00:00");
  });

  it("format_duration_returns_em_dash_for_negative_or_NaN", () => {
    expect(formatDuration(-1)).toBe("--:--");
    expect(formatDuration(Number.NaN)).toBe("--:--");
  });
});

describe("formatFileSize", () => {
  it("format_file_size_bytes_to_kb_to_mb_to_gb", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(900)).toBe("900 B");
    expect(formatFileSize(2048)).toBe("2.00 KB");
    expect(formatFileSize(15 * 1024)).toBe("15.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });

  it("format_file_size_handles_negative_or_NaN_as_zero", () => {
    expect(formatFileSize(-10)).toBe("0 B");
    expect(formatFileSize(Number.NaN)).toBe("0 B");
  });
});

describe("formatUploadDate", () => {
  const now = new Date(Date.UTC(2026, 3, 19, 12, 0, 0));

  it("format_upload_date_today_uses_today_label", () => {
    expect(formatUploadDate(now, now)).toBe("Today");
  });

  it("format_upload_date_yesterday_uses_yesterday_label", () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(formatUploadDate(yesterday, now)).toBe("Yesterday");
  });

  it("format_upload_date_recent_uses_relative", () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(formatUploadDate(twoDaysAgo, now)).toBe("2 days ago");
  });

  it("format_upload_date_old_uses_iso", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(formatUploadDate(thirtyDaysAgo, now)).toBe("2026-03-20");
  });

  it("format_upload_date_future_uses_iso", () => {
    const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(formatUploadDate(future, now)).toBe("2026-04-24");
  });
});
