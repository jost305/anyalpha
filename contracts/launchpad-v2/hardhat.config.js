import HardhatEthers from "@nomicfoundation/hardhat-ethers";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env.local" });

const config = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  plugins: [HardhatEthers],
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./hardhat-artifacts",
  },
  networks: {
    robinhood_testnet: {
      type: "http",
      url: "https://rpc.testnet.chain.robinhood.com/rpc",
      chainId: 46630,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
    robinhood: {
      type: "http",
      url: "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
