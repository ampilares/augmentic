// Canonical API route constants. UI clients and route handlers both import
// these so paths can never drift (contract-sync rule, Spec §3.3).

export const API = {
  auth: {
    signUp: "/api/auth/sign-up",
    signIn: "/api/auth/sign-in",
    signOut: "/api/auth/sign-out",
  },
  workspaces: "/api/workspaces",
  workspace: (id: string) => `/api/workspaces/${id}`,
  members: (ws: string) => `/api/workspaces/${ws}/members`,
  invitations: (ws: string) => `/api/workspaces/${ws}/invitations`,
  agents: (ws: string) => `/api/workspaces/${ws}/agents`,
  agent: (ws: string, id: string) => `/api/workspaces/${ws}/agents/${id}`,
  agentChat: (ws: string, id: string) =>
    `/api/workspaces/${ws}/agents/${id}/chat`,
  agentMemory: (ws: string, id: string) =>
    `/api/workspaces/${ws}/agents/${id}/memory`,
  agentTemplates: (ws: string) => `/api/workspaces/${ws}/agent-templates`,
  integrations: (ws: string) => `/api/workspaces/${ws}/integrations`,
  integrationConnect: (ws: string, provider: string) =>
    `/api/workspaces/${ws}/integrations/${provider}/connect`,
  integrationDisconnect: (ws: string, provider: string) =>
    `/api/workspaces/${ws}/integrations/${provider}/disconnect`,
  toolPermissions: (ws: string) => `/api/workspaces/${ws}/tool-permissions`,
  workflows: (ws: string) => `/api/workspaces/${ws}/workflows`,
  workflow: (ws: string, id: string) =>
    `/api/workspaces/${ws}/workflows/${id}`,
  workflowRun: (ws: string, id: string) =>
    `/api/workspaces/${ws}/workflows/${id}/run`,
  workflowTemplates: (ws: string) =>
    `/api/workspaces/${ws}/workflow-templates`,
  runs: (ws: string) => `/api/workspaces/${ws}/runs`,
  run: (ws: string, id: string) => `/api/workspaces/${ws}/runs/${id}`,
  runStream: (ws: string, id: string) =>
    `/api/workspaces/${ws}/runs/${id}/stream`,
  approvals: (ws: string) => `/api/workspaces/${ws}/approvals`,
  approvalDecision: (ws: string, id: string) =>
    `/api/workspaces/${ws}/approvals/${id}/decision`,
  knowledge: (ws: string) => `/api/workspaces/${ws}/knowledge`,
  brandProfile: (ws: string) => `/api/workspaces/${ws}/brand-profile`,
  audit: (ws: string) => `/api/workspaces/${ws}/audit`,
  usage: (ws: string) => `/api/workspaces/${ws}/usage`,
  workChart: (ws: string) => `/api/workspaces/${ws}/work-chart`,
  webhookTrigger: (token: string) => `/api/hooks/${token}`,
} as const;
