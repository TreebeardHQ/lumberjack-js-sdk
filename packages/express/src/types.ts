import { Request, Response, NextFunction } from 'express';

export interface ExpressInstrumentationConfig {
  ignorePaths?: string[];
  captureHeaders?: boolean;
  captureBody?: boolean;
  captureQuery?: boolean;
  captureParams?: boolean;
  sanitizeHeaders?: string[];
  maxBodySize?: number;
  errorHandler?: boolean;
}

export interface InstrumentedRequest extends Request {
  treebeardTraceId?: string;
  treebeardSpanId?: string;
  treebeardStartTime?: number;
}

export interface InstrumentedResponse extends Response {
  treebeardTraceId?: string;
}

export type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void;