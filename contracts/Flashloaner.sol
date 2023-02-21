// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import "hardhat/console.sol";
import "./Pair.sol";
import "./ERC20.sol";

error InsufficientFlashLoanAmount();

contract Flashloaner {
    uint256 expectedLoanAmount;

    function flashloan(
        address pairAddress,
        uint256 amount0Out,
        uint256 amount1Out,
        address tokenAddress
    ) public {
        if (amount0Out > 0) {
            expectedLoanAmount = amount0Out;
        }
        if (amount1Out > 0) {
            expectedLoanAmount = amount1Out;
        }
        // 向pair合约借钱
        uniswapV2Pair(pairAddress).swapFlashLoans(
            amount0Out,
            amount1Out,
            address(this),
            abi.encode(tokenAddress)
        );
    }

    function uniswapV2Call(
        address /* sender */,
        uint256 /* amount0Out */,
        uint256 /* amount1Out */,
        bytes calldata data
    ) public {
        address tokenAddress = abi.decode(data, (address));
        uint256 balance = ERC20(tokenAddress).balanceOf(address(this));
        // 检查借到的钱有没有到位
        if (balance < expectedLoanAmount) revert InsufficientFlashLoanAmount();
        // 这里直接把钱还回去了(还包括手续费)
        UniswapV2ERC20(tokenAddress).transfer(msg.sender, balance);
    }
}
