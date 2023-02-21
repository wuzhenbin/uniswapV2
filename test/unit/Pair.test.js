const { assert, expect } = require("chai");
const { from } = require("form-data");
const { network, deployments, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");
const { PANIC_CODES } = require("@nomicfoundation/hardhat-chai-matchers/panic");
const Big = require("big.js");

// eth => BigNumber
const eth2big = (eth) => ethers.utils.parseEther(eth.toString());
// wei => BigNumber
const wei2big = (wei) => ethers.BigNumber.from(wei.toString());
// BigNumber => eth
const big2eth = (bigNumber) => ethers.utils.formatEther(bigNumber);

// 获取合约或账户余额
// const getBalance = ethers.provider.getBalance;

// 计算当前累计价格
const calculateCurrentPrice = async (PairAB) => {
    let resd = await PairAB.getReserves();
    let _reserve0 = resd._reserve0;
    let _reserve1 = resd._reserve1;

    let initialPrice0 =
        _reserve0 > 0 ? _reserve1.mul(wei2big(2).pow(112)).div(_reserve0) : 0;
    let initialPrice1 =
        _reserve1 > 0 ? _reserve0.mul(wei2big(2).pow(112)).div(_reserve1) : 0;

    return {
        initialPrice0,
        initialPrice1,
    };
};

if (!developmentChains.includes(network.name)) {
    describe.skip;
} else {
    describe("Pair Unit Tests", function () {
        let PairAB, TokenA, TokenB, owner, user;

        beforeEach(async () => {
            [owner, user] = await ethers.getSigners();

            const Token = await ethers.getContractFactory("UniswapV2ERC20");
            const Pair = await ethers.getContractFactory("uniswapV2Pair");

            TokenA = await Token.deploy("TokenA", "AAA");
            TokenB = await Token.deploy("TokenB", "BBB");
            await TokenA.deployed();
            await TokenB.deployed();

            // mint 10 eth
            TokenA.mint(eth2big(10));
            TokenB.mint(eth2big(10));
            TokenA.connect(user).mint(eth2big(10));
            TokenB.connect(user).mint(eth2big(10));

            PairAB = await Pair.deploy();
            await PairAB.deployed();
            await PairAB.initialize(TokenA.address, TokenB.address);
        });

        it("is deployed", async () => {
            assert.equal(await PairAB.name(), "uniswapV2 Pair");
            assert.equal(await PairAB.symbol(), "UNIV2");
            assert.equal(await PairAB.totalSupply(), 0);
        });

        describe("priceCumulative", () => {
            it("testCumulativePrices", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                let priceData = await calculateCurrentPrice(PairAB);
                const initialPrice0 = priceData.initialPrice0;
                const initialPrice1 = priceData.initialPrice0;

                // 累计价格为 0
                assert.equal(await PairAB.price0CumulativeLast(), 0);
                assert.equal(await PairAB.price1CumulativeLast(), 0);

                // 从js到合约执行 有1s的间隙
                // ================= 1 seconds passed =================
                await PairAB.sync();

                expect(await PairAB.price0CumulativeLast()).to.equal(
                    initialPrice0
                );
                expect(await PairAB.price1CumulativeLast()).to.equal(
                    initialPrice1
                );

                // ================= 2 seconds passed =================
                await PairAB.sync();
                expect(await PairAB.price0CumulativeLast()).to.equal(
                    initialPrice0.mul(2)
                );
                expect(await PairAB.price1CumulativeLast()).to.equal(
                    initialPrice1.mul(2)
                );

                // ================= 3 seconds passed =================
                await PairAB.sync();
                expect(await PairAB.price0CumulativeLast()).to.equal(
                    initialPrice0.mul(3)
                );
                expect(await PairAB.price1CumulativeLast()).to.equal(
                    initialPrice1.mul(3)
                );

                // price change
                await TokenA.transfer(PairAB.address, eth2big(2));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                // ================= 6 seconds passed =================
                expect(await PairAB.price0CumulativeLast()).to.equal(
                    initialPrice0.mul(6)
                );
                expect(await PairAB.price1CumulativeLast()).to.equal(
                    initialPrice1.mul(6)
                );

                priceData = await calculateCurrentPrice(PairAB);
                const newPrice0 = priceData.initialPrice0;
                const newPrice1 = priceData.initialPrice1;

                // ================= 7 seconds passed =================
                await PairAB.sync();

                // 累计值 = 6s之前累计 + 1s后新价格的累计
                expect(await PairAB.price0CumulativeLast()).to.equal(
                    initialPrice0.mul(6).add(newPrice0)
                );
                expect(await PairAB.price1CumulativeLast()).to.equal(
                    initialPrice1.mul(6).add(newPrice1)
                );

                // ================= 8 seconds passed =================
                await PairAB.sync();

                // 累计值 = 6s之前累计 + 2s后新价格的累计
                expect(await PairAB.price0CumulativeLast()).to.equal(
                    initialPrice0.mul(6).add(newPrice0.mul(2))
                );
                expect(await PairAB.price1CumulativeLast()).to.equal(
                    initialPrice1.mul(6).add(newPrice1.mul(2))
                );

                // ================= 9 seconds passed =================
                await PairAB.sync();

                // 累计值 = 6s之前累计 + 3s后新价格的累计
                expect(await PairAB.price0CumulativeLast()).to.equal(
                    initialPrice0.mul(6).add(newPrice0.mul(3))
                );
                expect(await PairAB.price1CumulativeLast()).to.equal(
                    initialPrice1.mul(6).add(newPrice1.mul(3))
                );
            });
        });

        describe("swapWithFee", async () => {
            // 基本swaop 用tokenA换tokenB
            it("testSwapUnpaidFee", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(0.1));

                /* 
                getAmountOut = (reserveOut * amountIn * 997) / (1000 * reserveIn + amountIn * 997);
                getAmountOut = (2 * 0.1 * 997) / (1000 * 1 + 0.1 * 997) = 0.18132217877602982
                */
                await expect(
                    PairAB.swapWithFee(
                        0,
                        eth2big(0.18132217877602984),
                        owner.address
                    )
                ).to.be.revertedWithCustomError(PairAB, "InvalidK");
            });
        });
        describe("swap", async () => {
            // 基本swaop 用tokenA换tokenB
            it("testSwapBasicScenario", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(0.1));
                PairAB.swap(0, eth2big(0.18), owner.address);

                // owner token余额
                expect(big2eth(await TokenA.balanceOf(owner.address))).to.equal(
                    (10 - 1 - 0.1).toString()
                );
                expect(big2eth(await TokenB.balanceOf(owner.address))).to.equal(
                    (10 - 2 + 0.18).toString()
                );

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(big2eth(_reserve0)).to.equal((1 + 0.1).toString());
                expect(big2eth(_reserve1)).to.equal((2 - 0.18).toString());
            });
            // 基本swaop 用tokenB换tokenA
            it("testSwapBasicScenarioReverseDirection", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await TokenB.transfer(PairAB.address, eth2big(0.2));
                PairAB.swap(eth2big(0.09), 0, owner.address);

                // owner token余额
                expect(big2eth(await TokenA.balanceOf(owner.address))).to.equal(
                    (10 - 1 + 0.09).toString()
                );
                expect(big2eth(await TokenB.balanceOf(owner.address))).to.equal(
                    (10 - 2 - 0.2).toString()
                );

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(big2eth(_reserve0)).to.equal((1 - 0.09).toString());
                expect(big2eth(_reserve1)).to.equal((2 + 0.2).toString());
            });

            it("testSwapBidirectional", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(0.1));
                await TokenB.transfer(PairAB.address, eth2big(0.2));
                PairAB.swap(eth2big(0.09), eth2big(0.18), owner.address);

                // owner token余额
                expect(big2eth(await TokenA.balanceOf(owner.address))).to.equal(
                    // js浮点运算有精度问题
                    // 10 - 1 - 0.1 + 0.09
                    Big(10).minus(1).minus(0.1).plus(0.09).toString()
                );
                expect(big2eth(await TokenB.balanceOf(owner.address))).to.equal(
                    // 10 - 2 - 0.2 + 0.18
                    Big(10).minus(2).minus(0.2).plus(0.18).toString()
                );
            });
            // swap 0 输出
            it("testSwapZeroOut", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await expect(
                    PairAB.swap(0, 0, owner.address)
                ).to.be.revertedWithCustomError(
                    PairAB,
                    "InsufficientOutputAmount"
                );
            });
            // swap 错误的输出
            it("testSwapInsufficientLiquidity", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await expect(
                    PairAB.swap(0, eth2big(2.1), owner.address)
                ).to.be.revertedWithCustomError(
                    PairAB,
                    "InsufficientLiquidity"
                );

                await expect(
                    PairAB.swap(eth2big(1.1), 0, owner.address)
                ).to.be.revertedWithCustomError(
                    PairAB,
                    "InsufficientLiquidity"
                );
            });
            // 以低于当前价格进行swap
            it("testSwapUnderpriced", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(0.1));
                PairAB.swap(0, eth2big(0.09), owner.address);

                // owner token余额
                expect(big2eth(await TokenA.balanceOf(owner.address))).to.equal(
                    (10 - 1 - 0.1).toString()
                );
                expect(big2eth(await TokenB.balanceOf(owner.address))).to.equal(
                    (10 - 2 + 0.09).toString()
                );

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(big2eth(_reserve0)).to.equal((1 + 0.1).toString());
                expect(big2eth(_reserve1)).to.equal((2 - 0.09).toString());
            });

            // 以高于当前价格进行swap
            it("testSwapOverpriced", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(0.1));
                await expect(
                    PairAB.swap(0, eth2big(0.3), owner.address)
                ).to.be.revertedWithCustomError(PairAB, "InvalidK");

                // owner token余额
                expect(big2eth(await TokenA.balanceOf(owner.address))).to.equal(
                    (10 - 1 - 0.1).toString()
                );
                expect(big2eth(await TokenB.balanceOf(owner.address))).to.equal(
                    (10 - 2).toFixed(1)
                );

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(big2eth(_reserve0)).to.equal((1).toFixed(1));
                expect(big2eth(_reserve1)).to.equal((2).toFixed(1));
            });
        });

        describe("mint", async () => {
            // 初始 没有流动性
            it("testMint", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                // deployer 在 PairAB 铸造的 LP数量
                expect(big2eth(await PairAB.balanceOf(owner.address))).to.equal(
                    big2eth(eth2big(1).sub(wei2big(1000)))
                );

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(big2eth(_reserve0)).to.equal("1.0");
                expect(big2eth(_reserve1)).to.equal("1.0");

                // PairAB的总发行量
                expect(big2eth(await PairAB.totalSupply())).to.equal(
                    big2eth(eth2big(1))
                );
            });

            // 添加流动性没有发送token
            it("testMintLiquidityUnderflow", async () => {
                await expect(
                    PairAB.mint(owner.address)
                ).to.be.revertedWithPanic(
                    PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW
                );
            });

            // 添加流动性 投入的token数量不足
            it("testMintZeroLiquidity", async () => {
                await TokenA.transfer(PairAB.address, wei2big(1000));
                await TokenB.transfer(PairAB.address, wei2big(1000));

                await expect(
                    PairAB.mint(owner.address)
                ).to.be.revertedWithCustomError(
                    PairAB,
                    "InsufficientLiquidityMinted"
                );
            });

            // 有流动性的情况
            it("testMintWhenTheresLiquidity", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(2));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                // deployer 在 PairAB 铸造的 LP数量
                expect(big2eth(await PairAB.balanceOf(owner.address))).to.equal(
                    big2eth(eth2big(3).sub(wei2big(1000)))
                );

                // PairAB的总发行量
                expect(big2eth(await PairAB.totalSupply())).to.equal(
                    big2eth(eth2big(3))
                );

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(big2eth(_reserve0)).to.equal("3.0");
                expect(big2eth(_reserve1)).to.equal("3.0");
            });

            // 添加错误流动性的情况
            it("testMintUnbalanced", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(2));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                // deployer 在 PairAB 铸造的 LP数量
                expect(big2eth(await PairAB.balanceOf(owner.address))).to.equal(
                    big2eth(eth2big(2).sub(wei2big(1000)))
                );

                // PairAB的总发行量
                expect(big2eth(await PairAB.totalSupply())).to.equal(
                    big2eth(eth2big(2))
                );

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(big2eth(_reserve0)).to.equal("3.0");
                expect(big2eth(_reserve1)).to.equal("2.0");
            });

            // 测试 slot 内容
            it("testReservesPacking", async () => {
                // 生成流动性
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(2));
                await PairAB.mint(owner.address);

                // 槽位8是 getReserves的内容 使用hardhat-storage-layout插件查看
                // 由于 _blockTimestampLast 每次不一样 所以 这里不好测
                // let res = await ethers.provider.getStorageAt(PairAB.address, 8);
                // expect(res.toString()).to.equal(
                //     "0x63c40beb0000000000001bc16d674ec800000000000000000de0b6b3a7640000"
                // );
            });
        });

        describe("burn", async () => {
            // 移除流动性
            it("testBurnInit", async () => {
                // 生成流动性
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                // deployer 在 PairAB 铸造的 LP数量
                expect(big2eth(await PairAB.balanceOf(owner.address))).to.equal(
                    big2eth(eth2big(1).sub(wei2big(1000)))
                );

                // 移除流动性 先把 LP-token发送到合约中
                let liquidity = await PairAB.balanceOf(owner.address);
                await PairAB.transfer(PairAB.address, liquidity);
                await PairAB.burn(owner.address);

                // PairAB 的 LP token 为 0
                liquidity = await PairAB.balanceOf(owner.address);
                expect(big2eth(liquidity)).to.equal("0.0");

                // PairAB token的储备量
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(_reserve0.toString()).to.equal("1000");
                expect(_reserve0.toString()).to.equal("1000");

                // PairAB的总发行量
                expect((await PairAB.totalSupply()).toString()).to.equal(
                    "1000"
                );

                // owner 最后 token 的 数量
                let token0 = await TokenA.balanceOf(owner.address);
                let token1 = await TokenB.balanceOf(owner.address);
                expect(token0).to.equal(eth2big(10).sub(wei2big(1000)));
                expect(token1).to.equal(eth2big(10).sub(wei2big(1000)));
            });

            // 没有LP的情况下 移除流动性
            it("testBurnZeroTotalSupply", async () => {
                // 移除流动性 先把 LP-token发送到合约中
                let liquidity = await PairAB.balanceOf(owner.address);
                await PairAB.transfer(PairAB.address, liquidity);

                await expect(
                    PairAB.burn(owner.address)
                ).to.be.revertedWithPanic(PANIC_CODES.DIVISION_BY_ZERO);
            });

            // 移除流动性 Burn as a user who hasn't provided liquidity.
            it("testBurnZeroLiquidity", async () => {
                // 生成流动性
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                // 移除流动性 先把 LP-token发送到合约中
                let liquidity = await PairAB.balanceOf(user.address);
                await PairAB.transfer(PairAB.address, liquidity);
                // 其他人移除流动性
                await expect(
                    PairAB.connect(user).mint(user.address)
                ).to.be.revertedWithCustomError(
                    PairAB,
                    "InsufficientLiquidityMinted"
                );
            });

            // 错误添加流动性 再移除流动性
            it("testBurnUnbalanced", async () => {
                await TokenA.transfer(PairAB.address, eth2big(1));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                await TokenA.transfer(PairAB.address, eth2big(2));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                // 移除流动性 先把 LP-token发送到合约中
                let liquidity = await PairAB.balanceOf(owner.address);
                await PairAB.transfer(PairAB.address, liquidity);
                await PairAB.burn(owner.address);

                // PairAB 的 LP token 为 0
                liquidity = await PairAB.balanceOf(owner.address);
                expect(big2eth(liquidity)).to.equal("0.0");

                // PairAB token的储备量
                // 我们在这里看到的是我们已经失去了 500 wei 的token0！这就是对价格操纵的惩罚。
                // 但是数量少得离谱，看起来一点也不重要。这是因为我们当前的用户（测试合约）是唯一的流动性提供者
                let { _reserve0, _reserve1 } = await PairAB.getReserves();
                expect(_reserve0.toString()).to.equal("1500");
                expect(_reserve1.toString()).to.equal("1000");
            });

            // 向另一个用户初始化的池提供不平衡的流动性怎么办 再移除流动性
            it("testBurnUnbalancedDifferentUsers", async () => {
                // user 铸造LP
                await TokenA.connect(user).transfer(PairAB.address, eth2big(1));
                await TokenB.connect(user).transfer(PairAB.address, eth2big(1));
                await PairAB.connect(user).mint(user.address);

                // deployer 铸造LP
                await TokenA.transfer(PairAB.address, eth2big(2));
                await TokenB.transfer(PairAB.address, eth2big(1));
                await PairAB.mint(owner.address);

                // 移除流动性 先把 LP-token发送到合约中
                let liquidity = await PairAB.balanceOf(owner.address);
                await PairAB.transfer(PairAB.address, liquidity);
                await PairAB.burn(owner.address);

                // PairAB 的 LP token 为 0
                liquidity = await PairAB.balanceOf(owner.address);
                expect(big2eth(liquidity)).to.equal("0.0");

                // PairAB token的储备量
                // 这看起来完全不同！我们现在损失了 0.5 个以太币token0，这是我们存入的 1/4。现在这是一个很大的数额！
                let resd = await PairAB.getReserves();
                expect(big2eth(resd._reserve0)).to.equal("1.5");
                expect(big2eth(resd._reserve1)).to.equal("1.0");

                // user 移除流动性 先把LP-token发送到合约中
                liquidity = await PairAB.connect(user).balanceOf(user.address);
                await PairAB.connect(user).transfer(PairAB.address, liquidity);
                await PairAB.connect(user).burn(user.address);

                // 这里可以看到 最后合约只保留了 owner 错误添加流动性损失的token 少量在合约里
                resd = await PairAB.getReserves();
                expect(resd._reserve0.toString()).to.equal("1500");
                expect(resd._reserve1.toString()).to.equal("1000");

                // 大部分都给 其他用户拿走了
                let tokenA = await TokenA.balanceOf(user.address);
                let tokenB = await TokenB.balanceOf(user.address);
                expect(big2eth(tokenA)).to.equal(
                    big2eth(eth2big(10 + 0.5).sub(wei2big(1500)))
                );
                expect(big2eth(tokenB)).to.equal(
                    big2eth(eth2big(10).sub(wei2big(1000)))
                );
            });
        });
    });
}
