import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { db } from '../../shared/db/client.js';
import { refreshTokens } from '../../shared/db/schema/public.js';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { users } from '../../shared/db/schema/tenant.js';
import { UnauthorizedError, NotFoundError } from '../../shared/errors/types.js';
import type { UserRole, JwtPayload } from '../../shared/types/index.js';
import type { FastifyInstance } from 'fastify';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
}

export async function loginUser(
  app: FastifyInstance,
  tenantId: string,
  schemaName: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  const user = await withTenantSchema(schemaName, async (tenantDb) => {
    const [found] = await tenantDb
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase()), eq(users.isActive, true)))
      .limit(1);
    return found;
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValid = await argon2.verify(user.passwordHash, password);
  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const payload: JwtPayload = {
    sub: user.id,
    tid: tenantId,
    role: user.role as UserRole,
    email: user.email,
    type: 'access',
  };

  const accessToken = app.jwt.sign(payload);
  const rawRefreshToken = uuidv4();
  const tokenHash = await argon2.hash(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(refreshTokens).values({
    id: uuidv4(),
    tenantId,
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Update last login
  await withTenantSchema(schemaName, async (tenantDb) => {
    await tenantDb
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as UserRole,
    },
  };
}

export async function registerOwner(
  schemaName: string,
  input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  },
): Promise<string> {
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const userId = uuidv4();

  await withTenantSchema(schemaName, async (tenantDb) => {
    await tenantDb.insert(users).values({
      id: userId,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      role: 'owner',
    });
  });

  return userId;
}

export async function refreshAccessToken(
  app: FastifyInstance,
  tenantId: string,
  schemaName: string,
  rawRefreshToken: string,
): Promise<string> {
  const now = new Date();

  const pendingTokens = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tenantId, tenantId),
        gt(refreshTokens.expiresAt, now),
        isNull(refreshTokens.revokedAt),
      ),
    );

  let matched: (typeof pendingTokens)[number] | undefined;
  for (const token of pendingTokens) {
    const valid = await argon2.verify(token.tokenHash, rawRefreshToken);
    if (valid) {
      matched = token;
      break;
    }
  }

  if (!matched) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await withTenantSchema(schemaName, async (tenantDb) => {
    const [found] = await tenantDb
      .select()
      .from(users)
      .where(and(eq(users.id, matched!.userId), eq(users.isActive, true)))
      .limit(1);
    return found;
  });

  if (!user) {
    throw new NotFoundError('User', matched.userId);
  }

  const payload: JwtPayload = {
    sub: user.id,
    tid: tenantId,
    role: user.role as UserRole,
    email: user.email,
    type: 'access',
  };

  return app.jwt.sign(payload);
}

export async function revokeRefreshToken(
  tenantId: string,
  rawRefreshToken: string,
): Promise<void> {
  const pendingTokens = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tenantId, tenantId), isNull(refreshTokens.revokedAt)));

  for (const token of pendingTokens) {
    const valid = await argon2.verify(token.tokenHash, rawRefreshToken);
    if (valid) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, token.id));
      return;
    }
  }
}
