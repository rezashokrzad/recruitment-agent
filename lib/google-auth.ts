/**
 * Google service-account authentication, shared by Sheets and Calendar.
 *
 * A service account is a "robot" Google identity. It can only see the sheet
 * and calendar that were explicitly shared with its email address.
 */
import { google } from "googleapis";
import { getEnv } from "./env";
import { singleton } from "./singleton";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar",
];

export function getGoogleAuth() {
  return singleton("googleAuth", () => {
    const env = getEnv();
    return new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: env.GOOGLE_PRIVATE_KEY,
      scopes: SCOPES,
    });
  });
}
