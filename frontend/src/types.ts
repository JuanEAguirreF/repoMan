export type AppRole = "super_admin" | "uploader";

export type SessionUser = {
  profileId: string;
  authUserId: string;
  role: AppRole;
  displayName: string;
};

export type CatalogFile = {
  id: string;
  title: string;
  alternate_name?: string | null;
  slug: string;
  description: string;
  category: string;
  content_origin: "manga" | "manhwa" | "manhua";
  tags: string[];
  mime_type: string;
  file_size_bytes: number;
  has_backup: boolean;
  cover_image_path: string;
  created_at: string;
  published_at: string;
  status: "active" | "pending_review" | "rejected_review" | "pending_deletion" | "deleted";
};
