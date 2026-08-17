/**
 * Renderoni Structured Diagnostics Engine
 *
 * Emits actionable machine-readable diagnostics (RND_xxxx) with tick, entity,
 * and remediation context.
 */

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface DiagnosticRecord {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  tick: number;
  entityId?: string;
  remediation?: string;
  timestamp: number;
}

export class DiagnosticLogger {
  private records: DiagnosticRecord[] = [];
  private maxRecords: number;

  constructor(maxRecords: number = 256) {
    this.maxRecords = maxRecords;
  }

  emit(
    code: string,
    message: string,
    options: {
      severity?: DiagnosticSeverity;
      tick?: number;
      entityId?: string;
      remediation?: string;
    } = {}
  ): DiagnosticRecord {
    const record: DiagnosticRecord = {
      code,
      message,
      severity: options.severity ?? 'warning',
      tick: options.tick ?? 0,
      entityId: options.entityId,
      remediation: options.remediation,
      timestamp: Date.now(),
    };

    if (this.records.length >= this.maxRecords) {
      this.records.shift();
    }
    this.records.push(record);
    return record;
  }

  getRecords(minSeverity?: DiagnosticSeverity): DiagnosticRecord[] {
    if (!minSeverity) return [...this.records];
    const severityRank: Record<DiagnosticSeverity, number> = { info: 0, warning: 1, error: 2 };
    const minRank = severityRank[minSeverity];
    return this.records.filter((r) => severityRank[r.severity] >= minRank);
  }

  hasErrors(): boolean {
    return this.records.some((r) => r.severity === 'error');
  }

  clear(): void {
    this.records = [];
  }
}
