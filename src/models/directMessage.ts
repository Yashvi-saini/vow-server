import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "./user";
import { IWorkspace } from "./workspace";

export interface IReaction {
  emoji: string;
  users: (IUser["_id"] | string)[];
}

export interface IDirectMessage extends Document {
  sender: IUser["_id"];
  receiver: IUser["_id"];
  workspaceId: IWorkspace["_id"];
  content: string;
  attachments?: { url: string; filename?: string }[];
  reactions?: IReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const directMessageSchema = new Schema<IDirectMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    content: { type: String, required: true },
    attachments: [{ url: String, filename: String }],
    reactions: [
      {
        emoji: { type: String, required: true },
        users: [{ type: Schema.Types.ObjectId, ref: "User" }],
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IDirectMessage>(
  "DirectMessage",
  directMessageSchema
);

