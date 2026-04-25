import express from "express";
import { customError, notFound } from "../utils/errorHandler";

const router = express.Router();

router.use(notFound);
router.use(customError);
router.get("/test", () => {
  console.log("this is a Test route");
});

export default router;
