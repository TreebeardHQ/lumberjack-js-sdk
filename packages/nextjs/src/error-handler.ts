import { log } from "@treebeardhq/core";
import { type Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  let message = "";

  if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }

  log.error(message, {
    error: err,
    request,
    ...context,
  });
};
