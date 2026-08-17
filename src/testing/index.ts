export interface AssertionOp {
  op: string;
  [key: string]: unknown;
}

export interface CheckResult {
  passed: boolean;
  failures: string[];
}
