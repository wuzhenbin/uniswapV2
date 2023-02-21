const { assert, expect } = require("chai");
const { network, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

if (!developmentChains.includes(network.name)) {
    describe.skip;
} else {
    describe("Factory Unit Tests", function () {
        let Factory, PairContract, TokenA, TokenB, TokenC, TokenD, owner, user;

        beforeEach(async () => {
            [owner, user] = await ethers.getSigners();

            await deployments.fixture(["factory"]);
            Factory = await ethers.getContract("uniswapV2Factory");

            const TokenContract = await ethers.getContractFactory(
                "UniswapV2ERC20"
            );
            PairContract = await ethers.getContractFactory("uniswapV2Pair");

            TokenA = await TokenContract.deploy("TokenA", "AAA");
            TokenB = await TokenContract.deploy("TokenB", "BBB");
            TokenC = await TokenContract.deploy("TokenC", "CCC");
            TokenD = await TokenContract.deploy("TokenD", "DDD");

            await TokenA.deployed();
            await TokenB.deployed();
            await TokenC.deployed();
            await TokenD.deployed();
        });

        it("testCreatePair", async () => {
            const addA = TokenA.address;
            const addB = TokenB.address;
            // 小的合约在前面
            let token0 = addA < addB ? addA : addB;
            let token1 = addA < addB ? addB : addA;

            // 创建pair合约
            await Factory.createPair(token0, token1);
            // 得到pair合约地址
            let pairAddress = await Factory.pairs(token0, token1);
            // 绑定pair合约
            const Pair = await PairContract.attach(pairAddress);
            expect(await Pair.token0()).to.equal(token0);
            expect(await Pair.token1()).to.equal(token1);
        });

        it("testCreatePairZeroAddress", async () => {
            const addA = TokenA.address;

            // 创建pair合约
            await expect(
                Factory.createPair(
                    "0x0000000000000000000000000000000000000000",
                    addA
                )
            ).to.be.revertedWithCustomError(Factory, "ZeroAddress");
        });

        it("testCreatePairPairExists", async () => {
            const addA = TokenA.address;
            const addB = TokenB.address;
            // 小的合约在前面
            let token0 = addA < addB ? addA : addB;
            let token1 = addA < addB ? addB : addA;

            // 创建pair合约
            await Factory.createPair(token0, token1);
            // 创建pair合约
            await expect(
                Factory.createPair(token0, token1)
            ).to.be.revertedWithCustomError(Factory, "PairExists");
        });

        it("testCreatePairIdenticalTokens", async () => {
            const addA = TokenA.address;

            // 创建pair合约
            await expect(
                Factory.createPair(addA, addA)
            ).to.be.revertedWithCustomError(Factory, "IdenticalAddresses");
        });
    });
}
