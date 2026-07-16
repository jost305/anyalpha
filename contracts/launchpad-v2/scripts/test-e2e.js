import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env.local" });

const RPC_URL = "https://rpc.testnet.chain.robinhood.com/rpc";
const LAUNCHPAD_ADDRESS = "0x8058A276228f547D8d5e6B1B6A675646d2040555";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);

  const artifactPath = "./hardhat-artifacts/src/Launchpad.sol/Launchpad.json";
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const launchpad = new ethers.Contract(LAUNCHPAD_ADDRESS, artifact.abi, wallet);

  console.log("=== End-to-End Test ===");
  
  // 1. Create a new token
  console.log("1. Creating a new token...");
  const createTx = await launchpad.createToken("Test Token", "TST", "ipfs://bafkreiftest...");
  console.log("   Tx Hash:", createTx.hash);
  const receipt = await createTx.wait();
  
  // Extract token address from the TokenCreated event
  const event = receipt.logs
    .map(log => {
      try { return launchpad.interface.parseLog(log); } 
      catch (e) { return null; }
    })
    .find(e => e && e.name === "TokenCreated");
    
  if (!event) throw new Error("TokenCreated event not found!");
  const tokenAddress = event.args.tokenAddress;
  console.log("   ✅ Token Created at:", tokenAddress);

  // 2. Buy some tokens to trigger the Trade event
  console.log("\n2. Trading (Buying) tokens...");
  const buyAmount = ethers.parseEther("0.001");
  const buyTx = await launchpad.buy(tokenAddress, 0, { value: buyAmount });
  console.log("   Tx Hash:", buyTx.hash);
  await buyTx.wait();
  console.log("   ✅ Buy executed!");

  console.log("\nEnd-to-End contract interactions complete.");
  console.log("Check the API Server / Database to verify they were indexed!");
}

main().catch(console.error);
