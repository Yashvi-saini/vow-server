import jwt from "jsonwebtoken";
import UserModel from "../models/user";
import { Socket } from "socket.io";
import cookie from "cookie";

export interface DecodedToken {
  _id: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export const verifySocketToken = async (token?: string) => {
  if (!token) throw new Error("No token provided");
  let cleanToken = token.trim();
  if (cleanToken.startsWith("Bearer ")) cleanToken = cleanToken.slice(7).trim();

  const accessSecret = (process.env.ACCESS_TOKEN_SECRET || process.env.JWT_ACCESS_SECRET) as string;
  const decoded = jwt.verify(
    cleanToken,
    accessSecret
  ) as DecodedToken;
  if (!decoded?._id) throw new Error("Invalid token");
  const user = await UserModel.findById(decoded._id).select(
    "-password -refreshToken"
  );
  if (!user) throw new Error("User not found");
  return user;
};

export const getTokenFromSocket = (socket: Socket): string | undefined => {
  let authToken = socket.handshake.auth?.token as string | undefined;
  if (authToken) {
    let clean = authToken.trim();
    if (clean.startsWith("Bearer ")) clean = clean.slice(7).trim();
    return clean;
  }

  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = cookie.parse(cookieHeader);
  let token =
    cookies.accessToken ||
    cookies.Authorization ||
    cookies.token ||
    cookies.jwt ||
    undefined;

  if (!token) return undefined;
  if (token.startsWith("Bearer ")) token = token.slice(7).trim();

  return token;
};