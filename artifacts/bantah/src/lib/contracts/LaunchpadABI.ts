export const LaunchpadABI = [
  {
    "type": "function",
    "name": "createToken",
    "inputs": [
      { "name": "name", "type": "string", "internalType": "string" },
      { "name": "symbol", "type": "string", "internalType": "string" },
      { "name": "uri", "type": "string", "internalType": "string" }
    ],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "buy",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" },
      { "name": "minTokensOut", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "sell",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" },
      { "name": "tokenAmount", "type": "uint256", "internalType": "uint256" },
      { "name": "minEthOut", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tokenStates",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [
      { "name": "tokenAddress", "type": "address", "internalType": "address" },
      { "name": "virtualEthReserve", "type": "uint256", "internalType": "uint256" },
      { "name": "virtualTokenReserve", "type": "uint256", "internalType": "uint256" },
      { "name": "realEthReserve", "type": "uint256", "internalType": "uint256" },
      { "name": "graduated", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "TokenCreated",
    "inputs": [
      { "name": "tokenAddress", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "name", "type": "string", "indexed": false, "internalType": "string" },
      { "name": "symbol", "type": "string", "indexed": false, "internalType": "string" },
      { "name": "uri", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Trade",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "ethAmount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "tokenAmount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "isBuy", "type": "bool", "indexed": false, "internalType": "bool" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Graduated",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "pair", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "ethAmount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "tokenAmount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;
