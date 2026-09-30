/**
 * Scripts run outside Next.js, so they must load .env.local themselves.
 * Import this file FIRST in every script.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true }); // fall back to .env if present
