import { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import chatSocket from "./chatSocket";
import dmSocket from "./dmSocket";
import { setupPresenceSocket } from "./presenceSocket";
import { getTokenFromSocket, verifySocketToken } from "./auth";
import {
  trackUserConnection,
  trackUserDisconnect,
  setupPresenceTracker,
} from "./presenceTracker";

export const initSocket = (server: HttpServer) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/+$/, "") : null,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean) as string[];

  const io = new IOServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
  },
  transports: ["websocket", "polling"],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: true,
  allowEIO3: true
});

  io.on("connection", async (socket) => {

    try {
      const token =
        getTokenFromSocket(socket) ||
        (socket.handshake.auth && (socket.handshake.auth as any).token);
      if (token) {
        const user = await verifySocketToken(token);
        (socket as any).user = user;
        trackUserConnection(io, socket, String(user._id));
      }
    } catch (e: any) {
      console.warn("Socket user auth warning on connection:", e.message);
    }

    // Set up presence tracker listeners
    setupPresenceTracker(io, socket);

    // Initialize socket modules
    chatSocket(io, socket);
    dmSocket(io, socket);
    setupPresenceSocket(io, socket);

    socket.on("disconnect", (reason) => {
      trackUserDisconnect(io, socket);
    });

    // Optional: handle individual socket errors
    socket.on("error", (error) => {
      console.error("Socket error:", socket.id, error);
    });
  });


  return io;
};