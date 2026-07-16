/**
 * Server-runtime errors (docs/architecture/12-integrations-and-sync.md).
 * Expected failures the app layer translates into user-facing messages;
 * everything else propagates to Sentry via the action helper.
 */

export class IntegrationDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationDataError";
  }
}

export class ConnectionNotFoundError extends Error {
  constructor() {
    super("Connection not found.");
    this.name = "ConnectionNotFoundError";
  }
}

export class StagedItemNotFoundError extends Error {
  constructor() {
    super("Staged item not found.");
    this.name = "StagedItemNotFoundError";
  }
}

export class UnknownConnectorError extends Error {
  constructor(readonly connectorId: string) {
    super(`Unknown connector "${connectorId}".`);
    this.name = "UnknownConnectorError";
  }
}

/** Token encryption/decryption failed (missing key, unknown key version,
 * tampered envelope). Never carries plaintext or key material. */
export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

/** Storing an oauth2/token connection requires INTEGRATIONS_TOKEN_KEY. */
export class TokenKeyMissingError extends Error {
  constructor() {
    super(
      "INTEGRATIONS_TOKEN_KEY is not configured — cannot store provider tokens.",
    );
    this.name = "TokenKeyMissingError";
  }
}
