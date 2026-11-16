
export type VerifyErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "CONFIG_PARSE_ERROR"
  | "GIT_REPOSITORY_NOT_FOUND"
  | "GIT_COMMAND_FAILED"
  | "VERIFICATION_FAILED"
  | "UNKNOWN_ERROR";

export class VerifyError extends Error {
  public readonly code: VerifyErrorCode;

  public readonly cause?: unknown;

  constructor(
    code: VerifyErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);

    this.name = "VerifyError";
    this.code = code;
    this.cause = cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigValidationError extends VerifyError {
  constructor(message: string, cause?: unknown) {
    super("CONFIG_INVALID", message, cause);

    this.name = "ConfigValidationError";
  }
}
