import { Router, type IRouter } from "express";
import alertsRouter from "./alerts";
import healthRouter from "./health";
import marketsRouter from "./markets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(alertsRouter);
router.use(marketsRouter);

export default router;
