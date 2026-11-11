import { handleGuardValidate } from "../../lib/guard.js";

export default function handler(req, res) {
  return handleGuardValidate(req, res);
}
