import { Server, Socket } from "socket.io";
import Message from "../models/message";
import Channel from "../models/channel";
import Workspace from "../models/workspace";
import { verifySocketToken, getTokenFromSocket } from "./auth";

export default async function chatSocket(io: Server, socket: Socket) {
  try {
    const token = getTokenFromSocket(socket) || (socket.handshake.auth && (socket.handshake.auth as any).token);
    const user = await verifySocketToken(token);
    (socket as any).user = user;

    socket.join(`user:${user._id}`);

    socket.on("join_server", async (serverId: string) => {
      try {
        const server = await Workspace.findById(serverId);
        if (!server) return socket.emit("error", "Server not found");
        const isMember =
          server.members.map((m) => String(m)).includes(String(user._id)) ||
          String(server.manager) === String(user._id);
        if (isMember) {
          socket.join(`server:${serverId}`);
          socket.emit("joined_server", serverId);
        } else {
          socket.emit("error", "Not a member of server");
        }
      } catch (err: any) {
        socket.emit("error", err.message || "Failed to join server");
      }
    });

    socket.on("join_channel", async (channelId: string) => {
      try {
        const channel = await Channel.findById(channelId);
        if (!channel) return socket.emit("error", "Channel not found");
        socket.join(`channel:${channelId}`);
        socket.emit("joined_channel", channelId);
      } catch (err: any) {
        socket.emit("error", err.message || "Failed to join channel");
      }
    });

    socket.on("send_message", async (payload: { channelId: string; content: string; attachments?: any[] }) => {
      try {
        const { channelId, content, attachments } = payload;
        // basic validation
        if ((attachments?.length === 0 || !attachments) && (!content || content.trim() === "")) {
          return socket.emit("error", "Message content is required");
        }
        if (!channelId) {
          return socket.emit("error", "Channel ID is required");
        }

        const channel = await Channel.findById(channelId);
        if (!channel) return socket.emit("error", "Channel not found");

        // create message
        const message = await Message.create({
          channelId,
          sender: (socket as any).user._id,
          content: content || "",
          attachments: attachments || [],
        });

        const populated = await Message.findById(message._id).populate("sender", "username avatar");

        // emit to everyone in channel
        io.to(`channel:${channelId}`).emit("receive_message", populated);
      } catch (err: any) {
        socket.emit("error", err.message || "Send message failed");
      }
    });

    socket.on("typing", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("user_typing", { userId: user._id });
    });

    socket.on("stop_typing", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("user_stop_typing", { userId: user._id });
    });

    const handleChannelReaction = async (payload: { messageId: string; channelId?: string; emoji: string }) => {
      try {
        const { messageId, channelId, emoji } = payload;
        if (!messageId || !emoji) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        if (!message.reactions) {
          message.reactions = [];
        }

        const userIdStr = String(user._id);
        const reactionIndex = message.reactions.findIndex((r) => r.emoji === emoji);

        if (reactionIndex > -1) {
          const userIdx = message.reactions[reactionIndex].users.findIndex(
            (u) => String(u) === userIdStr
          );
          if (userIdx > -1) {
            // Already reacted: toggle off
            message.reactions[reactionIndex].users.splice(userIdx, 1);
            if (message.reactions[reactionIndex].users.length === 0) {
              message.reactions.splice(reactionIndex, 1);
            }
          } else {
            // Add user to existing emoji
            message.reactions[reactionIndex].users.push(user._id);
          }
        } else {
          // Add new emoji reaction
          message.reactions.push({ emoji, users: [user._id] });
        }

        await message.save();

        const targetChannelId = channelId || String(message.channelId);
        io.to(`channel:${targetChannelId}`).emit("message_reaction_updated", {
          messageId: String(message._id),
          channelId: targetChannelId,
          reactions: message.reactions,
        });
      } catch (err: any) {
        socket.emit("error", err.message || "Failed to update reaction");
      }
    };

    socket.on("react_message", handleChannelReaction);
    socket.on("message_reaction", handleChannelReaction);


    // leave channel
    socket.on("leave_channel", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
      socket.emit("left_channel", channelId);
    });

    socket.on("disconnect", () => {
    });
  } catch (err: any) {
    console.warn("Chat socket authentication warning:", err.message);
  }
}