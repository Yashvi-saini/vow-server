import { Server, Socket } from "socket.io";
import Workspace from "../models/workspace";
import { getRedis } from "../libs/redis";
import { getTokenFromSocket, verifySocketToken } from "./auth";
import { getGlobalOnlineUsers } from "./presenceTracker";

const redisClient = getRedis();

const presenceKey = (workspaceId: string) => `presence:workspace:${workspaceId}`;
const mapRoom = (workspaceId: string) => `map:${workspaceId}`;

const clamp = (n: any, fallback: number) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, v));
};

const resolveUser = async (socket: Socket) => {
  const existing = (socket as any).user;
  if (existing?._id) return existing;
  const token =
    getTokenFromSocket(socket) || (socket.handshake.auth as any)?.token;
  if (!token) return null;
  const user = await verifySocketToken(token);
  (socket as any).user = user;
  return user;
};

const getMapUsers = async (workspaceId: string) => {
  const key = presenceKey(workspaceId);
  const raw = await redisClient.hgetall(key);
  const online = new Set(getGlobalOnlineUsers());
  const users: any[] = [];
  for (const [userId, value] of Object.entries(raw)) {
    if (!online.has(userId)) {
      await redisClient.hdel(key, userId);
      continue;
    }
    try {
      users.push(JSON.parse(value));
    } catch {
      await redisClient.hdel(key, userId);
    }
  }
  return users;
};

export const setupPresenceSocket = (io: Server, socket: Socket) => {
  let mapWorkspaceId: string | null = null;
  let mapUser: any = null;

  const leaveMap = async () => {
    if (!mapWorkspaceId || !mapUser) return;
    const workspaceId = mapWorkspaceId;
    const userId = mapUser.userId;
    mapWorkspaceId = null;
    mapUser = null;
    socket.leave(mapRoom(workspaceId));

    const peers = await io.in(mapRoom(workspaceId)).fetchSockets();
    const stillThere = peers.some((s) => s.data?.mapUserId === userId);
    socket.data.mapUserId = undefined;
    if (!stillThere) {
      await redisClient.hdel(presenceKey(workspaceId), userId);
      io.to(mapRoom(workspaceId)).emit("user-left", { userId });
    }
  };

  const sendSync = async () => {
    if (!mapWorkspaceId) return;
    const users = await getMapUsers(mapWorkspaceId);
    socket.emit("presence-sync", users);
  };

  socket.on("join", async (payload: any = {}) => {
    try {
      const user = await resolveUser(socket);
      const workspaceId = String(payload.workspaceId || "");
      if (!user || !workspaceId) return;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return socket.emit("error", "Workspace not found");
      const userId = String(user._id);
      const isMember =
        workspace.members.map((m: any) => String(m)).includes(userId) ||
        String(workspace.manager) === userId;
      if (!isMember) return socket.emit("error", "Not a member of workspace");

      if (mapWorkspaceId && mapWorkspaceId !== workspaceId) await leaveMap();

      mapWorkspaceId = workspaceId;
      socket.data.mapUserId = userId;
      mapUser = {
        userId,
        displayName:
          payload.displayName || user.fullName || user.username || `User-${userId.slice(0, 6)}`,
        avatar: payload.avatar || user.avatar || "",
        x: clamp(payload.x, 60),
        y: clamp(payload.y, 60),
        ts: Date.now(),
      };

      socket.join(mapRoom(workspaceId));
      await redisClient.hset(presenceKey(workspaceId), userId, JSON.stringify(mapUser));

      socket.emit("join-ack", { userId });
      await sendSync();
      socket.to(mapRoom(workspaceId)).emit("user-joined", mapUser);
    } catch (err: any) {
      console.warn("Map presence join error:", err.message);
    }
  });

  socket.on("get_map_presence", () => {
    sendSync().catch((e) => console.warn("Map presence sync error:", e.message));
  });

  socket.on("move", async (payload: any = {}) => {
    if (!mapWorkspaceId || !mapUser) return;
    try {
      mapUser = {
        ...mapUser,
        displayName: payload.displayName || mapUser.displayName,
        avatar: payload.avatar || mapUser.avatar,
        x: clamp(payload.x, mapUser.x),
        y: clamp(payload.y, mapUser.y),
        ts: Date.now(),
      };
      await redisClient.hset(
        presenceKey(mapWorkspaceId),
        mapUser.userId,
        JSON.stringify(mapUser)
      );
      socket.to(mapRoom(mapWorkspaceId)).emit("user-moved", mapUser);
    } catch (err: any) {
      console.warn("Map presence move error:", err.message);
    }
  });

  socket.on("leave", () => {
    leaveMap().catch((e) => console.warn("Map presence leave error:", e.message));
  });

  socket.on("disconnect", () => {
    leaveMap().catch((e) => console.warn("Map presence disconnect error:", e.message));
  });
};
