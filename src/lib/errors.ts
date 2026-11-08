export class FiscalError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FiscalError";
    this.code = code;
  }
}
