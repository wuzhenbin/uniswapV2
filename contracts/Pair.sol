// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import "hardhat/console.sol";
import "solmate/src/tokens/ERC20.sol";
import "./libraries/Math.sol";
import "./libraries/UQ112x112.sol";
import "./interfaces/Callee.sol";

interface IERC20 {
    function balanceOf(address) external returns (uint256);

    function transfer(address to, uint256 amount) external;
}

error InsufficientLiquidity();
error InsufficientLiquidityMinted();
error InsufficientLiquidityBurned();
error TransferFailed();
error InsufficientOutputAmount();
error InvalidK();
error BalanceOverflow();
error LOCKED();
error AlreadyInitialized();
error InsufficientInputAmount();

contract uniswapV2Pair is ERC20, Math {
    using UQ112x112 for uint224;

    // 最小流动性 = 1000
    uint public constant MINIMUM_LIQUIDITY = 1000;

    address public token0;
    address public token1;

    // 储备量
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    event Burn(address indexed sender, uint amount0, uint amount1, address to);
    event Mint(address indexed sender, uint amount0, uint amount1);
    event Sync(uint256 reserve0, uint256 reserve1);
    event Swap(
        address indexed sender,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    uint private unlocked = 1;
    modifier lock() {
        if (unlocked != 1) revert LOCKED();
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() ERC20("uniswapV2 Pair", "UNIV2", 18) {}

    // create2创建合约, 构造函数不能有参数
    function initialize(address _token0, address _token1) public {
        if (token0 != address(0) || token1 != address(0))
            revert AlreadyInitialized();

        token0 = _token0;
        token1 = _token1;
    }

    function getReserves()
        public
        view
        returns (
            uint112 _reserve0,
            uint112 _reserve1,
            uint32 _blockTimestampLast
        )
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function sync() public {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            _reserve0,
            _reserve1
        );
    }

    // update reserves and, on the first call per block, price accumulators
    function _update(
        uint256 balance0,
        uint256 balance1,
        uint112 _reserve0,
        uint112 _reserve1
    ) private {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max)
            revert BalanceOverflow();

        // 预计时间戳和累计价格会溢出 但是我们不希望报错 以便它们能够正常运行
        unchecked {
            // 计算时间差 timeElapsed
            uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;
            if (timeElapsed > 0 && _reserve0 > 0 && _reserve1 > 0) {
                price0CumulativeLast +=
                    uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) *
                    timeElapsed;
                price1CumulativeLast +=
                    uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) *
                    timeElapsed;
            }
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);

        // console.log(price0CumulativeLast);
        blockTimestampLast = uint32(block.timestamp);
        emit Sync(reserve0, reserve1);
    }

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to
    ) public lock {
        // 都是 0
        if (amount0Out == 0 && amount1Out == 0)
            revert InsufficientOutputAmount();

        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();

        // 兑换的数额不能超出储备量
        if (amount0Out > _reserve0 || amount1Out > _reserve1)
            revert InsufficientLiquidity();

        // 计算此合约的代币余额减去我们预期发送给调用方的金额
        uint256 balance0 = IERC20(token0).balanceOf(address(this)) - amount0Out;
        uint256 balance1 = IERC20(token1).balanceOf(address(this)) - amount1Out;

        // 互换后准备金的乘积必须等于或大于互换前的乘积 - 这里的原理看恒定乘积图 多出的x并不能换回同比例的y 所以y偏上 总体面积也要偏大
        if (balance0 * balance1 < uint256(_reserve0) * uint256(_reserve1))
            revert InvalidK();

        _update(balance0, balance1, _reserve0, _reserve1);

        // 进行安全转账
        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);
        emit Swap(msg.sender, amount0Out, amount1Out, to);
    }

    function swapWithFee(
        uint256 amount0Out,
        uint256 amount1Out,
        address to
    ) public lock {
        if (amount0Out == 0 && amount1Out == 0)
            revert InsufficientOutputAmount();

        (uint112 reserve0_, uint112 reserve1_, ) = getReserves();

        if (amount0Out > reserve0_ || amount1Out > reserve1_)
            revert InsufficientLiquidity();

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        // 检验输入量
        uint256 amount0In = balance0 > reserve0 - amount0Out
            ? balance0 - (reserve0 - amount0Out)
            : 0;
        uint256 amount1In = balance1 > reserve1 - amount1Out
            ? balance1 - (reserve1 - amount1Out)
            : 0;
        // 输入量都是0 则用户还没有向合约发送任何代币，这是不允许的
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        // 扣减交易手续费后的恒定乘积校验
        uint256 balance0Adjusted = (balance0 * 1000) - (amount0In * 3);
        uint256 balance1Adjusted = (balance1 * 1000) - (amount1In * 3);

        if (
            balance0Adjusted * balance1Adjusted <
            uint256(reserve0_) * uint256(reserve1_) * (1000 ** 2)
        ) revert InvalidK();

        _update(balance0, balance1, reserve0_, reserve1_);

        emit Swap(msg.sender, amount0Out, amount1Out, to);
    }

    function swapFlashLoans(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) public lock {
        if (amount0Out == 0 && amount1Out == 0)
            revert InsufficientOutputAmount();

        (uint112 reserve0_, uint112 reserve1_, ) = getReserves();

        if (amount0Out > reserve0_ || amount1Out > reserve1_)
            revert InsufficientLiquidity();

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

        if (data.length > 0)
            // 向借钱的人索要回款 uniswapV2Call是贷入方合约的方法 to是贷入方地址
            IuniswapV2Callee(to).uniswapV2Call(
                msg.sender,
                amount0Out,
                amount1Out,
                data
            );

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        // 检验输入量
        uint256 amount0In = balance0 > reserve0 - amount0Out
            ? balance0 - (reserve0 - amount0Out)
            : 0;
        uint256 amount1In = balance1 > reserve1 - amount1Out
            ? balance1 - (reserve1 - amount1Out)
            : 0;
        // 输入量都是0 则用户还没有向合约发送任何代币，这是不允许的
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        // 扣减交易手续费后的恒定乘积校验
        uint256 balance0Adjusted = (balance0 * 1000) - (amount0In * 3);
        uint256 balance1Adjusted = (balance1 * 1000) - (amount1In * 3);

        if (
            balance0Adjusted * balance1Adjusted <
            uint256(reserve0_) * uint256(reserve1_) * (1000 ** 2)
        ) revert InvalidK();

        _update(balance0, balance1, reserve0_, reserve1_);

        emit Swap(msg.sender, amount0Out, amount1Out, to);
    }

    // 底层调用 token 安全转账
    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, value)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool))))
            revert TransferFailed();
    }

    // 移除流动性 调用之前需要把LP-token转到合约中
    function burn(
        address to
    ) public returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        amount0 = (balance0 * liquidity) / totalSupply;
        amount1 = (balance1 * liquidity) / totalSupply;

        if (amount0 <= 0 || amount1 <= 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        // 安全转账
        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);

        // 更新token余额
        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));

        // 更新储备量
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        _update(balance0, balance1, _reserve0, _reserve1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    // 添加流动性 返回流动性数量
    function mint(address to) public returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        // 执行这个之前已经把token发送到合约了 所以balance是总量
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        // 新增的数量 = 总量 - 储备量
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;

        // 没有流动性的情况
        if (totalSupply == 0) {
            // Liquidity-minted = √(Xdeposited*Ydeposited)
            // 把一部分流动性打入黑洞
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            // 初始流动性打到黑洞地址
            _mint(address(0), MINIMUM_LIQUIDITY);
        }
        // 有流动性的情况
        else {
            liquidity = Math.min(
                (totalSupply * amount0) / _reserve0,
                (totalSupply * amount1) / _reserve1
            );
        }

        if (liquidity <= 0) revert InsufficientLiquidityMinted();

        // 铸造流动性LP
        _mint(to, liquidity);

        // 将新的balance设置为reserve
        _update(balance0, balance1, _reserve0, _reserve1);

        emit Mint(to, amount0, amount1);
    }
}
