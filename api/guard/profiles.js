import { handleGuardProfiles } from "../../lib/guard.js";

export default function handler(req, res) {
  return handleGuardProfiles(req, res);
}
