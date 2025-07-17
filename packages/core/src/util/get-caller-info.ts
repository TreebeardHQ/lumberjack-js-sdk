// caller.ts --------------------------------------------------------------
type CallSite = NodeJS.CallSite;

export type CallerInfo = {
  file?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  func?: string | undefined;
};

/** Return caller info N frames above this helper (skip=0 → immediate caller). */
export function getCallerInfo(skip = 0): CallerInfo {
  const err = new Error();

  // Ask V8 for structured stack frames
  const prev = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  Error.captureStackTrace(err, getCallerInfo); // omit this helper
  const stack = err.stack as unknown as CallSite[];
  Error.prepareStackTrace = prev; // restore default

  const cs = stack[skip]; // desired frame
  if (!cs) return {};

  return {
    file: cs.getFileName() ?? undefined,
    line: cs.getLineNumber() ?? undefined,
    column: cs.getColumnNumber() ?? undefined,
    func: cs.getFunctionName() || cs.getMethodName() || "anonymous",
  };
}
