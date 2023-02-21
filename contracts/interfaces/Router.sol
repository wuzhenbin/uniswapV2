// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.10;

interface IuniswapV2Router {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) external returns (uint256, uint256, uint256);
}
