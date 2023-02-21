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
    describe("Library Last Tests", function () {
        let Factory,
            Pair1,
            Pair2,
            Pair3,
            LibTest,
            TokenA,
            TokenB,
            TokenC,
            TokenD,
            owner,
            user;

        beforeEach(async () => {
            [owner, user] = await ethers.getSigners();

            await deployments.fixture(["factory", "library", "libraryTest"]);

            LibTest = await ethers.getContract("LibTest");
            Factory = await ethers.getContract("uniswapV2Factory");

            const TokenContract = await ethers.getContractFactory(
                "UniswapV2ERC20"
            );
            const PairContract = await ethers.getContractFactory(
                "uniswapV2Pair"
            );

            TokenA = await TokenContract.deploy("TokenA", "AAA");
            TokenB = await TokenContract.deploy("TokenB", "BBB");
            TokenC = await TokenContract.deploy("TokenC", "CCC");
            TokenD = await TokenContract.deploy("TokenD", "DDD");

            await TokenA.deployed();
            await TokenB.deployed();
            await TokenC.deployed();
            await TokenD.deployed();

            // mint 10 eth
            TokenA.mint(eth2big(10));
            TokenB.mint(eth2big(10));
            TokenC.mint(eth2big(10));
            TokenD.mint(eth2big(10));

            // 创建pair合约
            await Factory.createPair(TokenA.address, TokenB.address);
            await Factory.createPair(TokenB.address, TokenC.address);
            await Factory.createPair(TokenC.address, TokenD.address);

            // 得到pair合约地址
            let pair_ab = await Factory.pairs(TokenA.address, TokenB.address);
            let pair_bc = await Factory.pairs(TokenB.address, TokenC.address);
            let pair_cd = await Factory.pairs(TokenC.address, TokenD.address);

            // 绑定pair合约
            Pair1 = await PairContract.attach(pair_ab);
            Pair2 = await PairContract.attach(pair_bc);
            Pair3 = await PairContract.attach(pair_cd);
        });

        it("testGetAmountOut", async () => {
            const amountOut = await LibTest.getAmountOut(
                wei2big(1000),
                eth2big(1),
                eth2big(1.5)
            );
            assert.equal(amountOut, 1495);
        });

        it("testGetAmountOutZeroInputAmount", async () => {
            // InsufficientAmount
            await expect(
                LibTest.getAmountOut(wei2big(0), eth2big(1), eth2big(1.5))
            ).to.be.reverted;
        });

        it("testGetAmountOutZeroInputReserve", async () => {
            // InsufficientLiquidity
            await expect(
                LibTest.getAmountOut(wei2big(1000), eth2big(0), eth2big(1.5))
            ).to.be.reverted;
        });

        it("testGetAmountOutZeroOutputReserve", async () => {
            // InsufficientLiquidity
            await expect(LibTest.getAmountOut(wei2big(1000), eth2big(1), 0)).to
                .be.reverted;
        });

        it("testGetAmountsOut", async () => {
            await TokenA.transfer(Pair1.address, eth2big(1));
            await TokenB.transfer(Pair1.address, eth2big(2));
            await Pair1.mint(owner.address);

            await TokenB.transfer(Pair2.address, eth2big(1));
            await TokenC.transfer(Pair2.address, eth2big(0.5));
            await Pair2.mint(owner.address);

            await TokenC.transfer(Pair3.address, eth2big(1));
            await TokenD.transfer(Pair3.address, eth2big(2));
            await Pair3.mint(owner.address);

            const path = [
                TokenA.address,
                TokenB.address,
                TokenC.address,
                TokenD.address,
            ];
            let parms = [Factory.address, eth2big(0.1), path];
            const amounts = await LibTest.callStatic.getAmountsOut(...parms);
            await LibTest.getAmountsOut(...parms);

            assert.equal(amounts.length, 4);
            assert.equal(big2eth(amounts[0]), "0.1");
            assert.equal(big2eth(amounts[1]), "0.181322178776029826");
            assert.equal(big2eth(amounts[2]), "0.076550452221167502");
            assert.equal(big2eth(amounts[3]), "0.14181794276056527");
        });

        it("testGetAmountsOutInvalidPath", async () => {
            const path = [TokenA.address];
            let parms = [Factory.address, eth2big(0.1), path];
            await expect(LibTest.getAmountsOut(...parms)).to.be.reverted;
        });

        it("testGetAmountIn", async () => {
            const amountIn = await LibTest.getAmountIn(
                wei2big(1495),
                eth2big(1),
                eth2big(1.5)
            );
            assert.equal(amountIn, 1000);
        });

        it("testGetAmountInZeroInputAmount", async () => {
            // InsufficientAmount
            await expect(
                LibTest.getAmountIn(wei2big(0), eth2big(1), eth2big(1.5))
            ).to.be.reverted;
        });

        it("testGetAmountInZeroInputReserve", async () => {
            // InsufficientLiquidity
            await expect(
                LibTest.getAmountIn(wei2big(1000), eth2big(0), eth2big(1.5))
            ).to.be.reverted;
        });

        it("testGetAmountInZeroOutputReserve", async () => {
            // InsufficientLiquidity
            await expect(LibTest.getAmountIn(wei2big(1000), eth2big(1), 0)).to
                .be.reverted;
        });

        it("testGetAmountsIn", async () => {
            await TokenA.transfer(Pair1.address, eth2big(1));
            await TokenB.transfer(Pair1.address, eth2big(2));
            await Pair1.mint(owner.address);

            await TokenB.transfer(Pair2.address, eth2big(1));
            await TokenC.transfer(Pair2.address, eth2big(0.5));
            await Pair2.mint(owner.address);

            await TokenC.transfer(Pair3.address, eth2big(1));
            await TokenD.transfer(Pair3.address, eth2big(2));
            await Pair3.mint(owner.address);

            const path = [
                TokenA.address,
                TokenB.address,
                TokenC.address,
                TokenD.address,
            ];
            let parms = [Factory.address, eth2big(0.1), path];
            const amounts = await LibTest.callStatic.getAmountsIn(...parms);
            await LibTest.getAmountsIn(...parms);

            assert.equal(amounts.length, 4);
            assert.equal(big2eth(amounts[0]), "0.063113405152841847");
            assert.equal(big2eth(amounts[1]), "0.11839804368544458");
            assert.equal(big2eth(amounts[2]), "0.052789948793749671");
            assert.equal(big2eth(amounts[3]), "0.1");
        });

        it("testGetAmountsOutInvalidPath", async () => {
            const path = [TokenA.address];
            let parms = [Factory.address, eth2big(0.1), path];
            await expect(LibTest.getAmountsIn(...parms)).to.be.reverted;
        });
    });

    describe("Library First Tests", function () {
        let Factory, Pair, LibTest, Token0, Token1, owner, user;

        beforeEach(async () => {
            [owner, user] = await ethers.getSigners();

            await deployments.fixture(["factory", "library", "libraryTest"]);

            LibTest = await ethers.getContract("LibTest");
            Factory = await ethers.getContract("uniswapV2Factory");

            const TokenContract = await ethers.getContractFactory(
                "UniswapV2ERC20"
            );
            const PairContract = await ethers.getContractFactory(
                "uniswapV2Pair"
            );

            TokenA = await TokenContract.deploy("TokenA", "AAA");
            TokenB = await TokenContract.deploy("TokenB", "BBB");

            await TokenA.deployed();
            await TokenB.deployed();

            // mint 10 eth
            TokenA.mint(eth2big(10));
            TokenB.mint(eth2big(10));

            const addA = TokenA.address;
            const addB = TokenB.address;
            // 小的合约在前面
            token0 = addA < addB ? addA : addB;
            token1 = addA < addB ? addB : addA;
            Token0 = addA < addB ? TokenA : TokenB;
            Token1 = addA < addB ? TokenB : TokenA;

            // 创建pair合约
            await Factory.createPair(token0, token1);
            // 得到pair合约地址
            let pairAddress = await Factory.pairs(token0, token1);
            // 绑定pair合约
            Pair = await PairContract.attach(pairAddress);
        });

        it("testGetReserves", async () => {
            await Token0.transfer(Pair.address, eth2big(1.1));
            await Token1.transfer(Pair.address, eth2big(0.8));
            await Pair.mint(owner.address);

            await LibTest.testReserves(
                Factory.address,
                Token0.address,
                Token1.address
            );
            let [reserveA, reserveB] = await LibTest.getReserves();
            assert.equal(big2eth(reserveA), "1.1");
            assert.equal(big2eth(reserveB), "0.8");
        });

        it("testQuote", async () => {
            let amountOut = await LibTest.quote(
                eth2big(1),
                eth2big(1),
                eth2big(1)
            );
            assert.equal(big2eth(amountOut), "1.0");

            amountOut = await LibTest.quote(eth2big(1), eth2big(2), eth2big(1));
            assert.equal(big2eth(amountOut), "0.5");

            amountOut = await LibTest.quote(eth2big(1), eth2big(1), eth2big(2));
            assert.equal(big2eth(amountOut), "2.0");
        });

        it("testPairFor", async () => {
            let pairAddress = await LibTest.pairFor(
                Factory.address,
                Token0.address,
                Token1.address
            );
            assert.equal(
                await Factory.pairs(Token0.address, Token1.address),
                pairAddress
            );
        });

        it("testPairForTokensSorting", async () => {
            let pairAddress = await LibTest.pairFor(
                Factory.address,
                Token1.address,
                Token0.address
            );
            assert.equal(
                await Factory.pairs(Token0.address, Token1.address),
                pairAddress
            );
        });

        it("testPairForNonexistentFactory", async () => {
            let pairAddress = await LibTest.pairFor(
                "0x4faBD45F69D907aC3a3941c34f466A6EFf44bAcA",
                Token1.address,
                Token0.address
            );
            // assert.equal(
            //     pairAddress,
            //     "0x9A911b55e6d4f3221019a735A9BEDDC2Acab3ef2"
            // );
        });
    });
}
