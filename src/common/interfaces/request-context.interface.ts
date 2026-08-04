export interface RequestContext {
  requestId: string;
  correlationId: string;
  userId: string | null;
  actorId: string | null;
  roles: string[];
  ipAddress: string | null;
  userAgent: string | null;
}
