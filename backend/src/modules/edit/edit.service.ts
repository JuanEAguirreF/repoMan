import { FastifyInstance } from "fastify";
import { z } from "zod";
import { insertAuditLog } from "../audit/audit.repository.js";
import { fetchFileById } from "../files/files.service.js";
import { updateFileMetadata } from "../files/files.repository.js";
import {
  createEditRequest,
  getEditRequestById,
  getOpenEditRequestForFile,
  listEditRequests,
  reviewEditRequest
} from "./edit.repository.js";

const editPatchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(3000).optional(),
    category: z.string().min(1).max(120).optional(),
    content_origin: z.enum(["manga", "manhwa", "manhua"]).optional(),
    tags: z.array(z.string().min(1).max(80)).max(50).optional(),
    extra_metadata: z.record(z.unknown()).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one editable field is required" });

export async function requestFileEdit(
  fastify: FastifyInstance,
  params: {
    fileId: string;
    requesterUserId: string;
    requesterRole: "uploader" | "super_admin";
    reason?: string;
    proposedPatch: Record<string, unknown>;
  }
) {
  const file = await fetchFileById(fastify, params.fileId);
  if (!file) throw new Error("File not found");
  if (params.requesterRole !== "super_admin" && file.owner_user_id !== params.requesterUserId) {
    throw new Error("You can only request edits for your own files");
  }

  const parsedPatch = editPatchSchema.parse(params.proposedPatch);
  const existing = await getOpenEditRequestForFile(fastify, params.fileId);
  if (existing) throw new Error("A pending edit request already exists for this file");

  const request = await createEditRequest(fastify, {
    fileId: params.fileId,
    requestedByUserId: params.requesterUserId,
    reason: params.reason,
    proposedPatch: parsedPatch
  });

  await insertAuditLog(fastify, {
    actorUserId: params.requesterUserId,
    action: "edit.requested",
    targetType: "file",
    targetId: params.fileId,
    metadata: { requestId: request.id, fields: Object.keys(parsedPatch) }
  });

  return request;
}

export async function getPendingEditRequests(fastify: FastifyInstance) {
  return listEditRequests(fastify, "pending");
}

export async function approveEditRequest(
  fastify: FastifyInstance,
  params: { requestId: string; reviewerUserId: string }
) {
  const req = await getEditRequestById(fastify, params.requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is already resolved");

  const patch = editPatchSchema.parse(req.proposed_patch ?? {});
  await updateFileMetadata(fastify, req.file_id, patch);

  const reviewed = await reviewEditRequest(fastify, {
    requestId: params.requestId,
    reviewerUserId: params.reviewerUserId,
    status: "approved"
  });
  if (!reviewed) throw new Error("Failed to approve edit request");

  await insertAuditLog(fastify, {
    actorUserId: params.reviewerUserId,
    action: "edit.approved",
    targetType: "edit_request",
    targetId: params.requestId,
    metadata: { fileId: req.file_id, fields: Object.keys(patch) }
  });

  return reviewed;
}

export async function rejectEditRequest(
  fastify: FastifyInstance,
  params: { requestId: string; reviewerUserId: string }
) {
  const req = await getEditRequestById(fastify, params.requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is already resolved");

  const reviewed = await reviewEditRequest(fastify, {
    requestId: params.requestId,
    reviewerUserId: params.reviewerUserId,
    status: "rejected"
  });
  if (!reviewed) throw new Error("Failed to reject edit request");

  await insertAuditLog(fastify, {
    actorUserId: params.reviewerUserId,
    action: "edit.rejected",
    targetType: "edit_request",
    targetId: params.requestId,
    metadata: { fileId: req.file_id }
  });

  return reviewed;
}
