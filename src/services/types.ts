export type IdGenerator = () => string;
export type Clock = () => Date;

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
