import express from "express";
import {
  createTeam,
  renameTeam,
  removeMember,
  assignSuperviser,
  getAllTeams,
  addMembers,
  deleteTeam,
} from "../controllers/teamControllers";
import { verifyWorkspaceAccess } from "../middlewares/workspace.middleware"; 
import { validate } from "../middlewares/validate";

import { createTeamSchema,renameTeamSchema,assignSuperviserSchema } from "../schemas/team";


const managerRouter = express.Router();

managerRouter.post("/team/create/:workspaceId",validate(createTeamSchema), verifyWorkspaceAccess, createTeam);
managerRouter.get("/team/all/:workspaceId",verifyWorkspaceAccess,getAllTeams)
managerRouter.put("/team/rename/:workspaceId/:teamId",validate(renameTeamSchema), verifyWorkspaceAccess, renameTeam);
managerRouter.put("/team/remove-member/:workspaceId/:teamId", verifyWorkspaceAccess, removeMember);
managerRouter.put("/team/assign-lead/:workspaceId/:teamId",validate(assignSuperviserSchema), verifyWorkspaceAccess, assignSuperviser);
managerRouter.put("/team/add-members/:workspaceId/:teamId", verifyWorkspaceAccess, addMembers);
managerRouter.delete("/team/:workspaceId/:teamId", verifyWorkspaceAccess, deleteTeam);

export default managerRouter;
