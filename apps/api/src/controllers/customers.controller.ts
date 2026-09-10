import type { RequestHandler } from "express";

import { AppError } from "../common/errors.js";
import { customerIdSchema, customerTagsSchema } from "../schemas/customers.schemas.js";
import { updateCustomerTags as updateTags } from "../services/customer.service.js";

export const updateCustomerTags: RequestHandler = async (request, response, next) => {
  try {
    const body = customerTagsSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(
        400,
        "INVALID_REQUEST",
        "tags must be a string array with at most 20 valid tags"
      );
    }

    const params = customerIdSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError(400, "INVALID_REQUEST", "Customer id is required");
    }

    const tags = [...new Set(body.data.tags)];
    response.json(await updateTags(params.data.id, tags));
  } catch (error) {
    next(error);
  }
};
