import { AppError } from "../common/errors.js";
import { CustomerModel } from "../models/customer.model.js";

export async function updateCustomerTags(customerId: string, tags: string[]) {
  const customer = await CustomerModel.findByIdAndUpdate(
    customerId,
    { tags },
    { new: true }
  ).lean();
  if (!customer) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
  }

  return { id: String(customer._id), tags: customer.tags };
}
