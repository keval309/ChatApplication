import express from "express";
import { customError, notFound } from "../utils/errorHandler";
import authRouter from "../modules/auth/auth.route";
import userRouter from "../modules/user/user.route";

const router = express.Router();

router.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok" }, responseStatus: 200 });
});

router.use("/api/auth", authRouter);
router.use("/api/user", userRouter);

router.use(notFound);
router.use(customError);

export default router;
