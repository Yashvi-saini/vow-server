import express from "express";
import {
  renameTeam,
  removeMember,
  getAllTeams,
  getTeamMembers,
  addMembers,
} from "../controllers/teamControllers";
import { verifyWorkspaceAccess } from "../middlewares/workspace.middleware";  
import { validate} from "../middlewares/validate";
import { renameTeamSchema } from "../schemas/team";
const superviserRouter = express.Router();

superviserRouter.get("/team/members/:teamId",getTeamMembers);
superviserRouter.get("/team/all/:workspaceId",verifyWorkspaceAccess,getAllTeams);
superviserRouter.put("/team/rename/:workspaceId/:teamId",validate(renameTeamSchema), verifyWorkspaceAccess, renameTeam);
superviserRouter.put("/team/remove-member/:workspaceId/:teamId", verifyWorkspaceAccess, removeMember);
superviserRouter.put("/team/add-members/:workspaceId/:teamId", verifyWorkspaceAccess, addMembers);

export default superviserRouter;
