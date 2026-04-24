import { FastifyInstance } from "fastify";
import { insertAuditLog } from "../audit/audit.repository.js";
import { fetchFileById, markDeleted, markPendingDeletion, restoreActive } from "../files/files.service.js";
import {
  createDeletionRequest,
  getDeletionRequestById,
  getOpenDeletionRequestForFile,
  listDeletionRequests,
  reviewDeletionRequest
} from "./deletion.repository.js";

export async function requestFileDeletion(
  fastify: FastifyInstance,
  params: { fileId: string; requesterUserId: string; reason?: string }
) {
  const file = await fetchFileById(fastify, params.fileId);
  if (!file) throw new Error("File not found");
  if (file.owner_user_id !== params.requesterUserId) throw new Error("You can only request deletion for your own files");
  if (file.status === "deleted") throw new Error("File is already deleted");
  if (file.status !== "active") throw new Error("Deletion can only be requested for active published files");

  const existing = await getOpenDeletionRequestForFile(fastify, params.fileId);
  if (existing) throw new Error("A pending deletion request already exists");

  const req = await createDeletionRequest(fastify, {
    fileId: params.fileId,
    requestedByUserId: params.requesterUserId,
    reason: params.reason
  });
  await markPendingDeletion(fastify, params.fileId);

  await insertAuditLog(fastify, {
    actorUserId: params.requesterUserId,
    action: "deletion.requested",
    targetType: "file",
    targetId: params.fileId,
    metadata: { requestId: req.id }
  });

  return req;
}

export async function getPendingDeletionRequests(fastify: FastifyInstance) {
  return listDeletionRequests(fastify, "pending");
}

export async function approveDeletionRequest(
  fastify: FastifyInstance,
  params: { requestId: string; reviewerUserId: string }
) {
  const req = await getDeletionRequestById(fastify, params.requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is already resolved");

  const reviewed = await reviewDeletionRequest(fastify, {
    requestId: params.requestId,
    reviewerUserId: params.reviewerUserId,
    status: "approved"
  });
  if (!reviewed) throw new Error("Failed to approve request");

  await markDeleted(fastify, req.file_id);

  await insertAuditLog(fastify, {
    actorUserId: params.reviewerUserId,
    action: "deletion.approved",
    targetType: "deletion_request",
    targetId: params.requestId,
    metadata: { fileId: req.file_id }
  });
  return reviewed;
}

export async function rejectDeletionRequest(
  fastify: FastifyInstance,
  params: { requestId: string; reviewerUserId: string }
) {
  const req = await getDeletionRequestById(fastify, params.requestId);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request is already resolved");

  const reviewed = await reviewDeletionRequest(fastify, {
    requestId: params.requestId,
    reviewerUserId: params.reviewerUserId,
    status: "rejected"
  });
  if (!reviewed) throw new Error("Failed to reject request");

  await restoreActive(fastify, req.file_id);

  await insertAuditLog(fastify, {
    actorUserId: params.reviewerUserId,
    action: "deletion.rejected",
    targetType: "deletion_request",
    targetId: params.requestId,
    metadata: { fileId: req.file_id }
  });
  return reviewed;
}
