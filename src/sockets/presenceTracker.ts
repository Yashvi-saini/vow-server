import { Server, Socket } from "socket.io";
import { getTokenFromSocket, verifySocketToken } from "./auth";

// Maps to track active connections in real-time
// userId -> Set of active socket IDs
const userSockets = new Map<string, Set<string>>();

// socketId -> userId
const socketUser = new Map<string, string>();

// workspaceId -> Map<userId, Set<socketId>>
const workspaceUsers = new Map<string, Map<string, Set<string>>>();

// socketId -> Set of workspaceIds
const socketWorkspaces = new Map<string, Set<string>>();

export const getGlobalOnlineUsers = (): string[] => {
  const online: string[] = [];
  for (const [userId, sockets] of userSockets.entries()) {
    if (sockets.size > 0) {
      online.push(userId);
    }
  }
  return online;
};

export const getWorkspaceOnlineUsers = (workspaceId: string): string[] => {
  const wsMap = workspaceUsers.get(workspaceId);
  if (!wsMap) return [];
  const online: string[] = [];
  for (const [userId, sockets] of wsMap.entries()) {
    // Only count if user still has at least one active socket
    const globalSockets = userSockets.get(userId);
    if (sockets.size > 0 && globalSockets && globalSockets.size > 0) {
      online.push(userId);
    }
  }
  return online;
};

export const trackUserConnection = (
  io: Server,
  socket: Socket,
  userId: string
) => {
  const cleanUserId = String(userId);
  socketUser.set(socket.id, cleanUserId);

  if (!userSockets.has(cleanUserId)) {
    userSockets.set(cleanUserId, new Set());
  }

  const existingSockets = userSockets.get(cleanUserId)!;
  const isFirstSocket = existingSockets.size === 0;
  existingSockets.add(socket.id);

  if (isFirstSocket) {
    io.emit("user_online", { userId: cleanUserId });
  }
};

export const trackUserWorkspaceJoin = (
  io: Server,
  socket: Socket,
  userId: string,
  workspaceId: string
) => {
  const cleanUserId = String(userId);
  const cleanWsId = String(workspaceId);

  // Track workspace for this socket
  if (!socketWorkspaces.has(socket.id)) {
    socketWorkspaces.set(socket.id, new Set());
  }
  socketWorkspaces.get(socket.id)!.add(cleanWsId);

  // Track user in workspace
  if (!workspaceUsers.has(cleanWsId)) {
    workspaceUsers.set(cleanWsId, new Map());
  }
  const wsMap = workspaceUsers.get(cleanWsId)!;
  if (!wsMap.has(cleanUserId)) {
    wsMap.set(cleanUserId, new Set());
  }
  const userWsSockets = wsMap.get(cleanUserId)!;
  const isFirstInWorkspace = userWsSockets.size === 0;
  userWsSockets.add(socket.id);

  socket.join(`workspace:${cleanWsId}`);

  if (isFirstInWorkspace) {
    // Broadcast to the workspace room
    io.to(`workspace:${cleanWsId}`).emit("user_online", {
      userId: cleanUserId,
      workspaceId: cleanWsId,
    });
  }

  // Send the current list of online users in this workspace to this socket
  const currentOnline = getWorkspaceOnlineUsers(cleanWsId);
  socket.emit("online_users_list", currentOnline);
};

export const trackUserWorkspaceLeave = (
  io: Server,
  socket: Socket,
  userId: string,
  workspaceId: string
) => {
  const cleanUserId = String(userId);
  const cleanWsId = String(workspaceId);

  if (socketWorkspaces.has(socket.id)) {
    socketWorkspaces.get(socket.id)!.delete(cleanWsId);
  }

  const wsMap = workspaceUsers.get(cleanWsId);
  if (wsMap && wsMap.has(cleanUserId)) {
    const userWsSockets = wsMap.get(cleanUserId)!;
    userWsSockets.delete(socket.id);

    // Check if user has any other active socket still in this workspace
    let stillActiveInWs = false;
    const globalSockets = userSockets.get(cleanUserId);
    if (globalSockets) {
      for (const sId of globalSockets) {
        if (sId !== socket.id && socketWorkspaces.get(sId)?.has(cleanWsId)) {
          stillActiveInWs = true;
          break;
        }
      }
    }

    if (!stillActiveInWs || userWsSockets.size === 0) {
      wsMap.delete(cleanUserId);
      io.to(`workspace:${cleanWsId}`).emit("user_offline", {
        userId: cleanUserId,
        workspaceId: cleanWsId,
      });
    }
  }
};

export const trackUserDisconnect = (io: Server, socket: Socket) => {
  const userId = socketUser.get(socket.id);
  if (!userId) {
    socketWorkspaces.delete(socket.id);
    return;
  }

  // Leave all workspaces this socket was connected to
  const wsSet = socketWorkspaces.get(socket.id);
  if (wsSet) {
    for (const wsId of Array.from(wsSet)) {
      trackUserWorkspaceLeave(io, socket, userId, wsId);
    }
  }
  socketWorkspaces.delete(socket.id);

  // Remove from global socket tracker
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(socket.id);
    if (sockets.size === 0) {
      userSockets.delete(userId);
      io.emit("user_offline", { userId });
    }
  }

  socketUser.delete(socket.id);
};

export const setupPresenceTracker = (io: Server, socket: Socket) => {
  // Listen for get_online_users
  socket.on("get_online_users", (workspaceId?: string) => {
    if (workspaceId && typeof workspaceId === "string") {
      const list = getWorkspaceOnlineUsers(workspaceId);
      socket.emit("online_users_list", list);
    } else {
      socket.emit("online_users_list", getGlobalOnlineUsers());
    }
  });

  // Listen for explicit workspace join / leave for presence
  socket.on("join_workspace_presence", (workspaceId: string) => {
    const userId = socketUser.get(socket.id) || (socket as any).user?._id;
    if (userId && workspaceId) {
      trackUserWorkspaceJoin(io, socket, String(userId), String(workspaceId));
    }
  });

  socket.on("leave_workspace_presence", (workspaceId: string) => {
    const userId = socketUser.get(socket.id) || (socket as any).user?._id;
    if (userId && workspaceId) {
      trackUserWorkspaceLeave(io, socket, String(userId), String(workspaceId));
    }
  });
};

