import "dotenv/config";
import { getDb } from "../../lib/db/src/index";
import { launchpadTokensTable } from "../../lib/db/src/schema/index";
import { eq } from "drizzle-orm";

async function run() {
  const { db } = await getDb();
  await db.update(launchpadTokensTable)
    .set({ devAddress: "0x13D7897E6E238595e56e27fBF40a16Aa011339a7".toLowerCase() })
    .where(eq(launchpadTokensTable.devAddress, "0x0000000000000000000000000000000000000000"));
  console.log("Updated dev addresses!");
  process.exit(0);
}

run().catch(console.error);
