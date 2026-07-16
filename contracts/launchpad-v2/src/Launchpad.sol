// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MemeToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IUniswapV2Router02 {
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

contract Launchpad is Ownable {
    uint256 public constant INITIAL_VIRTUAL_ETH = 1 ether;
    uint256 public constant INITIAL_VIRTUAL_TOKEN = 1_000_000_000 ether;
    uint256 public constant GRADUATION_THRESHOLD = 24 ether; // ~24 ETH
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public feeRate = 100; // 1% fee

    address public uniswapRouter;
    address public uniswapFactory;

    struct TokenState {
        address tokenAddress;
        uint256 virtualEthReserve;
        uint256 virtualTokenReserve;
        uint256 realEthReserve;
        bool graduated;
    }

    mapping(address => TokenState) public tokenStates;
    address[] public allTokens;

    event TokenCreated(address indexed tokenAddress, string name, string symbol, string uri);
    event Trade(address indexed token, address indexed user, uint256 ethAmount, uint256 tokenAmount, bool isBuy);
    event Graduated(address indexed token, address pair, uint256 ethAmount, uint256 tokenAmount);

    constructor(address _uniswapRouter, address _uniswapFactory) Ownable(msg.sender) {
        uniswapRouter = _uniswapRouter;
        uniswapFactory = _uniswapFactory;
    }

    function createToken(string memory name, string memory symbol, string memory uri) external returns (address) {
        MemeToken newToken = new MemeToken(name, symbol, INITIAL_VIRTUAL_TOKEN, address(this));
        
        tokenStates[address(newToken)] = TokenState({
            tokenAddress: address(newToken),
            virtualEthReserve: INITIAL_VIRTUAL_ETH,
            virtualTokenReserve: INITIAL_VIRTUAL_TOKEN,
            realEthReserve: 0,
            graduated: false
        });
        
        allTokens.push(address(newToken));
        emit TokenCreated(address(newToken), name, symbol, uri);
        
        return address(newToken);
    }

    function buy(address token, uint256 minTokensOut) external payable {
        TokenState storage state = tokenStates[token];
        require(state.tokenAddress != address(0), "Token not found");
        require(!state.graduated, "Already graduated");
        require(msg.value > 0, "Must send ETH");

        uint256 fee = (msg.value * feeRate) / FEE_DENOMINATOR;
        uint256 ethForTokens = msg.value - fee;

        uint256 k = state.virtualEthReserve * state.virtualTokenReserve;
        uint256 newVirtualEth = state.virtualEthReserve + ethForTokens;
        uint256 newVirtualToken = k / newVirtualEth;
        uint256 tokensOut = state.virtualTokenReserve - newVirtualToken;

        require(tokensOut >= minTokensOut, "Slippage tolerance exceeded");

        state.virtualEthReserve = newVirtualEth;
        state.virtualTokenReserve = newVirtualToken;
        state.realEthReserve += ethForTokens;

        MemeToken(token).transfer(msg.sender, tokensOut);
        
        emit Trade(token, msg.sender, msg.value, tokensOut, true);

        if (state.realEthReserve >= GRADUATION_THRESHOLD) {
            _graduate(token);
        }
    }

    function sell(address token, uint256 tokenAmount, uint256 minEthOut) external {
        TokenState storage state = tokenStates[token];
        require(state.tokenAddress != address(0), "Token not found");
        require(!state.graduated, "Already graduated");
        require(tokenAmount > 0, "Must sell tokens");

        MemeToken(token).transferFrom(msg.sender, address(this), tokenAmount);

        uint256 k = state.virtualEthReserve * state.virtualTokenReserve;
        uint256 newVirtualToken = state.virtualTokenReserve + tokenAmount;
        uint256 newVirtualEth = k / newVirtualToken;
        uint256 ethOut = state.virtualEthReserve - newVirtualEth;

        uint256 fee = (ethOut * feeRate) / FEE_DENOMINATOR;
        uint256 ethToUser = ethOut - fee;

        require(ethToUser >= minEthOut, "Slippage tolerance exceeded");
        require(state.realEthReserve >= ethOut, "Insufficient real ETH liquidity");

        state.virtualEthReserve = newVirtualEth;
        state.virtualTokenReserve = newVirtualToken;
        state.realEthReserve -= ethOut;

        (bool success, ) = msg.sender.call{value: ethToUser}("");
        require(success, "ETH transfer failed");

        emit Trade(token, msg.sender, ethToUser, tokenAmount, false);
    }

    function _graduate(address token) internal {
        TokenState storage state = tokenStates[token];
        state.graduated = true;

        uint256 ethLiquidity = state.realEthReserve;
        uint256 tokenLiquidity = MemeToken(token).balanceOf(address(this));

        MemeToken(token).approve(uniswapRouter, tokenLiquidity);

        IUniswapV2Router02(uniswapRouter).addLiquidityETH{value: ethLiquidity}(
            token,
            tokenLiquidity,
            0,
            0,
            address(0xdead), // burn LP tokens
            block.timestamp
        );

        emit Graduated(token, address(0), ethLiquidity, tokenLiquidity);
    }

    // Owner functions
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        for (uint256 i = 0; i < allTokens.length; i++) {
            balance -= tokenStates[allTokens[i]].realEthReserve;
        }
        (bool success, ) = msg.sender.call{value: balance}("");
        require(success, "Withdraw failed");
    }

    function setFeeRate(uint256 _rate) external onlyOwner {
        require(_rate <= 500, "Max fee 5%"); // max 5%
        feeRate = _rate;
    }
}
