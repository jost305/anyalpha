/**
 * Deploy Launchpad.sol to Robinhood Chain Testnet
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network robinhood_testnet
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY must be set in ../../.env.local
 *   - The deployer account must have testnet ETH on Robinhood Chain (chain 46630)
 */
import hre from "hardhat";

// Uniswap V2 addresses on Robinhood Chain (mainnet addresses — on testnet
// these may not exist yet, so we deploy with the mainnet addresses and the
// graduation feature simply won't work until a real DEX is available on
// testnet. The bonding-curve trading works independently.)
const UNISWAP_V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const UNISWAP_V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=== Launchpad Deployment ===");
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error(
      "Deployer has zero balance. Fund this wallet with testnet ETH first."
    );
  }

  // Deploy Launchpad
  console.log("\nDeploying Launchpad...");
  const Launchpad = await hre.ethers.getContractFactory("Launchpad");
  const launchpad = await Launchpad.deploy(
    UNISWAP_V2_ROUTER,
    UNISWAP_V2_FACTORY
  );

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
  console.log(
    "Update the following files with the deployed address:"
  );
  console.log("  1. artifacts/bantah/src/components/pages/launcher-page.tsx");
  console.log(
    "  2. artifacts/bantah/src/components/pages/launcher-trade-page.tsx"
  );
  console.log(
    "  3. artifacts/api-server/src/lib/launchpad/indexer-worker.ts"
  );
  console.log("  4. .env.local  ->  LAUNCHPAD_ADDRESS=" + launchpadAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
