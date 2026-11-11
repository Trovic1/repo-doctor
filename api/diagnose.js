import { handleDiagnose } from "../lib/routes.js";

export default function handler(req, res) {
  return handleDiagnose(req, res);
}
