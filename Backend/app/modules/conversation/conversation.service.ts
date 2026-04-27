import { ApiException } from "../../utils/errorHandler";
import { ErrorCodes } from "../../utils/response";
import { prisma } from "../../client/prisma";
import { loadBlockMaps, type BlockMaps } from "../user/block-lookup";
import * as conversationRepository from "./conversation.repository";
import { getStatus } from "../../socket/presence";
import type {
  ConversationListItemDTO,
  ConversationMemberDTO,
  ConversationsPageDTO,
  LastMessagePreviewDTO,
} from "./conversation.types";

const PAGE_SIZE = 30;

function muteExpiresAt(
  duration: "1h" | "8h" | "1d" | "7d" | "forever",
): Date | null {
  const now = Date.now();
  switch (duration) {
    case "1h":
      return new Date(now + 3600_000);
    case "8h":
      return new Date(now + 8 * 3600_000);
    case "1d":
      return new Date(now + 86400_000);
    case "7d":
      return new Date(now + 7 * 86400_000);
    case "forever":
      return null;
    default:
      return new Date(now + 3600_000);
  }
}

function muteStateFromPref(
  pref:
    | { isMuted: boolean; muteUntil: Date | null }
    | null
    | undefined,
): { isMuted: boolean; muteUntil: string | null } {
  if (!pref?.isMuted) return { isMuted: false, muteUntil: null };
  const now = Date.now();
  if (pref.muteUntil !== null && pref.muteUntil.getTime() <= now) {
    return { isMuted: false, muteUntil: null };
  }
  return {
    isMuted: true,
    muteUntil: pref.muteUntil ? pref.muteUntil.toISOString() : null,
  };
}

function toMemberDTO(
  m: conversationRepository.ConversationListRow["members"][number],
): ConversationMemberDTO {
  return {
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    lastReadAt: m.lastReadAt ? m.lastReadAt.toISOString() : null,
    user: m.user,
  };
}

function toLastMessage(
  msg: conversationRepository.ConversationListRow["messages"][number] | undefined,
): LastMessagePreviewDTO | null {
  if (!msg) return null;
  return {
    id: msg.id,
    senderId: msg.senderId,
    content: msg.content,
    type: msg.type,
    createdAt: msg.createdAt.toISOString(),
    deletedAt: msg.deletedAt ? msg.deletedAt.toISOString() : null,
  };
}

function sanitizePeerForBlockedViewer<
  T extends {
    avatarUrl: string | null;
    presenceStatus: string;
    lastSeenAt: Date | string | null | undefined;
    lastSeenVisible?: boolean | null;
    statusMessage?: string | null;
    bio?: string | null;
  },
>(u: T): T {
  return {
    ...u,
    avatarUrl: null,
    presenceStatus: "OFFLINE",
    lastSeenAt: null,
    lastSeenVisible: false,
    statusMessage: null,
    bio: null,
  };
}

async function projectListItem(args: {
  row: conversationRepository.ConversationListRow;
  userId: string;
  notificationPref: {
    isMuted: boolean;
    muteUntil: Date | null;
  } | null;
  blockMaps: BlockMaps;
}): Promise<ConversationListItemDTO> {
  const { row, userId, notificationPref, blockMaps } = args;
  const meMember = row.members.find((m) => m.userId === userId);
  const otherMember = row.members.find((m) => m.userId !== userId) ?? null;

  let iBlockedOther = false;
  let otherBlockedMe = false;
  if (row.type === "DM" && otherMember) {
    const peerId = otherMember.userId;
    iBlockedOther = blockMaps.iBlockedUserIds.has(peerId);
    otherBlockedMe = blockMaps.blockedMeByUserIds.has(peerId);
  }
  const dmPeerFullyHidden =
    row.type === "DM" &&
    !!otherMember &&
    (iBlockedOther || otherBlockedMe);

  const unreadCount = await conversationRepository.countUnreadForMember({
    conversationId: row.id,
    userId,
    lastReadAt: meMember?.lastReadAt ?? null,
    historyClearedAt: meMember?.historyClearedAt ?? null,
  });
  const { isMuted, muteUntil } = muteStateFromPref(notificationPref);

  const otherUser =
    row.type === "DM" && otherMember
      ? dmPeerFullyHidden
        ? sanitizePeerForBlockedViewer({
            ...otherMember.user,
            presenceStatus: otherMember.user.presenceStatus ?? "OFFLINE",
            lastSeenAt: otherMember.user.lastSeenAt,
          })
        : (() => {
            const live = getStatus(otherMember.userId);
            return {
              ...otherMember.user,
              presenceStatus: live.status,
              lastSeenAt:
                otherMember.user.lastSeenVisible === false
                  ? null
                  : (live.lastSeen
                      ? live.lastSeen.toISOString()
                      : (otherMember.user.lastSeenAt ?? null)),
            };
          })()
      : null;

  const members: ConversationMemberDTO[] = row.members.map((m) => {
    const dto = toMemberDTO(m);
    if (
      row.type === "DM" &&
      otherMember &&
      dmPeerFullyHidden &&
      m.userId === otherMember.userId
    ) {
      return {
        ...dto,
        user: sanitizePeerForBlockedViewer({
          ...dto.user,
          presenceStatus: dto.user.presenceStatus ?? "OFFLINE",
          lastSeenAt: dto.user.lastSeenAt,
        }),
      };
    }
    return dto;
  });

  return {
    id: row.id,
    type: row.type,
    isArchived: row.archivedBy.includes(userId),
    isMuted,
    muteUntil,
    members,
    lastMessage: toLastMessage(row.messages[0]),
    unreadCount,
    otherUser,
    groupName: row.groupInfo?.name ?? null,
    groupAvatarUrl: row.groupInfo?.avatarUrl ?? null,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    iBlockedOther,
    otherBlockedMe,
  };
}

