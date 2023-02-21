// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import "../Library.sol";
import "../interfaces/Router.sol";

// import "hardhat/console.sol";

contract LibTest {
    uint256 private reserveA;
    uint256 private reserveB;

    uint256 private amountA;
    uint256 private amountB;
    uint256 private liquidity;

    IuniswapV2Router router;

    function testReserves(
        address factoryAddress,
        address tokenA,
        address tokenB
    ) public {
        (reserveA, reserveB) = uniswapV2Library.getReserves(
            factoryAddress,
            tokenA,
            tokenB
        );
    }

    function getReserves() public view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }

    function quote(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        return uniswapV2Library.quote(amountIn, reserveIn, reserveOut);
    }

    function pairFor(
        address factoryAddress,
        address tokenA,
        address tokenB
    ) public pure returns (address pairAddress) {
        return uniswapV2Library.pairFor(factoryAddress, tokenA, tokenB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        return uniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountsOut(
        address factory,
        uint256 amountIn,
        address[] memory path
    ) public returns (uint256[] memory) {
        return uniswapV2Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        return uniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsIn(
        address factory,
        uint256 amountOut,
        address[] memory path
    ) public returns (uint256[] memory) {
        return uniswapV2Library.getAmountsIn(factory, amountOut, path);
    }
}
