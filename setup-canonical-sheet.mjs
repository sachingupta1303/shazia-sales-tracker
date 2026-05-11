import { google } from "googleapis";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function setupCanonicalSheet() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.CANONICAL_BUYER_MAP_SHEET_ID || process.env.SALES_TRACKING_SHEET_ID;

    if (!spreadsheetId) {
      console.error("No spreadsheet ID found in .env.local");
      return;
    }

    const sheetName = "CANONICAL_BUYER_MASTER";

    // Check if sheet exists, if not create it
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === sheetName);

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
      console.log(`Sheet "${sheetName}" created.`);
    }

    // Set Headers
    const headers = [
      "canonicalBuyerCode",
      "Buyer Name",
      "Country",
      "Sales Person",
      "Segment",
      "isKeyAccount",
      "Target Containers",
      "Sales Coordinator",
      "Notes"
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:I1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });

    console.log("Headers updated successfully!");
  } catch (error) {
    console.error("Error setting up sheet:", error.message);
  }
}

setupCanonicalSheet();