export async function listForUser(args: {
  userId: string;
  cursor?: string | null;
  filter?: "ALL" | "ARCHIVED" | "GROUPS";
}): Promise<ConversationsPageDTO> {
  const filter = args.filter ?? "ALL";
  const rows = await conversationRepository.findConversationsForUser({
    userId: args.userId,
    cursor: args.cursor ?? null,
    limit: PAGE_SIZE,
    filter,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const trimmed = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = trimmed[trimmed.length - 1];
  const nextCursor = hasMore && last ? last.id : null;

  const prefs = await prisma.conversationNotificationPreference.findMany({
    where: {
      userId: args.userId,
      conversationId: { in: trimmed.map((r) => r.id) },
    },
    select: { conversationId: true, isMuted: true, muteUntil: true },
  });
  const prefByConv = new Map(
    prefs.map((p) => [
      p.conversationId,
      { isMuted: p.isMuted, muteUntil: p.muteUntil },
    ]),
  );

  const blockMaps = await loadBlockMaps(args.userId);

  const conversations = await Promise.all(
    trimmed.map((row) =>
      projectListItem({
        row,
        userId: args.userId,
        notificationPref: prefByConv.get(row.id) ?? null,
        blockMaps,
      }),
    ),
  );

  return { conversations, nextCursor, hasMore };
}

export async function getOrCreateDm(args: {
  selfUserId: string;
  otherUserId: string;
}): Promise<ConversationListItemDTO> {
  const { selfUserId, otherUserId } = args;
  if (selfUserId === otherUserId) {
    throw new ApiException({
      ...ErrorCodes.BAD_REQUEST,
      errorDescription: "You cannot start a DM with yourself",
    });
  }

  const otherExists = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, deletedAt: true },
  });
  if (!otherExists || otherExists.deletedAt) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "User not found",
    });
  }

  const existing = await conversationRepository.findDmBetween(
    selfUserId,
    otherUserId,
  );
  const id = existing?.id ?? (
    await conversationRepository.createDmConversation({
      userIdA: selfUserId,
      userIdB: otherUserId,
    })
  ).id;

  await prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId: id,
        userId: selfUserId,
      },
    },
    data: { leftAt: null },
  });

  const row = await conversationRepository.findById(id, selfUserId);
  if (!row) {
    throw new ApiException({
      ...ErrorCodes.INTERNAL,
      errorDescription: "Failed to load conversation",
    });
  }
  const pref = await prisma.conversationNotificationPreference.findUnique({
    where: {
      userId_conversationId: {
        userId: selfUserId,
        conversationId: id,
      },
    },
    select: { isMuted: true, muteUntil: true },
  });
  const blockMaps = await loadBlockMaps(selfUserId);
  return projectListItem({
    row,
    userId: selfUserId,
    notificationPref: pref,
    blockMaps,
  });
}

export async function setArchived(args: {
  userId: string;
  conversationId: string;
  archived: boolean;
}): Promise<void> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  await conversationRepository.setArchived(args);
}

export async function markRead(args: {
  userId: string;
  conversationId: string;
}): Promise<void> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  await conversationRepository.updateLastReadAt({
    conversationId: args.conversationId,
    userId: args.userId,
    at: new Date(),
  });
}

