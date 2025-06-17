import { TreebeardCore, log } from "@treebeardhq/core";
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

  const headers = request.headers;
  const trace = headers["X-Treebeard-Trace"] as string;
  let traceId = "";
  let spanId = "";
  if (trace) {
    const parts = trace.split("-");
    if (parts.length === 4) {
      traceId = parts[1];
      spanId = parts[2];
    }
  }

  log.error(message, {
    error: err,
    request,
    traceId,
    spanId,
    ...context,
  });

  // flush errors
  return await TreebeardCore.getInstance()?.flush();
};
