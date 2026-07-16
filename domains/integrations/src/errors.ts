/**
 * Integrations domain errors (docs/architecture/12-integrations-and-sync.md,
 * 06-api-architecture.md). `ConnectorDefinitionError` fails a malformed
 * connector loudly at module load (like the template SDK's
 * `TemplateDefinitionError`) rather than at sync time.
 */

/** A connector definition violates the contract — thrown at registration. */
export class ConnectorDefinitionError extends Error {
  constructor(id: string, message: string) {
    super(`Connector "${id}": ${message}`);
    this.name = "ConnectorDefinitionError";
  }
}

/** A candidate cannot be mapped onto the Profile (unknown source, wrong
 * kind for the requested operation). */
export class CandidateApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateApplyError";
  }
}
