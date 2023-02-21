// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/Factory.sol";
import "./interfaces/Pair.sol";
import "./Library.sol";
import "hardhat/console.sol";

error InsufficientAAmount();
error InsufficientBAmount();
error SafeTransferFailed();
error ExcessiveInputAmount();
error InsufficientOutputAmount();

contract uniswapV2Router {
    IuniswapV2Factory factory;

    constructor(address factoryAddress) {
        factory = IuniswapV2Factory(factoryAddress);
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                from,
                to,
                value
            )
        );

        if (!success || (data.length != 0 && !abi.decode(data, (bool))))
            revert SafeTransferFailed();
    }

    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address token0, ) = uniswapV2Library.sortTokens(
                path[i],
                path[i + 1]
            );
            (uint256 amount0Out, uint256 amount1Out) = path[i] == token0
                ? (uint256(0), amounts[i + 1])
                : (amounts[i + 1], uint256(0));

            address to;
            if (i < path.length - 2) {
                to = uniswapV2Library.pairFor(
                    address(factory),
                    path[i + 1],
                    path[i + 2]
                );
            } else {
                to = _to;
            }

            IuniswapV2Pair(
                uniswapV2Library.pairFor(address(factory), path[i], path[i + 1])
            ).swapFlashLoans(amount0Out, amount1Out, to, "");
        }
    }

    // 链式交易
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) public returns (uint256[] memory amounts) {
        // In the function, we begin with pre-calculating all output amounts along the path
        amounts = uniswapV2Library.getAmountsOut(
            address(factory),
            amountIn,
            path
        );
        // 链式交换得到最后的数量就是我们的目标数量 不能小于最小要求
        if (amounts[amounts.length - 1] < amountOutMin)
            revert InsufficientOutputAmount();
        // 将token转入目标pair合约中 path第一个值是投入的币 最后的值是目标兑换的币
        _safeTransferFrom(
            path[0],
            msg.sender,
            uniswapV2Library.pairFor(address(factory), path[0], path[1]),
            amounts[0]
        );

        // 执行链式交换
        _swap(amounts, path, to);
    }

    // 反向链式交易
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to
    ) public returns (uint256[] memory amounts) {
        amounts = uniswapV2Library.getAmountsIn(
            address(factory),
            amountOut,
            path
        );
        //  链式交换得到最后的数量就是我们的目标数量 小于等于我们要求的值
        if (amounts[amounts.length - 1] > amountInMax)
            revert ExcessiveInputAmount();

        _safeTransferFrom(
            path[0],
            msg.sender,
            uniswapV2Library.pairFor(address(factory), path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, to);
    }

    function addLiquidity(
        // 配对的两个代币
        address tokenA,
        address tokenB,
        // 预期支付的两个代币的数量
        uint256 amountADesired,
        uint256 amountBDesired,
        // 可接受的最小成交数量
        uint256 amountAMin,
        uint256 amountBMin,
        // 接收流动性代币的地址
        address to
    ) public returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        // 没有合约就进行创建
        if (factory.pairs(tokenA, tokenB) == address(0)) {
            factory.createPair(tokenA, tokenB);
        }

        // 计算将存入的金额
        (amountA, amountB) = _calculateLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );
        // 计算交易对合约地址
        address pairAddress = uniswapV2Library.pairFor(
            address(factory),
            tokenA,
            tokenB
        );
        // 将用户的token转移到合约
        _safeTransferFrom(tokenA, msg.sender, pairAddress, amountA);
        _safeTransferFrom(tokenB, msg.sender, pairAddress, amountB);

        // 铸造LP
        liquidity = IuniswapV2Pair(pairAddress).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) public returns (uint256 amountA, uint256 amountB) {
        // 计算交易对合约地址
        address pair = uniswapV2Library.pairFor(
            address(factory),
            tokenA,
            tokenB
        );
        // 将 LP 代币授权发送给该pair合约并销毁确切数量的代币 这里用户需要授权给路由合约进行操作
        IuniswapV2Pair(pair).transferFrom(msg.sender, pair, liquidity);
        (amountA, amountB) = IuniswapV2Pair(pair).burn(to);

        // 检查返回的金额是否在用户选择的可容忍滑点范围内
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountA < amountBMin) revert InsufficientBAmount();
    }

    // 找到满足所需和最小金额的流动性金额
    function _calculateLiquidity(
        // 配对的两个代币
        address tokenA,
        address tokenB,
        // 预期支付的两个代币的数量
        uint256 amountADesired,
        uint256 amountBDesired,
        // 可接受的最小成交数量
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        // 计算最佳流动性金额

        // 获取流动池储备量
        (uint256 reserveA, uint256 reserveB) = uniswapV2Library.getReserves(
            address(factory),
            tokenA,
            tokenB
        );

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            // 输出等比例的tokenB数量
            uint256 amountBOptimal = uniswapV2Library.quote(
                // amountIn
                amountADesired,
                // reserveIn
                reserveA,
                // reserveOut
                reserveB
            );
            // B数量不能超过预期支付
            if (amountBOptimal <= amountBDesired) {
                // B数量输出要大于最小要求
                if (amountBOptimal <= amountBMin) revert InsufficientBAmount();
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = uniswapV2Library.quote(
                    // amountIn
                    amountBDesired,
                    // reserveIn
                    reserveB,
                    // reserveOut
                    reserveA
                );
                // A数量不能超过预期支付
                assert(amountAOptimal <= amountADesired);
                // A数量输出要大于最小要求
                if (amountAOptimal <= amountAMin) revert InsufficientAAmount();
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
}
