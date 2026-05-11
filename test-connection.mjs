import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  try {
    console.log("Testing Google Sheets connection...");
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").replace(/^"(.*)"$/, '$1');
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SALES_TRACKING_SHEET_ID;
    
    console.log("Fetching spreadsheet metadata for:", spreadsheetId);
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    console.log("Success! Spreadsheet title:", res.data.properties?.title);
    
    console.log("Checking for 'Credential' sheet...");
    const sheet = res.data.sheets?.find(s => s.properties?.title === "Credential");
    if (sheet) {
      console.log("'Credential' sheet found.");
    } else {
      console.log("'Credential' sheet NOT found.");
    }
  } catch (err) {
    console.error("Connection test failed!");
    console.error(err);
  }
}

test();
