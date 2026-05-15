import { FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma'

export async function auditLog(
  userId: string | null,
  action: string,
  metadata: Record<string, any>,
  req?: FastifyRequest
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        metadata,
        ipAddress: req?.ip,
        userAgent: req?.headers['user-agent'],
      },
    })
  } catch (err) {
    console.error('[audit]', err)
  }
}
