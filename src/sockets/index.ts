import { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import chatSocket from "./chatSocket";
import { setupPresenceSocket } from "./presenceSocket";

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
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/+$/, "");
        if (
          allowedOrigins.includes(cleanOrigin) ||
          cleanOrigin.endsWith(".vercel.app") ||
          cleanOrigin.includes("localhost") ||
          cleanOrigin.includes("127.0.0.1")
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type"],
    },
    transports: ["websocket"],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    cookie: true,
    allowEIO3: true,
  });

  io.on("connection", (socket) => {
    console.log("Socket user connected:", socket.id);
    
    // Initialize socket modules
    chatSocket(io, socket);
    setupPresenceSocket(io, socket);

    socket.on("disconnect", (reason) => {
      console.log("Socket user disconnected:", socket.id, "Reason:", reason);
    });

    // Optional: handle individual socket errors
    socket.on("error", (error) => {
      console.error("Socket error:", socket.id, error);
    });
  });

  console.log("Socket.IO initialized with chat and presence modules");

  return io;
};