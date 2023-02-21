const { assert, expect } = require("chai");
const { network, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

// eth => BigNumber
const eth2big = (eth) => ethers.utils.parseEther(eth.toString());
// wei => BigNumber
const wei2big = (wei) => ethers.BigNumber.from(wei.toString());
// BigNumber => eth
const big2eth = (bigNumber) => ethers.utils.formatEther(bigNumber);

if (!developmentChains.includes(network.name)) {
    describe.skip;
} else {
    describe("Pair Last Unit Tests", function () {
        let Factory, Router, PairContract, TokenA, TokenB, TokenC, owner, user;

        beforeEach(async () => {
            [owner, user] = await ethers.getSigners();

            await deployments.fixture(["factory", "library", "router"]);

            PairContract = await ethers.getContractFactory("uniswapV2Pair");
            Factory = await ethers.getContract("uniswapV2Factory");
            Router = await ethers.getContract("uniswapV2Router");

            const TokenContract = await ethers.getContractFactory(
                "UniswapV2ERC20"
            );

            TokenA = await TokenContract.deploy("TokenA", "AAA");
            TokenB = await TokenContract.deploy("TokenB", "BBB");
            TokenC = await TokenContract.deploy("TokenC", "CCC");
            await TokenA.deployed();
            await TokenB.deployed();
            await TokenC.deployed();

            // mint 10 eth
            TokenA.mint(eth2big(20));
            TokenB.mint(eth2big(20));
            TokenC.mint(eth2big(20));
        });
        // 链式交换测试
        it("testSwapExactTokensForTokens", async () => {
            // addLiquidity需要把用户的token transferFrom
            await TokenA.approve(Router.address, eth2big(1));
            await TokenB.approve(Router.address, eth2big(2));
            await TokenC.approve(Router.address, eth2big(1));

            await Router.addLiquidity(
                TokenA.address,
                TokenB.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );

            await Router.addLiquidity(
                TokenB.address,
                TokenC.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );

            await TokenA.approve(Router.address, eth2big(0.3));
            await Router.swapExactTokensForTokens(
                eth2big(0.3),
                eth2big(0.1),
                [TokenA.address, TokenB.address, TokenC.address],
                owner.address
            );

            // token余额
            expect(await TokenA.balanceOf(owner.address)).to.equal(
                eth2big(20 - 1 - 0.3)
            );
            expect(await TokenB.balanceOf(owner.address)).to.equal(
                eth2big(20 - 2)
            );
            // 20 - 1 + 0.186691414219734305
            expect(await TokenC.balanceOf(owner.address)).to.equal(
                "19186691414219734305"
            );
        });
        // 反向链式交换测试
        it("testSwapTokensForExactTokens", async () => {
            // addLiquidity需要把用户的token transferFrom
            await TokenA.approve(Router.address, eth2big(1));
            await TokenB.approve(Router.address, eth2big(2));
            await TokenC.approve(Router.address, eth2big(1));

            await Router.addLiquidity(
                TokenA.address,
                TokenB.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );

            await Router.addLiquidity(
                TokenB.address,
                TokenC.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );

            await TokenA.approve(Router.address, eth2big(0.3));

            await Router.swapTokensForExactTokens(
                // 预期获得C数量
                eth2big(0.1866914142197343),
                // 预期支付A最大值
                eth2big(0.3),
                [TokenA.address, TokenB.address, TokenC.address],
                owner.address
            );
            //

            // token余额
            // 预期支付A 0.3
            // 实际支付A amounts[0] - 299999999999999986
            // 实际A数量 18700000000000000014
            expect(await TokenA.balanceOf(owner.address)).to.equal(
                eth2big(20 - 1)
                    .sub(eth2big(0.3))
                    .add(14)
            );
            expect(await TokenB.balanceOf(owner.address)).to.equal(
                eth2big(20 - 2)
            );
            // 20 - 1 + 0.1866914142197343
            expect(await TokenC.balanceOf(owner.address)).to.equal(
                "19186691414219734300"
            );
        });

        // 移除流动性 - 全部移除
        it("testRemoveLiquidity", async () => {
            // addLiquidity需要把用户的token transferFrom
            await TokenA.approve(Router.address, eth2big(1));
            await TokenB.approve(Router.address, eth2big(1));

            await Router.addLiquidity(
                TokenA.address,
                TokenB.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );

            // 获取pair合约地址
            const pairAddress = await Factory.pairs(
                TokenA.address,
                TokenB.address
            );
            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);
            // remove 流动性
            let liquidity = await Pair.balanceOf(owner.address);
            // 授权LP给路由合约
            Pair.approve(Router.address, liquidity);

            await Router.removeLiquidity(
                TokenA.address,
                TokenB.address,
                liquidity,
                eth2big(1).sub(wei2big(1000)),
                eth2big(1).sub(wei2big(1000)),
                owner.address
            );

            // PairAB token的储备量
            let { _reserve0, _reserve1 } = await Pair.getReserves();
            expect(_reserve0).to.equal(1000);
            expect(_reserve1).to.equal(1000);

            // 用户的LP数量为0
            expect(await Pair.balanceOf(owner.address)).to.equal(0);

            // Pair的总发行量
            expect(await Pair.totalSupply()).to.equal(1000);

            // token余额
            expect(await TokenA.balanceOf(owner.address)).to.equal(
                eth2big(20).sub(1000)
            );
            expect(await TokenB.balanceOf(owner.address)).to.equal(
                eth2big(20).sub(1000)
            );
        });

        // 移除流动性 - 部分移除
        it("testRemoveLiquidityPartially", async () => {
            // addLiquidity需要把用户的token transferFrom
            await TokenA.approve(Router.address, eth2big(1));
            await TokenB.approve(Router.address, eth2big(1));

            // 添加流动性
            await Router.addLiquidity(
                TokenA.address,
                TokenB.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );

            // 获取pair合约地址
            const pairAddress = await Factory.pairs(
                TokenA.address,
                TokenB.address
            );
            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);

            // remove 流动性
            let liquidity = await Pair.balanceOf(owner.address);
            // 移除 3成
            liquidity = liquidity.mul(3).div(10);

            // 授权LP给路由合约
            Pair.approve(Router.address, liquidity);

            await Router.removeLiquidity(
                TokenA.address,
                TokenB.address,
                liquidity,
                eth2big(0.3).sub(300),
                eth2big(0.3).sub(300),
                owner.address
            );

            // PairAB token的储备量 总池子 1 eth, 取走 (1 eth - 1000)*0.3 = 0.3 eth - 300, 剩余 0.7 eth + 300
            let { _reserve0, _reserve1 } = await Pair.getReserves();
            expect(_reserve0).to.equal(eth2big(0.7).add(300));
            expect(_reserve1).to.equal(eth2big(0.7).add(300));

            // 用户剩余的LP数量为 (1 eth - 1000) * 0.7
            expect(await Pair.balanceOf(owner.address)).to.equal(
                eth2big(0.7).sub(700)
            );

            // 燃烧的数量 = (1 eth - 1000) * 0.3 = 0.3 eth - 300
            // Pair的发行量 = 1 eth - (0.3 eth - 300) = 0.7 eth + 300
            expect(await Pair.totalSupply()).to.equal(eth2big(0.7).add(300));

            // token余额 20eth - 1eth + (1eth - 1000)*0.3
            // 20eth - 1eth + 0.3eth - 300)
            expect(await TokenA.balanceOf(owner.address)).to.equal(
                eth2big(20 - 1 + 0.3).sub(300)
            );
            expect(await TokenB.balanceOf(owner.address)).to.equal(
                eth2big(20 - 1 + 0.3).sub(300)
            );
        });

        // 移除流动性 - 预期输出A数量太大
        it("testRemoveLiquidityInsufficientAmount", async () => {
            // addLiquidity需要把用户的token transferFrom
            await TokenA.approve(Router.address, eth2big(1));
            await TokenB.approve(Router.address, eth2big(1));

            // 添加流动性
            await Router.addLiquidity(
                TokenA.address,
                TokenB.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );

            // 获取pair合约地址
            const pairAddress = await Factory.pairs(
                TokenA.address,
                TokenB.address
            );
            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);

            let liquidity = await Pair.balanceOf(owner.address);
            // 授权LP给路由合约
            Pair.approve(Router.address, liquidity);
            // remove 流动性
            await expect(
                Router.removeLiquidity(
                    TokenA.address,
                    TokenB.address,
                    liquidity,
                    eth2big(1),
                    eth2big(1).sub(1000),
                    owner.address
                )
            ).to.be.revertedWithCustomError(Router, "InsufficientAAmount");

            await expect(
                Router.removeLiquidity(
                    TokenA.address,
                    TokenB.address,
                    liquidity,
                    eth2big(1).sub(1000),
                    eth2big(1),
                    owner.address
                )
            ).to.be.revertedWithCustomError(Router, "InsufficientBAmount");
        });
    });

    describe("Pair AddLiquidity", function () {
        let Factory, Router, PairContract, Token0, Token1, owner, user;

        beforeEach(async () => {
            [owner, user] = await ethers.getSigners();

            await deployments.fixture(["factory", "library", "router"]);

            PairContract = await ethers.getContractFactory("uniswapV2Pair");
            Factory = await ethers.getContract("uniswapV2Factory");
            Router = await ethers.getContract("uniswapV2Router");

            const TokenContract = await ethers.getContractFactory(
                "UniswapV2ERC20"
            );
            TokenA = await TokenContract.deploy("TokenA", "AAA");
            TokenB = await TokenContract.deploy("TokenB", "BBB");
            await TokenA.deployed();
            await TokenB.deployed();

            const addA = TokenA.address;
            const addB = TokenB.address;
            // 小的合约在前面
            Token0 = addA < addB ? TokenA : TokenB;
            Token1 = addA < addB ? TokenB : TokenA;

            // mint 10 eth
            Token0.mint(eth2big(20));
            Token1.mint(eth2big(20));
        });

        // 添加流动性 - 创建交易对
        it("testAddLiquidityCreatesPair", async () => {
            await Token0.approve(Router.address, eth2big(1));
            await Token1.approve(Router.address, eth2big(1));

            await Router.addLiquidity(
                Token0.address,
                Token1.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address
            );
            // assert.equal(
            //     await Factory.pairs(Token0.address, Token1.address),
            //     "0x336a75B023eee51cAe576fC4322085D1D119deA9"
            // );
        });

        // 添加流动性 没有初始流动性
        it("testAddLiquidityNoReserve", async () => {
            await Token0.approve(Router.address, eth2big(1));
            await Token1.approve(Router.address, eth2big(1));

            let parms = [
                Token0.address,
                Token1.address,
                eth2big(1),
                eth2big(1),
                eth2big(1),
                eth2big(1),
                owner.address,
            ];

            // 先模拟交易获取结果
            const { amountA, amountB, liquidity } =
                await Router.callStatic.addLiquidity(...parms);
            await Router.addLiquidity(...parms);

            // 添加流动性结果
            expect(amountA).to.equal(eth2big(1));
            expect(amountB).to.equal(eth2big(1));
            expect(liquidity).to.equal(eth2big(1).sub(wei2big(1000)));

            // pairAB ABtoken的余额
            const pairAddress = await Factory.pairs(
                Token0.address,
                Token1.address
            );
            expect(await Token0.balanceOf(pairAddress)).to.equal(eth2big(1));
            expect(await Token1.balanceOf(pairAddress)).to.equal(eth2big(1));
        });

        // 添加流动性  amountBOptimal符合要求
        it("testAddLiquidityAmountBOptimalIsOk", async () => {
            // 得到合约地址
            const pairAddress = await Factory.callStatic.createPair(
                Token0.address,
                Token1.address
            );
            // 创建pair合约
            await Factory.createPair(Token0.address, Token1.address);

            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);
            // 校验token地址
            expect(await Pair.token0()).to.equal(Token0.address);
            expect(await Pair.token1()).to.equal(Token1.address);

            // 铸造初始流动性
            await Token0.transfer(Pair.address, eth2big(1));
            await Token1.transfer(Pair.address, eth2big(2));
            await Pair.mint(owner.address);

            // 授权路由合约安全转账
            await Token0.approve(Router.address, eth2big(1));
            await Token1.approve(Router.address, eth2big(2));

            // 先模拟交易获取结果
            let parms = [
                Token0.address,
                Token1.address,
                eth2big(1),
                eth2big(2),
                eth2big(1),
                eth2big(1.9),
                owner.address,
            ];
            const { amountA, amountB, liquidity } =
                await Router.callStatic.addLiquidity(...parms);
            await Router.addLiquidity(...parms);

            // 添加流动性结果
            expect(amountA).to.equal(eth2big(1));
            expect(amountB).to.equal(eth2big(2));
            expect(liquidity.toString()).to.equal("1414213562373095048");
        });

        // 添加流动性  amountBOptimal符合要求
        it("testAddLiquidityAmountBOptimalIsTooLow", async () => {
            // 得到合约地址
            const pairAddress = await Factory.callStatic.createPair(
                Token0.address,
                Token1.address
            );
            // 创建pair合约
            await Factory.createPair(Token0.address, Token1.address);

            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);
            // 校验token地址
            expect(await Pair.token0()).to.equal(Token0.address);
            expect(await Pair.token1()).to.equal(Token1.address);

            // 铸造初始流动性
            await Token0.transfer(Pair.address, eth2big(5));
            await Token1.transfer(Pair.address, eth2big(10));
            await Pair.mint(owner.address);

            // 授权路由合约安全转账
            await Token0.approve(Router.address, eth2big(1));
            await Token1.approve(Router.address, eth2big(2));

            // 先模拟交易获取结果
            let parms = [
                Token0.address,
                Token1.address,
                eth2big(1),
                eth2big(2),
                eth2big(1),
                eth2big(2),
                owner.address,
            ];
            await expect(
                Router.addLiquidity(...parms)
            ).to.be.revertedWithCustomError(Router, "InsufficientBAmount");
        });

        // 添加流动性  amountBOptimal预期太高 AmountA预期太少
        it("testAddLiquidityAmountBOptimalTooHighAmountATooLow", async () => {
            // 得到合约地址
            const pairAddress = await Factory.callStatic.createPair(
                Token0.address,
                Token1.address
            );
            // 创建pair合约
            await Factory.createPair(Token0.address, Token1.address);

            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);
            // 校验token地址
            expect(await Pair.token0()).to.equal(Token0.address);
            expect(await Pair.token1()).to.equal(Token1.address);

            // 铸造初始流动性
            await Token0.transfer(Pair.address, eth2big(10));
            await Token1.transfer(Pair.address, eth2big(5));
            await Pair.mint(owner.address);

            // 授权路由合约安全转账
            await Token0.approve(Router.address, eth2big(2));
            await Token1.approve(Router.address, eth2big(1));

            // 交易获取结果
            let parms = [
                Token0.address,
                Token1.address,
                eth2big(2),
                eth2big(0.9),
                eth2big(2),
                eth2big(1),
                owner.address,
            ];
            await expect(
                Router.addLiquidity(...parms)
            ).to.be.revertedWithCustomError(Router, "InsufficientAAmount");
        });

        // 添加流动性  amountBOptimal预期太高 AmountA刚好
        it("testAddLiquidityAmountBOptimalIsTooHighAmountAOk", async () => {
            // 得到合约地址
            const pairAddress = await Factory.callStatic.createPair(
                Token0.address,
                Token1.address
            );
            // 创建pair合约
            await Factory.createPair(Token0.address, Token1.address);

            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);
            // 校验token地址
            expect(await Pair.token0()).to.equal(Token0.address);
            expect(await Pair.token1()).to.equal(Token1.address);

            // 铸造初始流动性
            await Token0.transfer(Pair.address, eth2big(10));
            await Token1.transfer(Pair.address, eth2big(5));
            await Pair.mint(owner.address);

            // 授权路由合约安全转账
            await Token0.approve(Router.address, eth2big(2));
            await Token1.approve(Router.address, eth2big(1));

            // 交易获取结果
            let parms = [
                Token0.address,
                Token1.address,
                eth2big(2),
                eth2big(0.9),
                eth2big(1.7),
                eth2big(1),
                owner.address,
            ];
            // 模拟交易
            const { amountA, amountB, liquidity } =
                await Router.callStatic.addLiquidity(...parms);

            // await Router.addLiquidity(...parms);
            expect(amountA).to.equal(eth2big(1.8));
            expect(amountB).to.equal(eth2big(0.9));
            expect(liquidity.toString()).to.equal("1272792206135785543");
        });
    });
}
