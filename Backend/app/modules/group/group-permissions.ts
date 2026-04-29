import { prisma } from "../../client/prisma";
import ApiException from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import type {
  ConversationMemberRole,
} from "../../generated/prisma/client";
import type { GroupPermissionAction, GroupPermissionMeta } from "./group.types";
import type { WhoCanSetting } from "./group.types";

function isAdminRole(role: ConversationMemberRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function parseWhoCan(v: string): WhoCanSetting {
  return v === "ADMINS_ONLY" ? "ADMINS_ONLY" : "EVERYONE";
}

/**
 * Validates permission for the given group action. Loads group, membership,
 * and GroupInfo. Throws ApiException FORBIDDEN when not allowed.
 */
export async function assertGroupPermission(
  conversationId: string,
  requestingUserId: string,
  action: GroupPermissionAction,
  meta?: GroupPermissionMeta,
): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      deletedAt: true,
      groupInfo: {
        select: {
          ownerId: true,
          whoCanAddMembers: true,
          whoCanSendMessages: true,
        },
      },
      members: {
        where: { userId: requestingUserId },
        select: { leftAt: true, role: true },
      },
    },
  });

  if (!conv || conv.type !== "GROUP" || !conv.groupInfo) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Group not found",
    });
  }
  if (conv.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "This group no longer exists",
    });
  }

  const me = conv.members[0];
  if (!me || me.leftAt !== null) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this group",
    });
  }

  const role = me.role;
  const whoAdd = parseWhoCan(conv.groupInfo.whoCanAddMembers);
  const whoSend = parseWhoCan(conv.groupInfo.whoCanSendMessages);

  switch (action) {
    case "send_message": {
      if (isAdminRole(role)) return;
      if (whoSend === "EVERYONE") return;
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription: "Only admins can send messages in this group",
      });
    }
    case "add_members": {
      if (isAdminRole(role)) return;
      if (role === "MEMBER" && whoAdd === "EVERYONE") return;
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription: "You cannot add members to this group",
      });
    }
    case "remove_member": {
      if (role === "MEMBER") {
        throw new ApiException({
          ...ErrorCodes.FORBIDDEN,
          errorDescription: "You cannot remove members",
        });
      }
      const targetRole = meta?.targetRole;
      const targetUserId = meta?.targetUserId;
      if (!targetRole || !targetUserId) {
        throw new ApiException({
          ...ErrorCodes.BAD_REQUEST,
          errorDescription: "Missing target for remove",
        });
      }
      if (targetUserId === conv.groupInfo.ownerId) {
        throw new ApiException({
          ...ErrorCodes.FORBIDDEN,
          errorDescription: "Cannot remove the owner",
        });
      }
      if (role === "ADMIN" && targetRole !== "MEMBER") {
        throw new ApiException({
          ...ErrorCodes.FORBIDDEN,
          errorDescription: "Admins can only remove members",
        });
      }
      return;
    }
    case "edit_group_info":
    case "change_slow_mode":
    case "change_message_history":
    case "change_who_can_send":
    case "change_who_can_add_members": {
      if (isAdminRole(role)) return;
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription: "Only admins can change this setting",
      });
    }
    case "pin_message":
    case "generate_invite":
    case "revoke_invite": {
      if (isAdminRole(role)) return;
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription: "Only admins can do this",
      });
    }
    case "promote_member":
    case "demote_member":
    case "transfer_ownership": {
      if (role === "OWNER") return;
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription: "Only the owner can do this",
      });
    }
    case "dissolve_group": {
      if (role === "OWNER") return;
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription: "Only the owner can delete this group",
      });
    }
    case "leave_group": {
      if (role === "MEMBER" || role === "ADMIN") return;
      throw new ApiException({
        ...ErrorCodes.FORBIDDEN,
        errorDescription:
          "You must transfer ownership before leaving this group",
        clientError: "OWNER_MUST_TRANSFER",
      });
    }
    default: {
      const _exhaustive: never = action;
      throw new ApiException({
        ...ErrorCodes.INTERNAL,
        errorDescription: `Unknown action ${_exhaustive}`,
      });
    }
  }
}

/** Gate for socket/REST message send in a group (dissolved, mute, announcement). */
export async function assertGroupMessageSendAllowed(
  conversationId: string,
  senderId: string,
): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { deletedAt: true, type: true },
  });
  if (!conv || conv.type !== "GROUP") {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Conversation not found",
    });
  }
  if (conv.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "This group has been deleted",
    });
  }

  const mem = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: senderId },
    },
    select: { leftAt: true, mutedUntil: true },
  });
  if (!mem || mem.leftAt !== null) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  if (mem.mutedUntil && mem.mutedUntil.getTime() > Date.now()) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are muted in this group",
    });
  }

  await assertGroupPermission(conversationId, senderId, "send_message");
}