export async function getById(args: {
  userId: string;
  conversationId: string;
}): Promise<ConversationListItemDTO> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  const row = await conversationRepository.findById(
    args.conversationId,
    args.userId,
  );
  if (!row) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Conversation not found",
    });
  }
  const pref = await prisma.conversationNotificationPreference.findUnique({
    where: {
      userId_conversationId: {
        userId: args.userId,
        conversationId: args.conversationId,
      },
    },
    select: { isMuted: true, muteUntil: true },
  });
  const blockMaps = await loadBlockMaps(args.userId);
  return projectListItem({
    row,
    userId: args.userId,
    notificationPref: pref,
    blockMaps,
  });
}

export async function clearHistory(args: {
  userId: string;
  conversationId: string;
}): Promise<{ actorUserId: string }> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  const now = new Date();
  await prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    data: {
      historyClearedAt: now,
      lastReadAt: now,
      unreadCount: 0,
    },
  });
  await conversationRepository.touchConversation(args.conversationId);
  return { actorUserId: args.userId };
}

export type DeleteConversationResult =
  | {
      scope: "everyone";
      conversationId: string;
      memberIds: string[];
    }
  | {
      scope: "self";
      conversationId: string;
      actorUserId: string;
    };

export async function deleteConversationHard(args: {
  userId: string;
  conversationId: string;
}): Promise<DeleteConversationResult> {
  const conv = await prisma.conversation.findUnique({
    where: { id: args.conversationId },
    select: {
      type: true,
      members: { select: { userId: true, role: true, leftAt: true } },
    },
  });
  if (!conv) {
    throw new ApiException({
      ...ErrorCodes.NOT_FOUND,
      errorDescription: "Conversation not found",
    });
  }
  const me = conv.members.find((m) => m.userId === args.userId);
  if (!me || me.leftAt !== null) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }

  if (conv.type === "GROUP") {
    if (me.role === "OWNER") {
      const activeIds = conv.members
        .filter((m) => m.leftAt === null)
        .map((m) => m.userId);
      await prisma.conversation.delete({ where: { id: args.conversationId } });
      return {
        scope: "everyone",
        conversationId: args.conversationId,
        memberIds: activeIds,
      };
    }
    const now = new Date();
    await prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId: args.conversationId,
          userId: args.userId,
        },
      },
      data: {
        historyClearedAt: now,
        lastReadAt: now,
        unreadCount: 0,
        leftAt: now,
      },
    });
    await conversationRepository.touchConversation(args.conversationId);
    return {
      scope: "self",
      conversationId: args.conversationId,
      actorUserId: args.userId,
    };
  }

  const now = new Date();
  await prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    data: {
      historyClearedAt: now,
      lastReadAt: now,
      unreadCount: 0,
      leftAt: now,
    },
  });
  await conversationRepository.touchConversation(args.conversationId);
  return {
    scope: "self",
    conversationId: args.conversationId,
    actorUserId: args.userId,
  };
}

export async function muteConversation(args: {
  userId: string;
  conversationId: string;
  duration: "1h" | "8h" | "1d" | "7d" | "forever";
  autoUnmuteReminder: boolean;
}): Promise<void> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  const muteUntil = muteExpiresAt(args.duration);
  const remind =
    args.duration !== "forever" && args.autoUnmuteReminder;
  await prisma.conversationNotificationPreference.upsert({
    where: {
      userId_conversationId: {
        userId: args.userId,
        conversationId: args.conversationId,
      },
    },
    create: {
      userId: args.userId,
      conversationId: args.conversationId,
      isMuted: true,
      muteUntil,
      autoUnmuteReminder: remind,
    },
    update: {
      isMuted: true,
      muteUntil,
      autoUnmuteReminder: remind,
    },
  });
}

export async function unmuteConversation(args: {
  userId: string;
  conversationId: string;
}): Promise<void> {
  const isMember = await conversationRepository.isMember({
    conversationId: args.conversationId,
    userId: args.userId,
  });
  if (!isMember) {
    throw new ApiException({
      ...ErrorCodes.FORBIDDEN,
      errorDescription: "You are not a member of this conversation",
    });
  }
  await prisma.conversationNotificationPreference.upsert({
    where: {
      userId_conversationId: {
        userId: args.userId,
        conversationId: args.conversationId,
      },
    },
    create: {
      userId: args.userId,
      conversationId: args.conversationId,
      isMuted: false,
      muteUntil: null,
    },
    update: {
      isMuted: false,
      muteUntil: null,
    },
  });
}
