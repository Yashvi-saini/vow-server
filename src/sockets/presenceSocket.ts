import { Server, Socket } from "socket.io";
import { getRedis } from "../libs/redis";
import jwt from "jsonwebtoken";
import { verifySocketToken, getTokenFromSocket } from "./auth";

const redisClient = getRedis();

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatar?: string;
  x: number;
  y: number;
  ts: number;
}

const memoryPresence = new Map<string, Map<string, PresenceUser>>();

const getWorkspaceUsers = async (workspaceId: string): Promise<PresenceUser[]> => {
  const memMap = memoryPresence.get(workspaceId);
  const memUsers = memMap ? Array.from(memMap.values()) : [];
  try {
    const key = `presence:workspace:${workspaceId}`;
    const users = await redisClient.hgetall(key);
    if (users && Object.keys(users).length > 0) {
      return Object.values(users).map((u) => JSON.parse(u));
    }
  } catch (err: any) {
    // Redis unavailable, fallback to in-memory map
  }
  return memUsers;
};

const setWorkspaceUser = async (workspaceId: string, user: PresenceUser) => {
  if (!memoryPresence.has(workspaceId)) {
    memoryPresence.set(workspaceId, new Map());
  }
  memoryPresence.get(workspaceId)!.set(user.userId, user);

  try {
    const key = `presence:workspace:${workspaceId}`;
    await redisClient.hset(key, user.userId, JSON.stringify(user));
  } catch (err: any) {
    // Redis error ignored
  }
};

const removeWorkspaceUser = async (workspaceId: string, userId: string) => {
  const memMap = memoryPresence.get(workspaceId);
  if (memMap) {
    memMap.delete(userId);
  }
  try {
    const key = `presence:workspace:${workspaceId}`;
    await redisClient.hdel(key, userId);
  } catch (err: any) {
    // Redis error ignored
  }
};

const getWorkspaceToken = (socket: Socket) => {
  const raw = socket.handshake.headers.cookie;
  if (!raw) return null;

  const cookies = Object.fromEntries(
    raw.split(";").map((c) => c.trim().split("="))
  );

  const wsCookie = Object.keys(cookies).find((k) =>
    k.startsWith("workspaceToken_")
  );

  if (!wsCookie) return null;

  return {
    workspaceId: wsCookie.replace("workspaceToken_", ""),
    token: cookies[wsCookie],
  };
};

export const setupPresenceSocket = async (io: Server, socket: Socket) => {
  try {
    let currentUserId: string | null = (socket as any).user?._id
      ? String((socket as any).user._id)
      : null;

    if (!currentUserId) {
      try {
        const token =
          getTokenFromSocket(socket) ||
          (socket.handshake.auth && (socket.handshake.auth as any).token);
        if (token) {
          const user = await verifySocketToken(token);
          if (user?._id) currentUserId = String(user._id);
        }
      } catch (e) {
        const ws = getWorkspaceToken(socket);
        if (ws?.token && process.env.WORKSPACE_JWT_SECRET) {
          try {
            const decoded: any = jwt.verify(
              ws.token,
              process.env.WORKSPACE_JWT_SECRET
            );
            if (decoded?.userId) currentUserId = String(decoded.userId);
          } catch (e2) {}
        }
      }
    }

    let currentWorkspaceId: string | null = null;

    // Legacy cookie check for initial sync if present
    const ws = getWorkspaceToken(socket);
    if (ws) {
      currentWorkspaceId = ws.workspaceId;
      socket.join(ws.workspaceId);
      const initialUsers = await getWorkspaceUsers(ws.workspaceId);
      socket.emit("presence-sync", initialUsers);
    }

    // JOIN
    socket.on(
      "join",
      async (data: {
        workspaceId: string;
        displayName?: string;
        avatar?: string;
        x?: number;
        y?: number;
      }) => {
        try {
          const { workspaceId, displayName, avatar, x, y } = data || {};
          if (!workspaceId) return;

          currentWorkspaceId = workspaceId;
          const uid =
            currentUserId ||
            ((socket as any).user?._id
              ? String((socket as any).user._id)
              : `guest_${socket.id.slice(0, 6)}`);
          currentUserId = uid;

          socket.join(workspaceId);

          const existingUsers = await getWorkspaceUsers(workspaceId);

          const newUser: PresenceUser = {
            userId: uid,
            displayName:
              displayName ||
              (socket as any).user?.username ||
              `User-${uid.slice(0, 6)}`,
            avatar: avatar || (socket as any).user?.avatar || "",
            x: typeof x === "number" && !isNaN(x) ? x : 60,
            y: typeof y === "number" && !isNaN(y) ? y : 60,
            ts: Date.now(),
          };

          await setWorkspaceUser(workspaceId, newUser);

          // Tell this socket their identity
          socket.emit("join-ack", { userId: uid });

          // Sync full state to this socket (all participants including self)
          const allUsers = [
            ...existingUsers.filter((u) => u.userId !== uid),
            newUser,
          ];
          socket.emit("presence-sync", allUsers);

          // Broadcast to other users in this workspace
          socket.to(workspaceId).emit("user-joined", newUser);
          console.log(
            `Presence: User ${uid} (${newUser.displayName}) joined workspace ${workspaceId}`
          );
        } catch (err: any) {
          console.error("Presence join error:", err.message);
        }
      }
    );

    // MOVE
    socket.on(
      "move",
      async (data: {
        workspaceId?: string;
        x: number;
        y: number;
        displayName?: string;
        avatar?: string;
      }) => {
        try {
          const wsId = data?.workspaceId || currentWorkspaceId;
          if (!wsId || !currentUserId) return;

          const updated: PresenceUser = {
            userId: currentUserId,
            displayName:
              data.displayName ||
              (socket as any).user?.username ||
              "User",
            avatar: data.avatar || (socket as any).user?.avatar || "",
            x: data.x,
            y: data.y,
            ts: Date.now(),
          };

          await setWorkspaceUser(wsId, updated);

          // Broadcast updated position to others in workspace
          socket.to(wsId).emit("user-moved", updated);
        } catch (err: any) {
          console.error("Presence move error:", err.message);
        }
      }
    );

    // LEAVE
    socket.on("leave", async (data?: { workspaceId?: string }) => {
      try {
        const wsId = data?.workspaceId || currentWorkspaceId;
        if (!wsId || !currentUserId) return;

        await removeWorkspaceUser(wsId, currentUserId);
        socket.leave(wsId);
        io.to(wsId).emit("user-left", { userId: currentUserId });
        if (currentWorkspaceId === wsId) currentWorkspaceId = null;
        console.log(`Presence: User ${currentUserId} left workspace ${wsId}`);
      } catch (err: any) {
        console.error("Presence leave error:", err.message);
      }
    });

    // DISCONNECT
    socket.on("disconnect", async () => {
      try {
        if (currentWorkspaceId && currentUserId) {
          await removeWorkspaceUser(currentWorkspaceId, currentUserId);
          io.to(currentWorkspaceId).emit("user-left", { userId: currentUserId });
          console.log(
            `Presence: User ${currentUserId} disconnected from workspace ${currentWorkspaceId}`
          );
        }
      } catch (err: any) {
        console.error("Presence disconnect error:", err.message);
      }
    });
  } catch (err: any) {
    console.warn("Presence socket warning:", err.message);
  }
};
