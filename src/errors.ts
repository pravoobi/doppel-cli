/** A user-fixable setup problem: shown as a one-line message, no stack trace. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}
