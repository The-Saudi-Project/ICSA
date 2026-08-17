import { Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { logger } from './logger.js'

let io: SocketIOServer | null = null

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Adjust to match the Express app CORS policy
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected')

    socket.on('join_restaurant', (restaurantId: string) => {
      void socket.join(`restaurant_${restaurantId}`)
      logger.debug({ socketId: socket.id, restaurantId }, 'joined restaurant room')
    })

    socket.on('join_order', (orderId: string) => {
      void socket.join(`order_${orderId}`)
      logger.debug({ socketId: socket.id, orderId }, 'joined order room')
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
