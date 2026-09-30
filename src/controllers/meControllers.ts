import { Request, Response } from "express";
import UserModel, { IUser } from "../models/user";
import { ApiError } from "../utils/ApiError";
import fs from "fs";
import path from "path";
import {
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { s3 } from "../libs/s3";

const sanitizeUser = (userDoc: IUser) => {
  const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete user.password;
  delete user.refreshToken;
  delete user.resetOtp;
  delete user.resetOtpExpires;
  delete user.verificationCode;
  delete user.verificationCodeExpires;
  delete user.__v;
  return user;
};

 const updateProfileAndAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const { fullName, organisation, gender, dob } = req.body;

    const defaultAvatars: Record<string, string> = {
      male: "/avatars/male/avatar1.png",
      female: "/avatars/female/avatar1.png",
      other: "/avatars/other/avatar1.png",
    };

    const genderKey = gender?.toLowerCase() || "other";
    const avatarUrl = defaultAvatars[genderKey] || defaultAvatars.other;

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { fullName, organisation, gender: genderKey, dob, avatar: avatarUrl },
      { new: true }
    ).select("-password -refreshToken");

    res.status(200).json({
      success: true,
      msg: "Profile and avatar updated successfully",
      data: sanitizeUser(updatedUser as IUser),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

 const uploadProfilePhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized user");

    if (!req.file) throw new ApiError(400, "No file uploaded");

    const allowedMimeTypes =[
      "image/jpeg",
      "image/png",
      "image/svg"
    ];

if (!allowedMimeTypes.includes(req.file.mimetype)){
  fs.unlinkSync(req.file.path);
  res.status(400).json({message:"only image is used as profile photo"});
  return;
};

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname);
    const fileKey = `user-avatars/${userId}/profile-${fileExt}`;

    // Upload to S3
    const fileContent = fs.readFileSync(filePath);
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: fileKey,
      Body: fileContent,
      ContentType: req.file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    fs.unlinkSync(filePath);

    const photoUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { avatar: photoUrl },
      { new: true }
    ).select("-password -refreshToken");

    res.status(200).json({
      success: true,
      msg: "Profile photo uploaded successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      msg: "Image upload failed",
      error: error instanceof Error ? error.message : error,
    });
  }
};

const getUserProfile = async (req: Request, res: Response) :Promise<void>=> {
  try {
    const user = req.user;
    if (!user) throw new ApiError(401, "Unauthorized");

    res.status(200).json({
      success: true,
      data: sanitizeUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

export { updateProfileAndAvatar, getUserProfile ,uploadProfilePhoto};
