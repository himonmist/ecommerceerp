export type Ctx = {
  tenantId: string;
  userId: string;
  permissions: string[];
  readOnly?: boolean;
  ip?: string | null;
  user?: { name: string; email: string };
  tenant?: { name: string; slug: string; status: string; trialEndsAt: Date | null };
};
