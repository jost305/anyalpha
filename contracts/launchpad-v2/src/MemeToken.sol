// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MemeToken is ERC20 {
    address public launchpad;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address _launchpad
    ) ERC20(name, symbol) {
        launchpad = _launchpad;
        _mint(_launchpad, totalSupply);
    }
}
