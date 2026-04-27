import { prisma } from "../../client/prisma";

export interface BlockMaps {
  iBlockedUserIds: Set<string>;
  blockedMeByUserIds: Set<string>;
}

/** Single query: who I block, and whose block list I’m on (they blocked me). */
export async function loadBlockMaps(userId: string): Promise<BlockMaps> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const iBlockedUserIds = new Set<string>();
  const blockedMeByUserIds = new Set<string>();
  for (const r of rows) {
    if (r.blockerId === userId) iBlockedUserIds.add(r.blockedId);
    if (r.blockedId === userId) blockedMeByUserIds.add(r.blockerId);
  }
  return { iBlockedUserIds, blockedMeByUserIds };
}
