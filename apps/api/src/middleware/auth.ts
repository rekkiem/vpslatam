import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'

export interface JWTPayload {
  sub: string    // userId
  email: string
  role: string
  plan: string
  iat: number
  exp: number
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    // Check user is not suspended
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { suspended: true },
    })
    if (!user || user.suspended) {
      return reply.code(403).send({ error: 'Account suspended or not found' })
    }
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply)
  if (req.user?.role !== 'SUPER_ADMIN') {
    return reply.code(403).send({ error: 'Forbidden: admin only' })
  }
}
