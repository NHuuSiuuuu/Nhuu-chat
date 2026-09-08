import { Router } from "express";
import { AppError } from "../common/errors.js";
import { requireRole } from "../auth/auth.middleware.js";
import { CustomerModel } from "../models/customer.model.js";

export const customerRouter = Router();
customerRouter.patch("/:id/tags", requireRole("admin", "agent"), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body?.tags) || req.body.tags.some((tag: unknown) => typeof tag !== "string" || !tag.trim())) {
      throw new AppError(400, "INVALID_REQUEST", "tags must be a non-empty string array");
    }
    const customer = await CustomerModel.findByIdAndUpdate(req.params.id, { tags: req.body.tags }, { new: true }).lean();
    if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
    res.json({ id: String(customer._id), tags: customer.tags });
  } catch (e) { next(e); }
});
