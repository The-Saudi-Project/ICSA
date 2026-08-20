/**
 * Realtime channel (Socket.IO).
 *
 * The HTTP surface is tenant-isolated by `tenantRepo`; this channel must be too.
 * Every connection is authenticated in the handshake — a staff access token or a
 * customer table-session token — and the room a socket may join is derived from
 * the *verified* identity, never from a client-supplied argument. Without this a
 * client could `join_restaurant(<any id>)` and watch another tenant's order
 * traffic in real time.
 */

import { type Server as HttpServer } from 'node:http'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import { logger } from './logger.js'
import { env } from '../config/env.js'
import { verifyAccessToken } from './jwt.js'
import { verifyTableSessionToken } from './tableSessionToken.js'
import { OrderModel } from '../modules/orders/order.model.js'

let io: SocketIOServer | null = null

interface SocketIdentity {
  kind: 'staff' | 'customer'
  /** Tenant the socket is bound to. Null only for a platform admin. */
  restaurantId: string | null
  /** Present for customers; scopes which orders they may follow. */
  tableSessionId?: string
  role?: string
}

function identityOf(socket: Socket): SocketIdentity | undefined {
  return socket.data.identity as SocketIdentity | undefined
}

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (env.corsOrigins.includes(origin)) return callback(null, true)
        callback(null, false)
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  // Handshake authentication. A connection with no valid token is refused, so an
  // anonymous client can never reach a room.
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token
      if (!token || typeof token !== 'string') return next(new Error('unauthorized'))

      const staff = await verifyAccessToken(token)
      if (staff) {
        socket.data.identity = {
          kind: 'staff',
          restaurantId: staff.rid ?? null,
          role: staff.role,
        } satisfies SocketIdentity
        return next()
      }

      const table = await verifyTableSessionToken(token)
      if (table) {
        socket.data.identity = {
          kind: 'customer',
          restaurantId: table.rid,
          tableSessionId: table.sid,
        } satisfies SocketIdentity
        return next()
      }

      return next(new Error('unauthorized'))
    } catch {
      return next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const identity = identityOf(socket)
    logger.debug({ socketId: socket.id, kind: identity?.kind }, 'socket connected')

    // The restaurant room comes from the verified token; the client-supplied
    // argument is ignored. Only staff bound to a tenant may join it.
    socket.on('join_restaurant', () => {
      if (identity?.kind === 'staff' && identity.restaurantId) {
        void socket.join(`restaurant_${identity.restaurantId}`)
        logger.debug(
          { socketId: socket.id, restaurantId: identity.restaurantId },
          'joined restaurant room',
        )
      }
    })

    // An order room is joinable only if this identity is allowed to see the
    // order: a customer must own it (same session), staff must be in its tenant.
    socket.on('join_order', (orderPublicId: unknown) => {
      void (async () => {
        if (!identity || typeof orderPublicId !== 'string' || !identity.restaurantId) return

        const filter =
          identity.kind === 'customer'
            ? {
                publicId: orderPublicId,
                restaurantId: identity.restaurantId,
                tableSessionId: identity.tableSessionId,
              }
            : { publicId: orderPublicId, restaurantId: identity.restaurantId }

        try {
          const allowed = await OrderModel.exists(filter)
          if (allowed) void socket.join(`order_${orderPublicId}`)
        } catch (err) {
          logger.warn({ err }, 'join_order authorization check failed')
        }
      })()
    })

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'socket disconnected')
    })
  })

  return io
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized')
  }
  return io
}
