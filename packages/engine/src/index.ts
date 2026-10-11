// Public engine surface — export only what apps/web (or another package)
// actually imports. Internal helpers (retention purge, email transport,
// plan lookups) stay module-private so callers can't bypass the layer that
// owns them.
export { enqueueRun, requeueBlockedRun, type EnqueueInput } from "./enqueue";
export { checkAgentQuota, checkRunQuota, type QuotaStatus } from "./billing";
export { processRun, RunParkedError, RunBlockedError, type ResumeState } from "./pipeline";
export { startEngine, computeNextFire } from "./worker";
export { decideApproval, type DecisionInput } from "./approvals";
export { recordAudit, recordUsage, recordActivationMetric, type AuditInput } from "./audit";
export { checkAgentBudget, type BudgetStatus } from "./budget";
export { encryptSecret, decryptSecret } from "./secrets";
export { notifyWorkspace, type NotifyInput } from "./notifications";
export { isEmailConfigured, appUrl } from "./email";
