/**
 * Deploy Launchpad.sol to Robinhood Chain Testnet
 *
 * Usage:
 *   node scripts/deploy-ethers.js
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY must be set in ../../.env.local
 *   - The deployer account must have testnet ETH on Robinhood Chain (chain 46630)
 */
import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env.local" });

const RPC_URL = "https://rpc.testnet.chain.robinhood.com/rpc";
const UNISWAP_V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const UNISWAP_V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("=== Launchpad Deployment ===");
  console.log("Deployer address:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("❌ Deployer has zero balance.");
    console.error(`Please fund ${wallet.address} with Robinhood testnet ETH from a faucet!`);
    process.exit(1);
  }

  // Read ABI and Bytecode from Hardhat artifacts
  const artifactPath = "./hardhat-artifacts/src/Launchpad.sol/Launchpad.json";
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  console.log("\nDeploying Launchpad...");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  const launchpad = await factory.deploy(UNISWAP_V2_ROUTER, UNISWAP_V2_FACTORY);
  await launchpad.waitForDeployment();
  
  const launchpadAddress = await launchpad.getAddress();

  console.log("\n✅ Launchpad deployed to:", launchpadAddress);
  console.log("   Router:", UNISWAP_V2_ROUTER);
  console.log("   Factory:", UNISWAP_V2_FACTORY);
  console.log(
    "   Explorer:",
    `https://explorer.testnet.chain.robinhood.com/address/${launchpadAddress}`
  );

  console.log("\n=== IMPORTANT ===");
  console.log("Update the following files with the deployed address:");
  console.log("  1. artifacts/bantah/src/components/pages/launcher-page.tsx");
  console.log("  2. artifacts/bantah/src/components/pages/launcher-trade-page.tsx");
  console.log("  3. artifacts/api-server/src/lib/launchpad/indexer-worker.ts");
  console.log("  4. .env.local  ->  LAUNCHPAD_ADDRESS=" + launchpadAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
