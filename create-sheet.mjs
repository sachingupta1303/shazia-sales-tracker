import { google } from "googleapis";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function createSheet() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SALES_TRACKING_SHEET_ID;

    if (!spreadsheetId) {
      console.error("No SALES_TRACKING_SHEET_ID found in .env.local");
      return;
    }

    // 1. Add the new sheet named "Task Allocation"
    const addSheetRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: "Task Allocation",
              },
            },
          },
        ],
      },
    });

    console.log("Sheet created successfully!");

    // 2. Add headers to the new sheet
    const headers = [
      "ID",
      "Buyer Code",
      "Buyer Name",
      "Country",
      "Title",
      "Description",
      "Task Type",
      "Assigned To",
      "Assigned Role",
      "Due Date",
      "Status",
      "Recurring Days",
      "Created By",
      "Created At",
      "Completed By",
      "Completed At"
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Task Allocation!A1:P1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [headers],
      },
    });

    console.log("Headers added successfully!");
  } catch (error) {
    console.error("Error creating sheet:", error.message);
  }
}

createSheet();
