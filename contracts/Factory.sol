// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./Pair.sol";

error IdenticalAddresses();
error PairExists();
error ZeroAddress();

contract uniswapV2Factory {
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256
    );

    mapping(address => mapping(address => address)) public pairs;
    address[] public allPairs;

    function createPair(
        address tokenA,
        address tokenB
    ) public returns (address pair) {
        // 不允许具有相同标记的配对 这里不校验token的合法性 由上游进行erc20合法性校验
        if (tokenA == tokenB) revert IdenticalAddresses();

        // 对代币地址进行排序——这对于避免重复很重要(配对合约允许双向交换)
        // 此外，配对token地址用于生成配对地址
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        if (token0 == address(0)) revert ZeroAddress();

        // 已经存在的不创建
        if (pairs[token0][token1] != address(0)) revert PairExists();

        // create2创建有确定性地址的合约
        bytes memory bytecode = type(uniswapV2Pair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }

        // 调用合约需要interface
        uniswapV2Pair(pair).initialize(token0, token1);

        pairs[token0][token1] = pair;
        pairs[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
