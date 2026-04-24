import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173,https://repoman.comunidaddelmanga.com"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_FOLDER: z.string().default("repoman/covers"),
  STORAGE_ROOT: z.string().default("./uploads"),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(200 * 1024 * 1024),
  MAX_COVER_SIZE_BYTES: z.coerce.number().default(5 * 1024 * 1024),
  COVER_TARGET_MAX_WIDTH: z.coerce.number().default(400),
  COVER_TARGET_MAX_BYTES: z.coerce.number().default(250 * 1024)
});

export const env = envSchema.parse(process.env);
