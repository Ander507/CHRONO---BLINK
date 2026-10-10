/** Display helpers for game / build statuses, shared by server and client components. */
export const STATUS_TONE: Record<string, "neutral" | "primary" | "electric" | "success" | "warning" | "danger"> = {
  pending_upload: "neutral",
  processing: "electric",
  invalid: "danger",
  ready: "primary",
  in_review: "warning",
  approved: "success",
  rejected: "danger",
  live: "success",
  superseded: "neutral",
  draft: "neutral",
  published: "success",
  unlisted: "warning",
  removed: "danger",
};

export const statusLabel = (s: string) => s.replace(/_/g, " ");
