# anyAlpha Launchpad V2

This project contains the Uniswap V2-based bonding curve contracts for the anyAlpha EVM launchpad.

## Architecture

- **`MemeToken.sol`**: A standard non-mintable ERC20 token that allocates its total supply to the Launchpad upon creation.
- **`Launchpad.sol`**: The bonding curve AMM. Uses virtual reserves to simulate a constant product curve (`x*y=k`) until the `GRADUATION_THRESHOLD` (e.g. 24 ETH) is reached, at which point it automatically deposits all liquidity into a Uniswap V2 Router and burns the LP tokens.

## Setup

This project uses [Foundry](https://book.getfoundry.sh/).

To compile the contracts, first install the dependencies:
```bash
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

Then compile:
```bash
forge build
```

## Deployment

Deployment scripts target the RPC endpoints specified in `foundry.toml`.

To deploy to Robinhood Testnet:
```bash
forge script script/Deploy.s.sol:DeployScript --rpc-url robinhood_testnet --broadcast --private-key <YOUR_PRIVATE_KEY>
```
