import { handleConfig } from "../lib/routes.js";

export default function handler(req, res) {
  return handleConfig(req, res);
}
