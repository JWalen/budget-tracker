import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { LoggerClass } from './logger';

const logger = new LoggerClass('WebSocket');

let io: SocketIOServer | null = null;
const userSockets = new Map<number, Set<string>>(); // userId -> Set of socket IDs

export const initWebSocket = (server: HTTPServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
    path: '/socket.io',
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      socket.data.userId = decoded.userId;

      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    logger.info(`User ${userId} connected: ${socket.id}`);

    // Track user's sockets
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Get user's organizations and join their rooms
    query('SELECT organization_id FROM organization_members WHERE user_id = $1', [userId])
      .then((result) => {
        result.rows.forEach((row) => {
          socket.join(`org:${row.organization_id}`);
        });
        logger.info(`User ${userId} joined ${result.rows.length} organization rooms`);
      })
      .catch((error) => {
        logger.error('Failed to join organization rooms', error as Error);
      });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`User ${userId} disconnected: ${socket.id}`);
      
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Mark notification as read
    socket.on('notification:read', async (notificationId: number) => {
      try {
        await query(
          'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2',
          [notificationId, userId]
        );
        
        socket.emit('notification:read:success', { notificationId });
      } catch (error) {
        logger.error('Mark notification as read error', error as Error);
      }
    });
  });

  logger.info('WebSocket server initialized');

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

/**
 * Send notification to specific user
 */
export const sendNotificationToUser = async (
  userId: number,
  notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
  }
) => {
  try {
    if (!io) {
      logger.warn('Socket.IO not initialized, cannot send notification');
      return;
    }

    // Save to database
    const result = await query(
      'INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, notification.type, notification.title, notification.message, JSON.stringify(notification.data || {})]
    );

    const savedNotification = result.rows[0];

    // Send via WebSocket
    io.to(`user:${userId}`).emit('notification', savedNotification);

    logger.info(`Notification sent to user ${userId}: ${notification.type}`);
  } catch (error) {
    logger.error('Send notification error', error as Error);
  }
};

/**
 * Send notification to organization
 */
export const sendNotificationToOrganization = async (
  organizationId: number,
  notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
    excludeUserId?: number;
  }
) => {
  try {
    if (!io) {
      logger.warn('Socket.IO not initialized, cannot send notification');
      return;
    }

    // Get all members of organization
    const membersResult = await query(
      'SELECT user_id FROM organization_members WHERE organization_id = $1',
      [organizationId]
    );

    // Save notifications for all members
    for (const member of membersResult.rows) {
      if (member.user_id === notification.excludeUserId) {
        continue;
      }

      await query(
        'INSERT INTO notifications (user_id, organization_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          member.user_id,
          organizationId,
          notification.type,
          notification.title,
          notification.message,
          JSON.stringify(notification.data || {}),
        ]
      );
    }

    // Broadcast via WebSocket (excludes sender if provided)
    if (notification.excludeUserId) {
      const sockets = userSockets.get(notification.excludeUserId) || new Set();
      io.to(`org:${organizationId}`).except(Array.from(sockets)).emit('notification', {
        organizationId,
        ...notification,
      });
    } else {
      io.to(`org:${organizationId}`).emit('notification', {
        organizationId,
        ...notification,
      });
    }

    logger.info(`Notification sent to organization ${organizationId}: ${notification.type}`);
  } catch (error) {
    logger.error('Send organization notification error', error as Error);
  }
};

/**
 * Send live update (not saved as notification)
 */
export const sendLiveUpdate = (room: string, event: string, data: any) => {
  if (!io) {
    return;
  }

  io.to(room).emit(event, data);
};

/**
 * Check if user is online
 */
export const isUserOnline = (userId: number): boolean => {
  return userSockets.has(userId) && userSockets.get(userId)!.size > 0;
};

/**
 * Get online users count
 */
export const getOnlineUsersCount = (): number => {
  return userSockets.size;
};

/**
 * Broadcast to all connected clients
 */
export const broadcast = (event: string, data: any) => {
  if (!io) {
    return;
  }

  io.emit(event, data);
};
