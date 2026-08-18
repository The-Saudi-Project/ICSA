import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

let socketInstance: Socket | null = null

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io({
      autoConnect: false,
      withCredentials: true,
    })
  }
  return socketInstance
}

export function useRestaurantSocket(restaurantId?: string | null) {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!restaurantId) return

    const socket = getSocket()
    
    function onConnect() {
      setIsConnected(true)
      socket.emit('join_restaurant', restaurantId)
    }

    function onDisconnect() {
      setIsConnected(false)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    if (socket.connected) {
      onConnect()
    } else {
      socket.connect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      // Disconnect if we're unmounting the whole staff app, but usually it stays connected
    }
  }, [restaurantId])

  return { socket: getSocket(), isConnected }
}

export function useOrderSocket(orderPublicId?: string | null) {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!orderPublicId) return

    const socket = getSocket()
    
    function onConnect() {
      setIsConnected(true)
      socket.emit('join_order', orderPublicId)
    }

    function onDisconnect() {
      setIsConnected(false)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    if (socket.connected) {
      onConnect()
    } else {
      socket.connect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [orderPublicId])

  return { socket: getSocket(), isConnected }
}
