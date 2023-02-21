// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import "solmate/src/tokens/ERC20.sol";

contract UniswapV2ERC20 is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol, 18) {}

    function mint(uint256 _amount) public {
        _mint(msg.sender, _amount);
    }
}
