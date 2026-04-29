import express from "express";
import { customError, notFound } from "../utils/errorHandler";
import authRouter from "../modules/auth/auth.route";
import userRouter from "../modules/user/user.route";
import { conversationRouter } from "../modules/conversation";
import { messageRouter } from "../modules/message";
import { groupConversationRouter, joinRouter } from "../modules/group";

const router = express.Router();

router.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok" }, responseStatus: 200 });
});

router.use("/api/auth", authRouter);
router.use("/api/user", userRouter);
router.use("/api/conversations", groupConversationRouter);
router.use("/api/conversations", conversationRouter);
router.use("/api/join", joinRouter);
// messageRouter declares its full path under /api/conversations/:id/messages,
// mounted at /api so the conversation id parameter remains visible.
router.use("/api", messageRouter);

router.use(notFound);
router.use(customError);

export default router;
