import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SHEETS = {
  SALES_TRACKING: process.env.SALES_TRACKING_SHEET_ID,
};

const users = [
  { name: "Mohit Gupta", email: "mohit.gupta@shaziarice.com", role: "ADMIN", password: "Mohit@2026" },
  { name: "Mohit Sharma", email: "sales2@shaziarice.com", role: "USER", password: "MohitS@2026" },
  { name: "Atif", email: "marketing@shaziarice.com", role: "ADMIN", password: "Atif@2026" },
  { name: "Anas", email: "marketing2@shaziarice.com", role: "USER", password: "Anas@2026" },
  { name: "Aameer", email: "sales4@shaziarice.com", role: "USER", password: "Aameer@2026" },
  { name: "Abid", email: "translator@shaziarice.com", role: "USER", password: "Abid@2026" },
  { name: "Vinay sharma", email: "gm@shaziarice.com", role: "ADMIN", password: "Vinay@2026" },
  { name: "shahzad", email: "translator2@shaziarice.com", role: "USER", password: "Shahzad@2026" },
  { name: "Sachin (Super Admin)", email: "research@shaziarice.com", role: "SUPER_ADMIN", password: "Sachin@2026" },
];

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = SHEETS.SALES_TRACKING;
  const sheetName = "Credential";

  try {
    // 1. Create the sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
    });
    console.log(`Created sheet: ${sheetName}`);
  } catch (err) {
    if (err.message.includes("already exists")) {
      console.log(`Sheet ${sheetName} already exists.`);
    } else {
      console.error(err);
      return;
    }
  }

  // 2. Add headers and users
  const values = [
    ["Name", "Email", "Role", "Password"],
    ...users.map((u) => [u.name, u.email, u.role, u.password]),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  console.log("Successfully populated users in Credential sheet.");
}

main();
