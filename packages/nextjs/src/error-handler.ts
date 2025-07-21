import { LumberjackCore, log, utils } from "@lumberjack-sdk/core";
import { trace } from "@opentelemetry/api";
import { type Instrumentation } from "next";
// extend Instrumentation.onRequestError add additioanml optons param:

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  let message = "Request failed";

  const currentSpan = trace.getActiveSpan();

  console.log("[Lumberjack] onRequestError", {
    err,
    request,
    context,
    currentSpan,
  });

  let traceId = currentSpan?.spanContext().traceId;
  let spanId = currentSpan?.spanContext().spanId;

  let exception: any = null;
  if (err instanceof Error) {
    exception = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  const caller = utils.getCallerInfo(1);

  log.error(
    message,
    {
      exception,
      request,
      traceId,
      spanId,
      ...context,
    },
    caller
  );

  // flush errors
  return await LumberjackCore.getInstance()?.flush();
};
