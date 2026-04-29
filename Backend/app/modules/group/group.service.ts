import { prisma } from "../../client/prisma";
import { env } from "../../config/env";
import ApiException from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { getSocketServer } from "../../socket";
import { SOCKET_EVENTS } from "../../socket/events";
import { emitToUsers } from "../../socket/rooms";
import {
  MemberJoinSource,
  type ConversationMemberRole,
} from "../../generated/prisma/client";
import * as conversationRepository from "../conversation/conversation.repository";
import { rowToDto } from "../message/message.service";
import * as messageRepository from "../message/message.repository";
import { assertGroupPermission } from "./group-permissions";
import * as groupRepository from "./group.repository";
import type {
  CreateGroupBodyDTO,
  CreateInviteBodyDTO,
  UpdateGroupBodyDTO,
} from "./group.types";

const MAX_GROUP_MEMBERS = 500;
const GROUP_NAME_MIN = 1;
const GROUP_NAME_MAX = 100;

function inviteUrl(code: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/join/${encodeURIComponent(code)}`;
}

async function activeMemberIds(conversationId: string): Promise<string[]> {
  return conversationRepository.listMemberUserIds(conversationId);
}

function normalizePolicies(body: UpdateGroupBodyDTO): Record<string, string | number> {
  const changes: Record<string, string | number> = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.description !== undefined) changes.description = body.description ?? "";
  if (body.avatarUrl !== undefined) changes.avatarUrl = body.avatarUrl ?? "";
  if (body.slowModeSeconds !== undefined) changes.slowModeSeconds = body.slowModeSeconds;
  if (body.whoCanAddMembers !== undefined) changes.whoCanAddMembers = body.whoCanAddMembers;
  if (body.whoCanSendMessages !== undefined) {
    changes.whoCanSendMessages = body.whoCanSendMessages;
  }
  if (body.messageHistoryForNewMembers !== undefined) {
    changes.messageHistoryForNewMembers = body.messageHistoryForNewMembers;
  }
  return changes;
}

export async function createGroup(args: {
  creatorId: string;
  body: CreateGroupBodyDTO;
}): Promise<{ conversationId: string }> {
  const { name, description, avatarUrl, memberIds } = args.body;
  const trimmed = name.trim();
  if (trimmed.length < GROUP_NAME_MIN || trimmed.length > GROUP_NAME_MAX) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: `Group name must be ${GROUP_NAME_MIN}–${GROUP_NAME_MAX} characters`,
    });
  }
  const others = [...new Set(memberIds)].filter((id) => id !== args.creatorId);
  if (others.length < 2) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Select at least two other members",
    });
  }
  if (others.length + 1 > MAX_GROUP_MEMBERS) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: `Groups cannot exceed ${MAX_GROUP_MEMBERS} members`,
    });
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...others, args.creatorId] }, deletedAt: null },
    select: { id: true },
  });
  if (users.length !== others.length + 1) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "One or more users are invalid",
    });
  }

  const { conversationId, memberUserIds } =
    await groupRepository.createGroupTransaction({
      creatorId: args.creatorId,
      name: trimmed,
      description: description ?? null,
      avatarUrl: avatarUrl ?? null,
      otherMemberIds: others,
    });

  await conversationRepository.touchConversation(conversationId);

  try {
    const io = getSocketServer();
    const invited = memberUserIds.filter((id) => id !== args.creatorId);
    emitToUsers(io, invited, SOCKET_EVENTS.GROUP_CREATED, {
      conversationId,
      groupName: trimmed,
    });
  } catch {
    /* socket offline */
  }

  return { conversationId };
}

export async function addMembers(args: {
  conversationId: string;
  actorId: string;
  userIds: string[];
}): Promise<{
  messageHistoryForNewMembers: string;
  addedUsers: Array<{
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: ConversationMemberRole;
  }>;
}> {
  await assertGroupPermission(args.conversationId, args.actorId, "add_members");
  const unique = [...new Set(args.userIds)].filter((id) => id !== args.actorId);
  if (unique.length === 0) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "No members to add",
    });
  }
  const current = await prisma.conversationMember.count({
    where: { conversationId: args.conversationId, leftAt: null },
  });
  if (current + unique.length > MAX_GROUP_MEMBERS) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: `Groups cannot exceed ${MAX_GROUP_MEMBERS} members`,
    });
  }
  const msgPolicy = await groupRepository.getMessageHistorySetting(
    args.conversationId,
  );
  await groupRepository.upsertActiveMembers({
    conversationId: args.conversationId,
    userIds: unique,
    joinSource: MemberJoinSource.DIRECT_ADD,
  });
  await conversationRepository.touchConversation(args.conversationId);

  const profiles = await prisma.user.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  });
  const roleByMember = await prisma.conversationMember.findMany({
    where: { conversationId: args.conversationId, userId: { in: unique } },
    select: { userId: true, role: true },
  });
  const roleMap = new Map(roleByMember.map((r) => [r.userId, r.role]));
  const addedUsers = profiles.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    role: roleMap.get(p.id) ?? "MEMBER",
  }));

  try {
    const io = getSocketServer();
    const ids = await activeMemberIds(args.conversationId);
    emitToUsers(io, ids, SOCKET_EVENTS.GROUP_MEMBER_ADDED, {
      conversationId: args.conversationId,
      addedUsers,
      addedVia: "DIRECT_ADD",
    });
  } catch {
    /* */
  }

  return {
    messageHistoryForNewMembers: msgPolicy,
    addedUsers,
  };
}

export async function removeMember(args: {
  conversationId: string;
  actorId: string;
  targetUserId: string;
}): Promise<void> {
  const target = await groupRepository.getGroupForPermissionMeta({
    conversationId: args.conversationId,
    targetUserId: args.targetUserId,
  });
  if (!target) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Member not found",
    });
  }
  await assertGroupPermission(args.conversationId, args.actorId, "remove_member", {
    targetUserId: args.targetUserId,
    targetRole: target.role,
  });
  const notifyIds = await activeMemberIds(args.conversationId);
  await groupRepository.setMemberLeft({
    conversationId: args.conversationId,
    userId: args.targetUserId,
  });
  await conversationRepository.touchConversation(args.conversationId);
  try {
    const io = getSocketServer();
    emitToUsers(io, notifyIds, SOCKET_EVENTS.GROUP_MEMBER_REMOVED, {
      conversationId: args.conversationId,
      removedUserId: args.targetUserId,
      removedBy: args.actorId,
    });
  } catch {
    /* */
  }
}

export async function changeMemberRole(args: {
  conversationId: string;
  actorId: string;
  targetUserId: string;
  role: "ADMIN" | "MEMBER";
}): Promise<void> {
  await assertGroupPermission(
    args.conversationId,
    args.actorId,
    args.role === "ADMIN" ? "promote_member" : "demote_member",
  );
  if (args.targetUserId === args.actorId) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "You cannot change your own role here",
    });
  }
  const gi = await prisma.groupInfo.findUnique({
    where: { conversationId: args.conversationId },
    select: { ownerId: true },
  });
  if (!gi) {
    throw new ApiException({ ...ErrorCodes.NOT_FOUND, errorDescription: "Group not found" });
  }
  if (args.targetUserId === gi.ownerId) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Cannot change the owner's role this way",
    });
  }
  const target = await groupRepository.getGroupForPermissionMeta({
    conversationId: args.conversationId,
    targetUserId: args.targetUserId,
  });
  if (!target) {
    throw new ApiException({ ...ErrorCodes.NOT_FOUND, errorDescription: "Member not found" });
  }
  await groupRepository.updateMemberRole({
    conversationId: args.conversationId,
    userId: args.targetUserId,
    role: args.role,
  });
  await conversationRepository.touchConversation(args.conversationId);
  try {
    const io = getSocketServer();
    const ids = await activeMemberIds(args.conversationId);
    emitToUsers(io, ids, SOCKET_EVENTS.GROUP_ROLE_CHANGED, {
      conversationId: args.conversationId,
      userId: args.targetUserId,
      newRole: args.role,
      changedBy: args.actorId,
    });
  } catch {
    /* */
  }
}

export async function transferOwnership(args: {
  conversationId: string;
  actorId: string;
  newOwnerId: string;
}): Promise<void> {
  await assertGroupPermission(
    args.conversationId,
    args.actorId,
    "transfer_ownership",
  );
  if (args.newOwnerId === args.actorId) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Pick another member as owner",
    });
  }
  const next = await groupRepository.getGroupForPermissionMeta({
    conversationId: args.conversationId,
    targetUserId: args.newOwnerId,
  });
  if (!next) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "New owner must be an active member",
    });
  }
  const prevOwnerId = args.actorId;
  await groupRepository.transferOwnershipInDb({
    conversationId: args.conversationId,
    previousOwnerId: prevOwnerId,
    newOwnerId: args.newOwnerId,
  });
  await conversationRepository.touchConversation(args.conversationId);
  try {
    const io = getSocketServer();
    const ids = await activeMemberIds(args.conversationId);
    emitToUsers(io, ids, SOCKET_EVENTS.GROUP_OWNERSHIP_TRANSFERRED, {
      conversationId: args.conversationId,
      newOwnerId: args.newOwnerId,
      previousOwnerId: prevOwnerId,
    });
  } catch {
    /* */
  }
}

export async function patchGroupSettings(args: {
  conversationId: string;
  actorId: string;
  body: UpdateGroupBodyDTO;
}): Promise<void> {
  const keys = Object.keys(args.body).filter(
    (k) => args.body[k as keyof UpdateGroupBodyDTO] !== undefined,
  );
  if (keys.length === 0) return;

  if (
    args.body.name !== undefined ||
    args.body.description !== undefined ||
    args.body.avatarUrl !== undefined
  ) {
    await assertGroupPermission(args.conversationId, args.actorId, "edit_group_info");
  }
  if (args.body.slowModeSeconds !== undefined) {
    await assertGroupPermission(args.conversationId, args.actorId, "change_slow_mode");
  }
  if (args.body.whoCanSendMessages !== undefined) {
    await assertGroupPermission(
      args.conversationId,
      args.actorId,
      "change_who_can_send",
    );
  }
  if (args.body.whoCanAddMembers !== undefined) {
    await assertGroupPermission(
      args.conversationId,
      args.actorId,
      "change_who_can_add_members",
    );
  }
  if (args.body.messageHistoryForNewMembers !== undefined) {
    await assertGroupPermission(
      args.conversationId,
      args.actorId,
      "change_message_history",
    );
  }

  const data: Parameters<typeof groupRepository.updateGroupInfoFields>[0]["data"] =
    {};
  if (args.body.name !== undefined) {
    const t = args.body.name.trim();
    if (t.length < GROUP_NAME_MIN || t.length > GROUP_NAME_MAX) {
      throw new ApiException({
        ...ErrorCodes.BAD_REQUEST,
        errorDescription: `Name must be ${GROUP_NAME_MIN}–${GROUP_NAME_MAX} characters`,
      });
    }
    data.name = t;
  }
  if (args.body.description !== undefined) data.description = args.body.description;
  if (args.body.avatarUrl !== undefined) data.avatarUrl = args.body.avatarUrl;
  if (args.body.slowModeSeconds !== undefined) {
    data.slowModeSeconds = args.body.slowModeSeconds;
  }
  if (args.body.whoCanAddMembers !== undefined) {
    data.whoCanAddMembers = args.body.whoCanAddMembers;
  }
  if (args.body.whoCanSendMessages !== undefined) {
    data.whoCanSendMessages = args.body.whoCanSendMessages;
  }
  if (args.body.messageHistoryForNewMembers !== undefined) {
    data.messageHistoryForNewMembers = args.body.messageHistoryForNewMembers;
  }

  await groupRepository.updateGroupInfoFields({
    conversationId: args.conversationId,
    data,
  });
  await conversationRepository.touchConversation(args.conversationId);

  const changes = normalizePolicies(args.body);
  try {
    const io = getSocketServer();
    const ids = await activeMemberIds(args.conversationId);
    emitToUsers(io, ids, SOCKET_EVENTS.GROUP_SETTINGS_UPDATED, {
      conversationId: args.conversationId,
      changes,
    });
  } catch {
    /* */
  }
}

export async function createOrRotateInvite(args: {
  conversationId: string;
  actorId: string;
  body: CreateInviteBodyDTO;
}): Promise<{ inviteUrl: string }> {
  await assertGroupPermission(args.conversationId, args.actorId, "generate_invite");
  let code = groupRepository.generateInviteCode(10);
  let attempts = 0;
  while (attempts < 5) {
    const clash = await prisma.groupInfo.findFirst({
      where: { inviteCode: code },
      select: { id: true },
    });
    if (!clash) break;
    code = groupRepository.generateInviteCode(10);
    attempts++;
  }
  const expires = args.body.inviteCodeExpiresAt
    ? new Date(args.body.inviteCodeExpiresAt)
    : null;
  if (expires && Number.isNaN(expires.getTime())) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Invalid invite expiry",
    });
  }
  const maxUses =
    args.body.inviteCodeMaxUses != null
      ? Math.max(1, Math.floor(args.body.inviteCodeMaxUses))
      : null;
  await groupRepository.setInviteOnGroup({
    conversationId: args.conversationId,
    code,
    inviteCodeExpiresAt: expires,
    inviteCodeMaxUses: maxUses,
  });
  return { inviteUrl: inviteUrl(code) };
}

export async function deleteInvite(args: {
  conversationId: string;
  actorId: string;
}): Promise<void> {
  await assertGroupPermission(args.conversationId, args.actorId, "revoke_invite");
  await groupRepository.revokeInvite({ conversationId: args.conversationId });
}

export async function joinWithInvite(args: {
  inviteCode: string;
  userId: string;
}): Promise<{ conversationId: string }> {
  const code = args.inviteCode.trim();
  if (!code) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Invite code required",
    });
  }
  const { conversationId } = await groupRepository.joinByInviteCodeTransaction({
    inviteCode: code,
    userId: args.userId,
  });

  const profile = await prisma.user.findUnique({
    where: { id: args.userId, deletedAt: null },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const memberRow = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: args.userId,
      },
    },
    select: { role: true },
  });
  if (profile && memberRow) {
    try {
      const io = getSocketServer();
      const ids = await activeMemberIds(conversationId);
      emitToUsers(io, ids, SOCKET_EVENTS.GROUP_MEMBER_ADDED, {
        conversationId,
        addedUsers: [
          {
            id: profile.id,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            role: memberRow.role,
          },
        ],
        addedVia: "INVITE",
      });
    } catch {
      /* */
    }
  }

  return { conversationId };
}

export async function pinMessage(args: {
  conversationId: string;
  actorId: string;
  messageId: string;
}): Promise<void> {
  await assertGroupPermission(args.conversationId, args.actorId, "pin_message");
  const ok = await groupRepository.messageBelongsToConversation({
    messageId: args.messageId,
    conversationId: args.conversationId,
  });
  if (!ok) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "Message not in this conversation",
    });
  }
  await groupRepository.setConversationPinnedMessage({
    conversationId: args.conversationId,
    messageId: args.messageId,
  });
  await conversationRepository.touchConversation(args.conversationId);
  const row = await messageRepository.findById(args.messageId);
  if (!row) return;
  const dto = await rowToDto(row);
  try {
    const io = getSocketServer();
    const ids = await activeMemberIds(args.conversationId);
    emitToUsers(io, ids, SOCKET_EVENTS.GROUP_MESSAGE_PINNED, {
      conversationId: args.conversationId,
      message: dto,
    });
  } catch {
    /* */
  }
}

export async function unpinMessage(args: {
  conversationId: string;
  actorId: string;
}): Promise<void> {
  await assertGroupPermission(args.conversationId, args.actorId, "pin_message");
  await groupRepository.setConversationPinnedMessage({
    conversationId: args.conversationId,
    messageId: null,
  });
  await conversationRepository.touchConversation(args.conversationId);
  try {
    const io = getSocketServer();
    const ids = await activeMemberIds(args.conversationId);
    emitToUsers(io, ids, SOCKET_EVENTS.GROUP_MESSAGE_UNPINNED, {
      conversationId: args.conversationId,
    });
  } catch {
    /* */
  }
}

export async function leaveGroup(args: {
  conversationId: string;
  userId: string;
}): Promise<void> {
  await assertGroupPermission(args.conversationId, args.userId, "leave_group");
  const notifyIds = await activeMemberIds(args.conversationId);
  await groupRepository.setMemberLeft({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  await conversationRepository.touchConversation(args.conversationId);
  try {
    const io = getSocketServer();
    emitToUsers(io, notifyIds, SOCKET_EVENTS.GROUP_MEMBER_LEFT, {
      conversationId: args.conversationId,
      userId: args.userId,
    });
  } catch {
    /* */
  }
}

export async function dissolveGroup(args: {
  conversationId: string;
  ownerId: string;
}): Promise<{ memberUserIds: string[] }> {
  await assertGroupPermission(args.conversationId, args.ownerId, "dissolve_group");
  const memberIds = await activeMemberIds(args.conversationId);
  await groupRepository.dissolveConversation({
    conversationId: args.conversationId,
  });
  try {
    const io = getSocketServer();
    emitToUsers(io, memberIds, SOCKET_EVENTS.GROUP_DISSOLVED, {
      conversationId: args.conversationId,
    });
  } catch {
    /* */
  }
  return { memberUserIds: memberIds };
}
