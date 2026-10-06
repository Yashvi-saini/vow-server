import { Server, Socket } from "socket.io";
import DirectMessage from "../models/directMessage";
import Workspace from "../models/workspace";
import { verifySocketToken, getTokenFromSocket } from "./auth";
import {
  trackUserConnection,
  trackUserWorkspaceJoin,
  trackUserWorkspaceLeave,
} from "./presenceTracker";

export default async function dmSocket(io: Server, socket: Socket) {
  try {
    const token =
      getTokenFromSocket(socket) ||
      (socket.handshake.auth && (socket.handshake.auth as any).token);

    const user = (await verifySocketToken(token)) as any;
    (socket as any).user = user;
    socket.join(`user:${user._id}`);
    trackUserConnection(io, socket, String(user._id));

    socket.on("join_workspace", async (workspaceId: string) => {
      try {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace)
          return socket.emit("error", "Workspace not found");

        const isMember =
          workspace.members.map((m) => String(m)).includes(String(user._id)) ||
          String(workspace.manager) === String(user._id);
        if (!isMember)
          return socket.emit("error", "Not a member of workspace");

        socket.join(`workspace:${workspaceId}`);
        trackUserWorkspaceJoin(io, socket, String(user._id), workspaceId);
        socket.emit("joined_workspace", workspaceId);
      } catch (err: any) {
        socket.emit("error", err.message || "Failed to join workspace");
      }
    });

    socket.on("leave_workspace", (workspaceId: string) => {
      try {
        socket.leave(`workspace:${workspaceId}`);
        trackUserWorkspaceLeave(io, socket, String(user._id), workspaceId);
        socket.emit("left_workspace", workspaceId);
      } catch (err: any) {
        console.warn("leave_workspace error:", err.message);
      }
    });

    socket.on(
      "send_dm",
      async (payload: {
        receiverId: string;
        workspaceId: string;
        content: string;
        attachments?: { url: string; filename?: string }[];
      }) => {
        try {
          const { receiverId, workspaceId, content, attachments } = payload;

          if (!receiverId || !workspaceId || (!content && (!attachments || attachments.length === 0)))
            return socket.emit("error", "Missing DM data");

          const workspace = await Workspace.findById(workspaceId);
          if (!workspace)
            return socket.emit("error", "Workspace not found");

          const isSenderMember =
            workspace.members.map((m) => String(m)).includes(String(user._id)) ||
            String(workspace.manager) === String(user._id);

          const isReceiverMember =
            workspace.members.map((m) => String(m)).includes(String(receiverId)) ||
            String(workspace.manager) === String(receiverId);

          if (!isSenderMember || !isReceiverMember) {
            return socket.emit("error", "Both users must belong to workspace");
          }

          const message = await DirectMessage.create({
            sender: user._id,
            receiver: receiverId,
            workspaceId,
            content: content || "",
            attachments: attachments || [],
          });

          const populated = await DirectMessage.findById(message._id)
            .populate("sender", "username avatar")
            .populate("receiver", "username avatar");

          const dmRoom = getDMRoomId(user._id.toString(), receiverId.toString());

          socket.join(dmRoom);
          io.to(`user:${receiverId}`).socketsJoin(dmRoom);

          io.to(dmRoom)
            .to(`user:${receiverId}`)
            .to(`user:${user._id}`)
            .emit("receive_dm", populated);

        } catch (err: any) {
          socket.emit("error", err.message || "Send DM failed");
        }
      }
    );

    const handleDMReaction = async (payload: { messageId: string; emoji: string; receiverId?: string }) => {
      try {
        const { messageId, emoji } = payload;
        if (!messageId || !emoji) return;

        const message = await DirectMessage.findById(messageId);
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

        const senderStr = String(message.sender);
        const receiverStr = String(message.receiver);
        const otherUserId = senderStr === userIdStr ? receiverStr : senderStr;
        const dmRoom = getDMRoomId(userIdStr, otherUserId);

        const eventPayload = {
          messageId: String(message._id),
          reactions: message.reactions,
        };

        io.to(dmRoom)
          .to(`user:${userIdStr}`)
          .to(`user:${otherUserId}`)
          .emit("dm_reaction_updated", eventPayload);
      } catch (err: any) {
        socket.emit("error", err.message || "Failed to update DM reaction");
      }
    };

    socket.on("react_dm", handleDMReaction);
    socket.on("dm_reaction", handleDMReaction);

    socket.on("dm_typing", (receiverId: string) => {
      io.to(`user:${receiverId}`).emit("dm_user_typing", {
        userId: user._id,
      });
    });
    socket.on("dm_stop_typing", (receiverId: string) => {
      io.to(`user:${receiverId}`).emit("dm_user_stop_typing", {
        userId: user._id,
      });
    });

    socket.on("disconnect", () => {
    });
  } catch (err: any) {
    console.warn("DM socket authentication warning:", err.message);
  }
}


function getDMRoomId(userA: string, userB: string): string {
  return `dm:${[userA, userB].sort().join(":")}`;
}
