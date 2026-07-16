// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Launchpad.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // NOTE: These addresses must be updated with the actual UniswapV2Router02 and UniswapV2Factory 
        // for the target chain (e.g. Base or Robinhood Chain).
        // Using placeholder zero addresses to allow compilation.
        address uniswapRouter = 0x0000000000000000000000000000000000000000;
        address uniswapFactory = 0x0000000000000000000000000000000000000000;

        // Base mainnet Uniswap V2 (BaseSwap / SushiSwap etc)
        if (block.chainid == 8453) {
            // Example BaseSwap Router
            uniswapRouter = 0x327Df1E6de05895d2ab08513aaDD9313Fe505d86;
            uniswapFactory = 0xF9ad37243cE03a2A88a10123Eb79930AEEf8821B;
        }

        require(uniswapRouter != address(0), "Uniswap Router not set for this chain");

        Launchpad launchpad = new Launchpad(uniswapRouter, uniswapFactory);

        console.log("Launchpad deployed at:", address(launchpad));

        vm.stopBroadcast();
    }
}
