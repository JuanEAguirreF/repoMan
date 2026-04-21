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
  description: string;
  category: string;
  tags: string[];
  mime_type: string;
  file_size_bytes: number;
  has_backup: boolean;
  cover_image_path: string;
  created_at: string;
  published_at: string;
  status: "active" | "pending_deletion" | "deleted";
};
