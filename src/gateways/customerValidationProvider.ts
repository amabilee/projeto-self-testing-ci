export interface CustomerValidationResult {
  valid: boolean;
  reason?: string;
}

export interface CustomerValidationProvider {
  validate(document: string): Promise<CustomerValidationResult>;
}

export class LocalCustomerValidationProvider implements CustomerValidationProvider {
  async validate(document: string): Promise<CustomerValidationResult> {
    if (/^(\d)\1+$/.test(document)) {
      return { valid: false, reason: 'Documento inválido' };
    }
    return { valid: true };
  }
}
