import { google } from "googleapis";
import { getAuthClient } from "../auth/service-account.js";


// Global retry/backoff for transient Google API failures (429 / 5xx).
google.options({
  retryConfig: {
    statusCodesToRetry: [[429, 429], [500, 599]],
    retry: 4,
    retryDelay: 1000,
    httpMethodsToRetry: ["GET", "POST"],
  },
});

export async function getDataClient() {
  const auth = await getAuthClient();
  return google.analyticsdata({
    version: "v1beta",
    auth,
  });
}

export async function getAdminClient() {
  const auth = await getAuthClient();
  return google.analyticsadmin({
    version: "v1beta",
    auth,
  });
}
